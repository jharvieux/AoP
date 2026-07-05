// compact-snapshots (docs/MULTIPLAYER.md §10, #143): POST { matchId?, roundsPerSnapshot? }
// -> { matchesProcessed, totalDeleted, results }. A maintenance job that trims each active
// match's snapshot history to the §10 keep-set (snapshot 0, the two newest, and one per N
// rounds), leaving the action log untouched so reconstruction stays byte-identical.
//
// Not a player-facing endpoint: it never leaves game state and it deletes rows, so it is
// gated by a shared secret rather than a user JWT. The caller (a scheduler — cron wiring is
// out of scope for #143) must send `Authorization: Bearer <CRON_SECRET>`; the function fails
// closed if CRON_SECRET is unset. Deletes are safe against a concurrent submit-action via the
// per-match seq guard in _shared/compaction.ts.

import { serviceClient } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { compactSnapshots } from '../_shared/compaction.ts'

function requireCronSecret(req: Request): void {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret) throw new AppError('INTERNAL', 'CRON_SECRET is not configured')
  const header = req.headers.get('Authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  if (token !== secret) throw new AppError('FORBIDDEN', 'Invalid or missing cron secret')
}

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    requireCronSecret(req)
    const body = (await req.json().catch(() => ({}))) as {
      matchId?: string
      roundsPerSnapshot?: number
    }

    const rounds = body.roundsPerSnapshot
    if (rounds !== undefined && (!Number.isInteger(rounds) || rounds < 1)) {
      throw new AppError('BAD_REQUEST', 'roundsPerSnapshot must be a positive integer')
    }

    const db = serviceClient()
    const summary = await compactSnapshots(db, {
      matchId: body.matchId,
      roundsPerSnapshot: rounds,
    })
    return jsonResponse(summary)
  } catch (err) {
    return errorResponse(err)
  }
})
