// end-turn (docs/MULTIPLAYER.md §5): POST { matchId } -> { seq, view }. A thin wrapper
// that submits the engine `endTurn` action through the same authoritative pipeline as
// submit-action, so turn advance, AI auto-play (§6), snapshots and timers all run once.

import { playerView } from '@aop/engine'
import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { callerSeat, seatPlayerId, submitAction } from '../_shared/match.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const { matchId } = (await req.json().catch(() => ({}))) as { matchId?: string }
    if (!matchId) throw new AppError('BAD_REQUEST', 'matchId is required')

    const db = serviceClient()
    const seat = await callerSeat(db, matchId, userId)
    const { seq, state } = await submitAction(db, matchId, seat, {
      type: 'endTurn',
      playerId: seatPlayerId(seat),
    })
    return jsonResponse({ seq, view: playerView(state, seatPlayerId(seat)) })
  } catch (err) {
    return errorResponse(err)
  }
})
