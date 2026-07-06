// probe-boarding (#285, docs/MULTIPLAYER.md §7/§9): POST
// { matchId, captainId, targetCaptainId, attackerOrders?, commands } ->
// { kind: 'awaitingCommand', view } | { kind: 'resolved', report }.
//
// The multiplayer analog of single-player's local `probeBoardingBattle` call
// (`apps/web/src/boardingPlanner.ts`): a client has no `GameState`/`rngState`
// to simulate a boarding melee against (§7 — the RNG never leaves the
// server), so this is the server-side probe loop that gives a multiplayer
// attacker the same interactive `BoardingCommandSheet` a single-player
// battle gets. Read-only — it never appends to the action log or advances
// the match; the caller submits the recorded plan for real afterward via
// `submit-action`'s `attackCaptain.boardCommands`, which re-validates
// everything from scratch through the normal authoritative path.

import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { callerSeat, probeBoarding, sanitizeProbeBoardingParams } from '../_shared/match.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as { matchId?: string }
    if (!body.matchId) throw new AppError('BAD_REQUEST', 'matchId is required')

    const db = serviceClient()
    const seat = await callerSeat(db, body.matchId, userId)
    const params = sanitizeProbeBoardingParams(body)

    const outcome = await probeBoarding(db, body.matchId, seat, params)
    return jsonResponse(outcome)
  } catch (err) {
    return errorResponse(err)
  }
})
