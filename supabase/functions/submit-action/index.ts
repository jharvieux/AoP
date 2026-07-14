// submit-action (docs/MULTIPLAYER.md §5.4): POST { matchId, expectedSeq, action } ->
// { seq, view, battleReport?, encounterOutcome? }. The single choke point where a
// proposed Action is validated through the engine and appended to the log. The caller's
// seat comes from their JWT; the action's playerId is overwritten from it (§11
// forged-action mitigation). `battleReport` rides along only when the action was an
// attack (#285) — the caller's own combat outcome, never fog-filtered further since
// fighting an enemy already reveals exactly what was fought. `encounterOutcome` rides
// along only when the action resolved an encounter (#502) — likewise the caller's own
// result and only ever in the caller's own response; every other seat learns nothing
// beyond what its own fog-locked PlayerView already exposes.

import { playerView, type Action } from '@aop/engine'
import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import {
  assertExpectedSeq,
  callerSeat,
  sanitizeAction,
  seatPlayerId,
  submitAction,
} from '../_shared/match.ts'
import { assertNoBattlePending } from '../_shared/battleSession.ts'

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

    // A state-advancing action is blocked while this seat has an interactive battle
    // open (docs/design/multiplayer-tactical-probe.md §2.2): it would advance state
    // underneath the session's recorded prefix and desync it. BATTLE_PENDING.
    await assertNoBattlePending(db, body.matchId, seat)
    await assertExpectedSeq(db, body.matchId, body.expectedSeq!)

    // Structural validation (#206) before the engine sees the payload: whitelist
    // fields per action type, reject NaN/Infinity/fractional numbers and unknown
    // enum values. playerId is overwritten from the caller's seat first (§11),
    // so a missing or forged playerId never reaches validation or the log.
    const action = sanitizeAction({ ...body.action, playerId: seatPlayerId(seat) })

    const { seq, state, battleReport, encounterOutcome } = await submitAction(
      db,
      body.matchId,
      seat,
      action,
    )
    return jsonResponse({
      seq,
      view: playerView(state, seatPlayerId(seat)),
      ...(battleReport ? { battleReport } : {}),
      ...(encounterOutcome ? { encounterOutcome } : {}),
    })
  } catch (err) {
    return errorResponse(err)
  }
})
