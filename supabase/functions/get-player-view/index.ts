// get-player-view (docs/MULTIPLAYER.md §5, §7, §12): POST { matchId } ->
// { seq, seat, role, view, turnDeadline }. THE anti-cheat boundary: the only path by which
// any game state leaves the server, and it leaves fog-filtered to the caller's seat.
// Clients never receive a full GameState — `playerView` strips rngState, the seed, and
// every hidden entity before serialization. Also the reconnect/resync path (§9), and the
// live-spectate path (#148, §12): a granted spectator resolves to exactly one pinned seat
// (`viewerSeat`) and is fed through the SAME `playerView` filter a real player uses, so a
// spectator's response is byte-identical to what that seat's own player would receive.

import { playerView } from '@aop/engine'
import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { reconstructState, seatPlayerId, viewerSeat } from '../_shared/match.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const { matchId } = (await req.json().catch(() => ({}))) as { matchId?: string }
    if (!matchId) throw new AppError('BAD_REQUEST', 'matchId is required')

    const db = serviceClient()
    const { seat, role } = await viewerSeat(db, matchId, userId)

    const { data: match, error } = await db
      .from('matches')
      .select('status, action_count, turn_deadline')
      .eq('id', matchId)
      .maybeSingle()
    if (error) throw new AppError('INTERNAL', error.message)
    if (!match) throw new AppError('NOT_FOUND', 'No such match')
    if (match.status === 'lobby') throw new AppError('MATCH_STATE', 'Match has not started')

    const state = await reconstructState(db, matchId, match.action_count)
    return jsonResponse({
      seq: match.action_count,
      seat,
      role,
      view: playerView(state, seatPlayerId(seat)),
      turnDeadline: match.turn_deadline,
    })
  } catch (err) {
    return errorResponse(err)
  }
})
