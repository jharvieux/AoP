// start-match (docs/MULTIPLAYER.md §5): POST { matchId } -> { seq: 0 }. Creator only.
// Runs createGame from the stored seed/settings, writes the seq-0 snapshot, flips the
// match to `active`, and arms the first turn deadline.

import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { startMatch, type MatchSettings, type StartMatchSeat } from '../_shared/match.ts'
import type { FactionId } from '@aop/shared'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const { matchId } = (await req.json().catch(() => ({}))) as { matchId?: string }
    if (!matchId) throw new AppError('BAD_REQUEST', 'matchId is required')

    const db = serviceClient()
    const { data: match, error } = await db
      .from('matches')
      .select('id, status, seed, settings, created_by')
      .eq('id', matchId)
      .maybeSingle()
    if (error) throw new AppError('INTERNAL', error.message)
    if (!match) throw new AppError('NOT_FOUND', 'No such match')
    if (match.created_by !== userId) throw new AppError('FORBIDDEN', 'Only the creator can start')
    if (match.status !== 'lobby') throw new AppError('MATCH_STATE', `Match is ${match.status}`)
    const settings = match.settings as unknown as MatchSettings

    const { data: seats, error: seatErr } = await db
      .from('match_players')
      .select('seat, user_id, faction')
      .eq('match_id', matchId)
      .order('seat', { ascending: true })
    if (seatErr) throw new AppError('INTERNAL', seatErr.message)
    if (!seats || seats.length < 2)
      throw new AppError('MATCH_STATE', 'Need at least 2 seats to start')

    // Seats must be a dense 0..N-1 block so seat index == engine player index.
    seats.forEach((s, i) => {
      if (s.seat !== i) throw new AppError('MATCH_STATE', 'Seats must be contiguous before start')
    })

    const seatList: StartMatchSeat[] = seats.map((s) => ({
      seat: s.seat,
      userId: s.user_id,
      faction: s.faction as FactionId,
    }))
    await startMatch(db, matchId, Number(match.seed), settings, seatList)

    return jsonResponse({ seq: 0 })
  } catch (err) {
    return errorResponse(err)
  }
})
