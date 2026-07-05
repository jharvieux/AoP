// get-leaderboard (#154): POST { limit? } -> { entries: LeaderboardEntry[] }
//
// A ranked, read-only top-N view of `player_ratings` (#151/#152). Any authenticated
// user may call it — same "gated on login, not on holding a seat" model as
// `list-open-matches` (#150) — there is no per-match or per-seat scoping to check.
//
// Scope (#154): a single always-on leaderboard, not a per-season one. `player_ratings`
// has no season dimension and neither docs/ARCHITECTURE.md nor docs/MULTIPLAYER.md
// specifies season boundaries or reset behavior, so inventing one here would be a
// product decision this issue doesn't make. See `@aop/shared/leaderboard.ts` for the
// full reasoning; season support is deferred as a follow-up.
//
// Access-control choice, mirroring #150's reasoning: a service-role Edge Function
// returning a hand-picked safe projection, rather than loosening `player_ratings` RLS
// (`player_ratings_select_own`, read-your-own-row only) or `profiles` RLS
// (`profiles_select_co_participants`, match-scoped only) into a public grant. Only
// `rating`, `matches_played`, and `display_name` are ever selected or returned —
// nothing else from `profiles` (no email, no auth metadata) leaves this function, and
// both tables' RLS policies stay exactly as #151/the base schema left them.

import { serviceClient, requireUserId, type Db } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { buildLeaderboard, clampLeaderboardLimit, type LeaderboardCandidate } from '@aop/shared'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    await requireUserId(req) // any authenticated user; no seat/match scoping needed

    const body = (await req.json().catch(() => ({}))) as { limit?: unknown }
    const limit = body.limit === undefined ? undefined : Number(body.limit)
    const take = clampLeaderboardLimit(limit)

    const db = serviceClient()
    const candidates = await topRatedCandidates(db, take)
    const entries = buildLeaderboard(candidates, limit)

    return jsonResponse({ entries })
  } catch (err) {
    return errorResponse(err)
  }
})

/**
 * The DB-side half of the ranking: `ORDER BY rating DESC, user_id ASC LIMIT take`
 * mirrors {@link buildLeaderboard}'s own tiebreak exactly, so the `take` rows fetched
 * here are provably the true top `take` — `buildLeaderboard` only re-derives the same
 * order to assign `rank`, never widens or narrows the candidate set.
 */
async function topRatedCandidates(db: Db, take: number): Promise<LeaderboardCandidate[]> {
  const { data: rows, error } = await db
    .from('player_ratings')
    .select('user_id, rating, matches_played')
    .order('rating', { ascending: false })
    .order('user_id', { ascending: true })
    .limit(take)
  if (error) throw new AppError('INTERNAL', error.message)

  const userIds = (rows ?? []).map((r) => r.user_id)
  const names = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles, error: profErr } = await db
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds)
    if (profErr) throw new AppError('INTERNAL', profErr.message)
    for (const p of profiles ?? []) names.set(p.id, p.display_name)
  }

  return (rows ?? []).map((r) => ({
    userId: r.user_id,
    displayName: names.get(r.user_id) ?? 'Unknown Pirate',
    rating: r.rating,
    matchesPlayed: r.matches_played,
  }))
}
