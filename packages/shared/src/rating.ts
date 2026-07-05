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
