/**
 * Ratings foundation (#151): pure Elo rating-math, no I/O.
 *
 * Algorithm choice: Elo, not Glicko. Both are well-understood; Elo was picked because
 * it needs only a single number per player (`rating`) and a fixed K-factor — Glicko's
 * extra rating-deviation term buys faster convergence for infrequent players but adds a
 * second persisted field and a time-decay component, neither of which this issue's
 * schema (`player_ratings.rating`, `matches_played`) needs. If provisional-player
 * convergence ever becomes a problem, Glicko is the natural upgrade path; nothing here
 * blocks it.
 *
 * This module only computes new ratings from old ones plus a match result — it never
 * reads or writes the `player_ratings` table. Wiring it into the match-finish flow is
 * #152's job; leaderboards are #154.
 */

/** A player's rating state, exactly the columns `player_ratings` persists. */
export interface PlayerRating {
  rating: number
  matchesPlayed: number
}

/** The rating a brand-new player starts at before playing a single rated match. */
export const DEFAULT_RATING = 1500

/**
 * Standard Elo K-factor: the maximum rating swing from a single match. 32 is the
 * classic default (used by FIDE for sub-2400 players) — big enough that ratings move
 * meaningfully within a few dozen matches, small enough that one upset doesn't
 * dominate a player's history. Fixed rather than tiered by `matchesPlayed` to keep the
 * function's output a pure function of its arguments; a provisional-player boost (e.g.
 * FIDE's higher K for new players) is a documented possible future extension, not
 * needed for this issue.
 */
export const DEFAULT_K_FACTOR = 32

export type MatchResult = 'a_win' | 'b_win' | 'draw'

/**
 * The actual score used in the Elo update formula: 1 for a win, 0 for a loss, 0.5 for
 * a draw, from `a`'s perspective.
 */
function actualScoreForA(result: MatchResult): number {
  if (result === 'a_win') return 1
  if (result === 'b_win') return 0
  return 0.5
}

/**
 * The Elo expected score for a player rated `ratingSelf` against an opponent rated
 * `ratingOpponent`: the probability (as a fraction in [0, 1]) that the self player
 * wins, treating a draw as half a win. Symmetric: `expectedScore(x, y) === 1 -
 * expectedScore(y, x)`.
 */
export function expectedScore(ratingSelf: number, ratingOpponent: number): number {
  return 1 / (1 + 10 ** ((ratingOpponent - ratingSelf) / 400))
}

/**
 * Applies one match result to a pair of ratings and returns the updated pair. Pure and
 * deterministic: same inputs always produce the same output, and neither input object
 * is mutated.
 *
 * New ratings are rounded to the nearest integer (matching the `player_ratings.rating`
 * int column) so a value read back from storage and fed in again round-trips exactly —
 * an unrounded float would drift a fraction of a point on every call for no benefit,
 * since Elo's precision doesn't warrant it.
 *
 * `matchesPlayed` is incremented by 1 for both players regardless of outcome, including
 * draws. First-time players need no special case: a caller with no rating history for a
 * user simply passes `{ rating: DEFAULT_RATING, matchesPlayed: 0 }`, and the standard
 * formula handles it like any other match.
 */
export function applyRatingUpdate(
  ratings: { a: PlayerRating; b: PlayerRating },
  result: MatchResult,
  kFactor: number = DEFAULT_K_FACTOR,
): { a: PlayerRating; b: PlayerRating } {
  const { a, b } = ratings
  const expectedA = expectedScore(a.rating, b.rating)
  const actualA = actualScoreForA(result)

  const deltaA = kFactor * (actualA - expectedA)

  return {
    a: { rating: Math.round(a.rating + deltaA), matchesPlayed: a.matchesPlayed + 1 },
    b: { rating: Math.round(b.rating - deltaA), matchesPlayed: b.matchesPlayed + 1 },
  }
}

/**
 * One seat in a finished match, as far as rating cares (#152). `userId` is the
 * real authenticated player who held the seat, or `null` for an AI seat
 * (`match_players.user_id is null`, docs/MULTIPLAYER.md §3). `won` marks the one
 * seat the engine declared the winner.
 */
