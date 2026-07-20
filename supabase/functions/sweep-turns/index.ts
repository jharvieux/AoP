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
import { mapWithConcurrency } from '../_shared/concurrency.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { findExpiredTurns, isExpectedSweepRace, skipExpiredTurn } from '../_shared/match.ts'
import { findExpiredBattleSessions, forceResolveExpiredSession } from '../_shared/battleSession.ts'

// Each expired match runs a whole authoritative pipeline (multi-statement writes
// through the same path as submit-action). Process a few at a time rather than
// one-at-a-time — but never all at once: an unbounded fan-out would open one
// transaction per match simultaneously against the shared pgbouncer pool on the
// multiplayer authority surface (pool exhaustion). Matches are mutually
// independent (distinct match_id, each with its own seq guard), so a small fixed
// width is safe; the battle phase still fully precedes the turn phase (§2.2).
const MATCH_PIPELINE_CONCURRENCY = 6

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
    const expiredBattles = await findExpiredBattleSessions(db)
    const battlesResolved: BattleSweepResult[] = await mapWithConcurrency(
      expiredBattles,
      MATCH_PIPELINE_CONCURRENCY,
      async (matchId): Promise<BattleSweepResult> => {
        try {
          const seq = await forceResolveExpiredSession(db, matchId)
          return { matchId, resolved: true, seq }
        } catch (err) {
          if (!isExpectedSweepRace(err)) {
            console.error(`sweep-turns: unexpected error resolving battle in match ${matchId}`, err)
          }
          return {
            matchId,
            resolved: false,
            reason: err instanceof AppError ? err.code : 'INTERNAL',
          }
        }
      },
    )

    const expired = await findExpiredTurns(db)
    const results: SweepResult[] = await mapWithConcurrency(
      expired,
      MATCH_PIPELINE_CONCURRENCY,
      async ({ matchId, seat }): Promise<SweepResult> => {
        try {
          const { seq } = await skipExpiredTurn(db, matchId, seat)
          return { matchId, seat, skipped: true, seq }
        } catch (err) {
          // A concurrent human submission or another sweep pass already resolved
          // this match's turn between our read and this call — not a failure.
          // An unexpected error (e.g. #216's wedged-match scenario) must also
          // never abort the batch: log it loudly and keep sweeping the rest
          // (#225) — one poisoned match must never starve every match sorted
          // after it.
          if (!isExpectedSweepRace(err)) {
            console.error(
              `sweep-turns: unexpected error skipping match ${matchId} seat ${seat}`,
              err,
            )
          }
          return {
            matchId,
            seat,
            skipped: false,
            reason: err instanceof AppError ? err.code : 'INTERNAL',
          }
        }
      },
    )

    return jsonResponse(req, { swept: results, battlesResolved })
  } catch (err) {
    return errorResponse(req, err)
  }
})
