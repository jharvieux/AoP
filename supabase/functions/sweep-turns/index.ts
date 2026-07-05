// sweep-turns (docs/MULTIPLAYER.md §8, #129): POST -> { swept: [...] }. The turn-timer
// sweep: finds every active match whose turn_deadline has passed and server-submits
// endTurn for the expired seat through the same authoritative pipeline as submit-action,
// incrementing that seat's missed_turns and flipping it to ai_takeover once the match's
// missedTurnThreshold is reached (§8's ACTIVE -> SKIPPED -> AI_TAKEOVER state machine).
//
// Idempotent and concurrency-safe: a match is only picked up while turn_deadline is in the
// past, and skipExpiredTurn re-derives the current player from a fresh read, so a human who
// slipped their action in first (or a second, racing sweep run) just gets NOT_YOUR_TURN or
// SEQ_CONFLICT here — harmless, the sweep moves on.
//
// Invocation is a separate concern (#130, cron scheduling) — for now this is a plain
// service-role-gated endpoint, callable manually or by CI/an external scheduler.

import { requireServiceRole, serviceClient } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { findExpiredTurns, skipExpiredTurn } from '../_shared/match.ts'

interface SweepResult {
  matchId: string
  seat: number
  skipped: boolean
  seq?: number
  reason?: string
}

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    requireServiceRole(req)
    const db = serviceClient()

    const expired = await findExpiredTurns(db)
    const results: SweepResult[] = []
    for (const { matchId, seat } of expired) {
      try {
        const { seq } = await skipExpiredTurn(db, matchId, seat)
        results.push({ matchId, seat, skipped: true, seq })
      } catch (err) {
        // A concurrent human submission or another sweep pass already resolved
        // this match's turn between our read and this call — not a failure.
        const handled =
          err instanceof AppError &&
          (err.code === 'NOT_YOUR_TURN' || err.code === 'SEQ_CONFLICT' || err.code === 'MATCH_STATE')
        if (!handled) throw err
        results.push({ matchId, seat, skipped: false, reason: err.code })
      }
    }

    return jsonResponse({ swept: results })
  } catch (err) {
    return errorResponse(err)
  }
})