export interface RatedSeat {
  userId: string | null
  won: boolean
}

/**
 * Translate a finished free-for-all match (2–8 seats) into per-player Elo
 * updates, applying the pairwise {@link expectedScore} primitive across the
 * seats. Returns a map `userId -> updated rating` for every *rated* seat.
 *
 * Multi-player → pairwise model: the engine records only a single `winnerId`
 * (the last seat standing) and no elimination order (see reducer.ts
 * `settleEliminations`), so the one ranking signal a finished match carries is
 * "winner beat everyone else; the rest are indistinguishable". We model that as
 * a round-robin in which the winner beats each other seat and all non-winners
 * are tied with one another — and since tie games between equally-ranked losers
 * carry no signal to resolve (and there is no order to resolve them by), the
 * only rated games are winner-vs-each-loser pairs. Concretely:
 *   - each loser plays exactly one rated game, a loss to the winner;
 *   - the winner plays one rated game per loser (a win), and its net change is
 *     the sum of those pairwise deltas measured against its *pre-match* rating,
 *     so the outcome is independent of the order losers are listed in;
 *   - `matchesPlayed` increments by exactly 1 for every rated seat — the match
 *     counts once per player, never once per pairwise comparison.
 * The winner's delta is summed from {@link expectedScore} directly rather than
 * by chaining {@link applyRatingUpdate} per loser, which would wrongly increment
 * `matchesPlayed` N−1 times and compound rounding between pairs. For a 2-seat
 * match this reduces exactly to a single `applyRatingUpdate(..., 'a_win')`.
 *
 * Exclusions and no-ops (rating unchanged, `matchesPlayed` still +1 for every
 * rated seat, because they did play a match):
 *   - AI seats (`userId === null`) are dropped entirely — they neither earn nor
 *     confer rating, so beating or losing to one moves nothing.
 *   - If no rated seat won (a mutual-elimination draw, or an AI seat took the
 *     win), there is no winner-vs-loser pair, so no rating moves.
 *   - A lone rated seat (everyone else was AI) has no rated opponent, so its
 *     rating holds.
 *
 * A seat with no existing row is an unrated first-time player: the caller passes
 * no entry for them in `currentRatings` and this defaults them to
 * {@link DEFAULT_RATING} at 0 matches played.
 */
export function computeMatchRatingUpdates(
  seats: readonly RatedSeat[],
  currentRatings: ReadonlyMap<string, PlayerRating>,
  kFactor: number = DEFAULT_K_FACTOR,
): Map<string, PlayerRating> {
  const rated = seats.filter((s): s is RatedSeat & { userId: string } => s.userId !== null)
  const ratingOf = (userId: string): PlayerRating =>
    currentRatings.get(userId) ?? { rating: DEFAULT_RATING, matchesPlayed: 0 }

  const played = (userId: string): PlayerRating => {
    const cur = ratingOf(userId)
    return { rating: cur.rating, matchesPlayed: cur.matchesPlayed + 1 }
  }

  const result = new Map<string, PlayerRating>()
  const winner = rated.find((s) => s.won)
  const losers = rated.filter((s) => !s.won)

  // No rated winner, or a winner with no rated opponents: nobody's rating can
  // move, but every rated seat still played one match.
  if (!winner || losers.length === 0) {
    for (const s of rated) result.set(s.userId, played(s.userId))
    return result
  }

  const winnerRating = ratingOf(winner.userId)
  let winnerDelta = 0
  for (const loser of losers) {
    const loserRating = ratingOf(loser.userId)
    winnerDelta += kFactor * (1 - expectedScore(winnerRating.rating, loserRating.rating))
    const loserDelta = kFactor * (0 - expectedScore(loserRating.rating, winnerRating.rating))
    result.set(loser.userId, {
      rating: Math.round(loserRating.rating + loserDelta),
      matchesPlayed: loserRating.matchesPlayed + 1,
    })
  }
  result.set(winner.userId, {
    rating: Math.round(winnerRating.rating + winnerDelta),
    matchesPlayed: winnerRating.matchesPlayed + 1,
  })
  return result
}
