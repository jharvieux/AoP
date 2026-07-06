// submit-action (docs/MULTIPLAYER.md §5.4): POST { matchId, expectedSeq, action } ->
// { seq, view }. The single choke point where a proposed Action is validated through
// the engine and appended to the log. The caller's seat comes from their JWT; the
// action's playerId is overwritten from it (§11 forged-action mitigation).

import { playerView, type Action } from '@aop/engine'
import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { assertExpectedSeq, callerSeat, seatPlayerId, submitAction } from '../_shared/match.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as {
      matchId?: string
      expectedSeq?: number
      action?: Action
    }
    if (!body.matchId) throw new AppError('BAD_REQUEST', 'matchId is required')
    if (!body.action || typeof body.action.type !== 'string') {
      throw new AppError('BAD_REQUEST', 'action is required')
    }
    if (!Number.isInteger(body.expectedSeq)) {
      throw new AppError('BAD_REQUEST', 'expectedSeq is required')
    }

    const db = serviceClient()
    const seat = await callerSeat(db, body.matchId, userId)

    await assertExpectedSeq(db, body.matchId, body.expectedSeq!)

    const { seq, state } = await submitAction(db, body.matchId, seat, body.action)
    return jsonResponse({ seq, view: playerView(state, seatPlayerId(seat)) })
  } catch (err) {
    return errorResponse(err)
  }
})
