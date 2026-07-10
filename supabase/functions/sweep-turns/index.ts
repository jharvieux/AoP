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
import { findExpiredTurns, isExpectedSweepRace, skipExpiredTurn } from '../_shared/match.ts'
import { findExpiredBattleSessions, forceResolveExpiredSession } from '../_shared/battleSession.ts'

interface SweepResult {
  matchId: string
  seat: number
  skipped: boolean
  seq?: number
  reason?: string
}

interface BattleSweepResult {
  matchId: string
  resolved: boolean
  seq?: number
  reason?: string
}

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    requireServiceRole(req)
    const db = serviceClient()

    // Force-resolve abandoned interactive battles FIRST (§2.1 step 5): a session past its
    // whole-battle deadline is auto-fought from the orders recorded so far, exactly like
    // battle-auto, BEFORE the turn-skip logic below — otherwise the BATTLE_PENDING guard
    // (§2.2) would block the very endTurn the turn sweep is about to submit. A resolve
    // failure is logged and never aborts the batch, same discipline as the turn sweep.
    const battlesResolved: BattleSweepResult[] = []
    for (const matchId of await findExpiredBattleSessions(db)) {
      try {
        const seq = await forceResolveExpiredSession(db, matchId)
        battlesResolved.push({ matchId, resolved: true, seq })
      } catch (err) {
        if (!isExpectedSweepRace(err)) {
          console.error(`sweep-turns: unexpected error resolving battle in match ${matchId}`, err)
        }
        battlesResolved.push({
          matchId,
          resolved: false,
          reason: err instanceof AppError ? err.code : 'INTERNAL',
        })
      }
    }

    const expired = await findExpiredTurns(db)
    const results: SweepResult[] = []
    for (const { matchId, seat } of expired) {
      try {
        const { seq } = await skipExpiredTurn(db, matchId, seat)
        results.push({ matchId, seat, skipped: true, seq })
      } catch (err) {
        // A concurrent human submission or another sweep pass already resolved
        // this match's turn between our read and this call — not a failure.
        // An unexpected error (e.g. #216's wedged-match scenario) must also
        // never abort the batch: log it loudly and keep sweeping the rest
        // (#225) — one poisoned match must never starve every match sorted
        // after it.
        if (!isExpectedSweepRace(err)) {
          console.error(`sweep-turns: unexpected error skipping match ${matchId} seat ${seat}`, err)
        }
        results.push({
          matchId,
          seat,
          skipped: false,
          reason: err instanceof AppError ? err.code : 'INTERNAL',
        })
      }
    }

    return jsonResponse({ swept: results, battlesResolved })
  } catch (err) {
    return errorResponse(err)
  }
})
