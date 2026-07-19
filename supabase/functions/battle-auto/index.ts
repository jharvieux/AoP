// battle-auto (docs/design/multiplayer-tactical-probe.md §3, §2.1 step 4): POST { matchId } ->
// { seq, view, battleReport }. Tactical mode's escape hatch (#305/D-002): force-resolve the
// open battle immediately from the orders recorded so far, letting the engine's deterministic
// fallbacks complete the remainder. Attacker-only (§10.5) — a defender who wants out simply
// stops answering and the sweep/grace fills its tail from standing orders.

import { serviceClient, requireUserId } from '../_shared/client.ts'
import { errorResponse, guardMethod, jsonResponse, AppError } from '../_shared/http.ts'
import { callerSeat } from '../_shared/match.ts'
import { autoResolveBattleSession } from '../_shared/battleSession.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as { matchId?: string }
    if (!body.matchId) throw new AppError('BAD_REQUEST', 'matchId is required')

    const db = serviceClient()
    const seat = await callerSeat(db, body.matchId, userId)
    const { seq, view, battleReport } = await autoResolveBattleSession(db, body.matchId, seat)
    return jsonResponse(req, { seq, view, battleReport })
  } catch (err) {
    return errorResponse(req, err)
  }
})
