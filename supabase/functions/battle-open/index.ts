// battle-open (docs/design/multiplayer-tactical-probe.md §3, §2.1 step 1): POST
// { matchId, expectedSeq, captainId, targetCaptainId } -> { seq, outcome }. Opens a binding
// interactive-battle session for an attack the caller's seat is making this turn. Validates
// seat/turn/seq and the attack's preconditions, writes the session row, and returns the first
// probe outcome (round-1 `awaitingTactic`). Idempotent for the same attack (reconnect/resume);
// a different attack while one is open is BATTLE_PENDING.

import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { callerSeat } from '../_shared/match.ts'
import { openBattleSession } from '../_shared/battleSession.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as {
      matchId?: string
      expectedSeq?: number
      captainId?: string
      targetCaptainId?: string
    }
    if (!body.matchId) throw new AppError('BAD_REQUEST', 'matchId is required')
    if (!Number.isInteger(body.expectedSeq)) {
      throw new AppError('BAD_REQUEST', 'expectedSeq is required')
    }
    if (!body.captainId) throw new AppError('BAD_REQUEST', 'captainId is required')
    if (!body.targetCaptainId) throw new AppError('BAD_REQUEST', 'targetCaptainId is required')

    const db = serviceClient()
    const seat = await callerSeat(db, body.matchId, userId)
    const result = await openBattleSession(db, body.matchId, seat, {
      expectedSeq: body.expectedSeq!,
      captainId: body.captainId,
      targetCaptainId: body.targetCaptainId,
    })
    return jsonResponse(result)
  } catch (err) {
    return errorResponse(err)
  }
})
