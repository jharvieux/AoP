// join-match (docs/MULTIPLAYER.md §5): POST { inviteCode | matchId, faction? } ->
// { matchId, seat }. Seat + faction assignment with conflict rejection, in lobby only.

import { serviceClient, requireUserId, ensureProfile, type Db } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { assertFaction, firstFreeFaction, type MatchSettings } from '../_shared/match.ts'
import { resolveLateJoin, type FactionId } from '@aop/shared'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as {
      inviteCode?: string
      matchId?: string
      faction?: unknown
      displayName?: string
    }
    if (!body.inviteCode && !body.matchId) {
      throw new AppError('BAD_REQUEST', 'Provide inviteCode or matchId')
    }
    const db = serviceClient()
    await ensureProfile(db, userId, body.displayName?.trim() || 'Captain')

    const query = db.from('matches').select('id, status, settings')
    const { data: match, error } = await (
      body.matchId ? query.eq('id', body.matchId) : query.eq('invite_code', body.inviteCode!)
    ).maybeSingle()
    if (error) throw new AppError('INTERNAL', error.message)
    if (!match) throw new AppError('NOT_FOUND', 'No such match')
    if (match.status !== 'lobby')
      throw new AppError('MATCH_STATE', 'Match is no longer open to join')
    const settings = match.settings as unknown as MatchSettings

    const { data: seats, error: seatErr } = await db
      .from('match_players')
      .select('seat, user_id, faction')
      .eq('match_id', match.id)
      .order('seat', { ascending: true })
    if (seatErr) throw new AppError('INTERNAL', seatErr.message)
    const rows = seats ?? []

    const mine = rows.find((r) => r.user_id === userId)
    if (mine) return jsonResponse(req, { matchId: match.id, seat: mine.seat })

    const usedSeats = new Set(rows.map((r) => r.seat))
    let seat = -1
    for (let i = 0; i < settings.maxPlayers; i++) {
      if (!usedSeats.has(i)) {
        seat = i
        break
      }
    }
    if (seat === -1) throw new AppError('MATCH_STATE', 'Match is full')

    const takenFactions = rows.map((r) => r.faction as FactionId)
    let faction: FactionId
    if (body.faction === undefined) {
      faction = firstFreeFaction(takenFactions)
    } else {
      faction = assertFaction(body.faction)
      if (takenFactions.includes(faction)) {
        throw new AppError('INVALID_ACTION', `Faction ${faction} is already taken`)
      }
    }

    const insert = await db
      .from('match_players')
      .insert({ match_id: match.id, seat, user_id: userId, faction, status: 'joined' })
    if (insert.error) {
      // A racing joiner grabbed the seat or faction between our read and write.
      if (insert.error.code === '23505') throw new AppError('MATCH_STATE', 'Seat just taken, retry')
      throw new AppError('INTERNAL', insert.error.message)
    }

    await assertSeatSurvivedStart(db, match.id, seat)
    return jsonResponse(req, { matchId: match.id, seat })
  } catch (err) {
    return errorResponse(req, err)
  }
})

/**
 * Close the join/start race from the joiner's side (#221): the lobby-status
 * check above and the seat insert are separate round-trips, so start-match can
 * freeze the GameState config between them. Re-read the status; if the lobby
 * closed, keep the seat only when the frozen seq-0 snapshot includes it (the
 * pure `resolveLateJoin` decision) — otherwise remove the orphan row and reject,
 * so the caller is never left holding a seat the game doesn't know about.
 * start-match's own post-activation sweep covers the complementary ordering
 * (insert lands after its sweep ran but this recheck never runs, e.g. a crash).
 */
async function assertSeatSurvivedStart(db: Db, matchId: string, seat: number): Promise<void> {
  const { data: after, error } = await db
    .from('matches')
    .select('status')
    .eq('id', matchId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', error.message)
  const status = after?.status ?? 'missing'
  if (status === 'lobby') return

  // The lobby closed mid-join. The activation flip happens only after the seq-0
  // snapshot insert, so a non-lobby status guarantees the snapshot exists.
  const { data: snap, error: snapErr } = await db
    .from('match_snapshots')
    .select('state')
    .eq('match_id', matchId)
    .eq('seq', 0)
    .maybeSingle()
  if (snapErr) throw new AppError('INTERNAL', snapErr.message)
  const frozenCount = ((snap?.state as { players?: unknown[] } | null)?.players ?? []).length

  if (resolveLateJoin(status, seat, frozenCount) === 'evicted') {
    const del = await db.from('match_players').delete().eq('match_id', matchId).eq('seat', seat)
    if (del.error) {
      // The orphan row survives; start-match's sweep or a support path must
      // clean it. Fail the join loudly either way.
      console.error(
        `join-match: could not evict late seat ${seat} of ${matchId}: ${del.error.message}`,
      )
    }
    throw new AppError('MATCH_STATE', 'Match started while you were joining')
  }
}
