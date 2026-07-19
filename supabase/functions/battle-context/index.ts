// battle-context (docs/design/multiplayer-tactical-probe.md §10.7): POST { matchId } ->
// { outcome }. A read-only per-seat context fetch for a participant who never saw (or lost)
// the battle-open/battle-round response — the interactive defender picking up an in-progress
// battle, or either seat on reconnect. Records nothing; returns the caller-side outcome.

import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { callerSeat } from '../_shared/match.ts'
import { battleContext } from '../_shared/battleSession.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as { matchId?: string }
    if (!body.matchId) throw new AppError('BAD_REQUEST', 'matchId is required')

    const db = serviceClient()
    const seat = await callerSeat(db, body.matchId, userId)
    const outcome = await battleContext(db, body.matchId, seat)
    return jsonResponse(req, { outcome })
  } catch (err) {
    return errorResponse(req, err)
  }
})
