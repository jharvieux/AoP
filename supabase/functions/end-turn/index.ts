// end-turn (docs/MULTIPLAYER.md §5): POST { matchId, expectedSeq } -> { seq, view }. A thin
// wrapper that submits the engine `endTurn` action through the same authoritative pipeline
// as submit-action, so turn advance, AI auto-play (§6), snapshots and timers all run once.
// expectedSeq is the same optimistic-concurrency token submit-action requires (#232): the
// caller's last-seen seq, rejected as SEQ_CONFLICT when the match has advanced past it.

import { playerView } from '@aop/engine'
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
    }
    if (!body.matchId) throw new AppError('BAD_REQUEST', 'matchId is required')
    if (!Number.isInteger(body.expectedSeq)) {
      throw new AppError('BAD_REQUEST', 'expectedSeq is required')
    }

    const db = serviceClient()
    const seat = await callerSeat(db, body.matchId, userId)
    await assertExpectedSeq(db, body.matchId, body.expectedSeq!)

    const { seq, state } = await submitAction(db, body.matchId, seat, {
      type: 'endTurn',
      playerId: seatPlayerId(seat),
    })
    return jsonResponse({ seq, view: playerView(state, seatPlayerId(seat)) })
  } catch (err) {
    return errorResponse(err)
  }
})
