/**
 * Leaderboards (#154): a ranked, paged read of `player_ratings` (#151/#152).
 *
 * Scope decision — "seasonal": the issue title implies a leaderboard that resets
 * periodically, but `player_ratings` has no season dimension at all — it holds one
 * ongoing Elo rating per player, and neither docs/ARCHITECTURE.md nor
 * docs/MULTIPLAYER.md describes a season model. A real season needs a length, a
 * boundary, and a reset behavior (hard reset to {@link DEFAULT_RATING}? decay toward
 * the mean? a soft partial reset?) that is a product decision, not this issue's to
 * invent. So v1 ships a single always-on leaderboard over the one rating column that
 * exists today; season support (schema + rollover mechanics) is deferred until that
 * decision is made, tracked as a follow-up rather than guessed at here.
 *
 * This module is the pure ranking/pagination policy, mirroring the split
 * `selectOpenMatches`/`clampOpenMatchLimit` (#150) established between pure logic
 * here and I/O in the Edge Function (`get-leaderboard`).
 */

import type { PlayerRating } from './rating'

/** A rated player row after the `player_ratings` <-> `profiles` join the
 * `get-leaderboard` Edge Function performs, before ranking. */
export interface LeaderboardCandidate extends PlayerRating {
  userId: string
  /** `profiles.display_name` — the only other column ever joined in; nothing else
   * from `profiles` is exposed on the leaderboard. */
  displayName: string
}

/** One ranked leaderboard row, as returned to a client. */
export interface LeaderboardEntry extends LeaderboardCandidate {
  /** 1-based rank across the *whole* candidate set, assigned before paging — a
   * second page never silently restarts numbering at 1. */
  rank: number
}

/** Hard cap on one leaderboard page — top N players, not a full directory dump. */
export const LEADERBOARD_PAGE_MAX = 100

/** Clamp a requested page size into `1..LEADERBOARD_PAGE_MAX`; undefined/invalid -> the max. */
export function clampLeaderboardLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return LEADERBOARD_PAGE_MAX
  return Math.min(Math.max(1, Math.floor(limit)), LEADERBOARD_PAGE_MAX)
}

/**
 * Highest rating first; `userId` ascending as a deterministic tiebreaker for players
 * tied on rating. Chosen over `matchesPlayed` (which would reward/punish activity
 * rather than skill) or insertion order (not stable across a re-query) — a plain,
 * arbitrary-but-fixed key keeps the ordering total and reproducible, which matters
 * because {@link buildLeaderboard} assigns `rank` from this exact order. Mirrors the
 * `ORDER BY rating DESC, user_id ASC` the Edge Function's query should use, so a
 * DB-side `LIMIT` and this function agree on which rows are "the top N".
 */
function compareCandidates(a: LeaderboardCandidate, b: LeaderboardCandidate): number {
  if (a.rating !== b.rating) return b.rating - a.rating
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
}

/**
 * Rank and page a leaderboard candidate list (#154). Pure so the ordering, tiebreak,
 * and page-size policy are unit-tested without a live Supabase stack. Sorts the full
 * candidate set, assigns 1-based `rank`, then slices to {@link clampLeaderboardLimit}.
 */
export function buildLeaderboard(
  candidates: readonly LeaderboardCandidate[],
  limit?: number,
): LeaderboardEntry[] {
  const ranked = [...candidates].sort(compareCandidates).map((c, i) => ({ ...c, rank: i + 1 }))
  return ranked.slice(0, clampLeaderboardLimit(limit))
}
