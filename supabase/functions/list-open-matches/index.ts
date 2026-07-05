// list-open-matches (#150, docs/MULTIPLAYER.md §14 — Phase 4 public match browser):
// POST { limit?, before? } -> { matches: OpenMatchSummary[], nextBefore: string | null }.
//
// The one multiplayer read path that is NOT gated on already holding a seat: any
// authenticated user may discover open, joinable lobbies so they have a `matchId` to
// hand to join-match (which otherwise expects the caller to already know the id).
//
// Access-control choice (#150): a service-role Edge Function returning a hand-picked
// safe projection, rather than loosening the `matches` RLS (`matches_select_seated`)
// or adding a column-safe view/grant. The `matches` table's access model is therefore
// left exactly as it is — no `seed`, no `invite_code`, no full `settings` ever leave
// the server, and private (invite-only) matches are excluded outright.

import { serviceClient, requireUserId, type Db } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import type { MatchSettings } from '../_shared/match.ts'
import {
  clampOpenMatchLimit,
  OPEN_MATCH_PAGE_MAX,
  selectOpenMatches,
  type OpenMatchSummary,
} from '@aop/shared'

// Over-fetch factor: full and private lobbies are dropped after the SQL read, so we
// pull a few pages' worth of candidates to avoid underfilling a page. Open lobbies are
// a small, short-lived set, so this stays comfortably bounded.
const RAW_FETCH_LIMIT = OPEN_MATCH_PAGE_MAX * 4

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    await requireUserId(req) // any authenticated user; no seat required
    const body = (await req.json().catch(() => ({}))) as { limit?: unknown; before?: unknown }
    const limit = body.limit === undefined ? undefined : Number(body.limit)
    const before = typeof body.before === 'string' ? body.before : null

    const db = serviceClient()

    let query = db
      .from('matches')
      .select('id, settings, created_at')
      .eq('status', 'lobby')
      .order('created_at', { ascending: false })
      .limit(RAW_FETCH_LIMIT)
    if (before) query = query.lt('created_at', before)
    const { data: rows, error } = await query
    if (error) throw new AppError('INTERNAL', error.message)

    const candidates = rows ?? []
    const counts = await seatCounts(
      db,
      candidates.map((r) => r.id),
    )

    const summaries: OpenMatchSummary[] = []
    for (const r of candidates) {
      const settings = r.settings as unknown as MatchSettings
      if (settings.private) continue // never surface invite-only lobbies in the public browser
      summaries.push({
        matchId: r.id,
        mapSize: settings.mapSize,
        maxPlayers: settings.maxPlayers,
        playerCount: counts.get(r.id) ?? 0,
        turnTimerSeconds: settings.turnTimerSeconds,
        createdAt: r.created_at,
      })
    }

    const matches = selectOpenMatches(summaries, { limit, before })
    // A full page means there may be more; hand back a keyset cursor. A short page is
    // the end of the list, so no cursor.
    const nextBefore =
      matches.length === clampOpenMatchLimit(limit) ? matches[matches.length - 1]!.createdAt : null

    return jsonResponse({ matches, nextBefore })
  } catch (err) {
    return errorResponse(err)
  }
})

/**
 * Occupied-seat count per match, in one query. join-match treats a seat as taken
 * whether it holds a human or an AI, so fullness counts every `match_players` row —
 * a lobby with all seats filled (even by AI) is not joinable.
 */
async function seatCounts(db: Db, matchIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (matchIds.length === 0) return counts
  const { data, error } = await db.from('match_players').select('match_id').in('match_id', matchIds)
  if (error) throw new AppError('INTERNAL', error.message)
  for (const row of data ?? []) {
    counts.set(row.match_id, (counts.get(row.match_id) ?? 0) + 1)
  }
  return counts
}
