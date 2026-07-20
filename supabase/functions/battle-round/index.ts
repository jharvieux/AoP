// battle-round (docs/design/multiplayer-tactical-probe.md §3, §2.1 step 2): POST
// { matchId, expectedOrders, order } -> { outcome }, where order is { tactic } | { boardCommand }.
// Records one order under a per-side length CAS (the caller's seat picks the side), then
// re-runs the probe and returns the next awaiting context — or the resolution when the battle
// finishes. Callable by either the attacker or the (interactive) defender seat; a
// non-participant seat is NOT_A_PARTICIPANT, a stale expectedOrders is ORDERS_CONFLICT.

import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { callerSeat } from '../_shared/match.ts'
import { appendBattleOrder } from '../_shared/battleSession.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as {
      matchId?: string
      expectedOrders?: number
      order?: unknown
    }
    if (!body.matchId) throw new AppError('BAD_REQUEST', 'matchId is required')
    if (!Number.isInteger(body.expectedOrders)) {
      throw new AppError('BAD_REQUEST', 'expectedOrders is required')
    }
    if (body.order === undefined) throw new AppError('BAD_REQUEST', 'order is required')

    const db = serviceClient()
    const seat = await callerSeat(db, body.matchId, userId)
    const outcome = await appendBattleOrder(
      db,
      body.matchId,
      seat,
      body.expectedOrders!,
      body.order,
    )
    return jsonResponse(req, { outcome })
  } catch (err) {
    return errorResponse(req, err)
  }
})
