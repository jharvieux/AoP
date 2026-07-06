// compact-snapshots (docs/MULTIPLAYER.md §10, #143, #226):
// POST { matchId?, roundsPerSnapshot?, chatRetentionDays? }
// -> { matchesProcessed, totalDeleted, results, chatPurge }. A maintenance job that trims
// each active match's snapshot history to the §10 keep-set (snapshot 0, the two newest, and
// one per N rounds), trims each *finished* match's snapshots down to just genesis + final
// (#226), and purges match_chat for matches finished more than the retention window ago.
// The action log is left untouched throughout, so reconstruction stays byte-identical.
//
// Not a player-facing endpoint: it never leaves game state and it deletes rows, so it is
// gated by a shared secret rather than a user JWT. The caller (a scheduler — cron wiring is
// out of scope for #143) must send `Authorization: Bearer <CRON_SECRET>`; the function fails
// closed if CRON_SECRET is unset. Deletes are safe against a concurrent submit-action via the
// per-match seq guard in _shared/compaction.ts.

import { serviceClient } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { compactSnapshots, purgeExpiredChat } from '../_shared/compaction.ts'

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
      chatRetentionDays?: number
    }

    const rounds = body.roundsPerSnapshot
    if (rounds !== undefined && (!Number.isInteger(rounds) || rounds < 1)) {
      throw new AppError('BAD_REQUEST', 'roundsPerSnapshot must be a positive integer')
    }
    const chatRetentionDays = body.chatRetentionDays
    if (
      chatRetentionDays !== undefined &&
      (!Number.isInteger(chatRetentionDays) || chatRetentionDays < 1)
    ) {
      throw new AppError('BAD_REQUEST', 'chatRetentionDays must be a positive integer')
    }

    const db = serviceClient()
    const summary = await compactSnapshots(db, {
      matchId: body.matchId,
      roundsPerSnapshot: rounds,
    })
    // #226: chat retention runs match-id-agnostic (it targets old *finished*
    // matches by age, not the current request's matchId), so it applies on
    // every invocation regardless of whether a single-match compaction was
    // requested.
    const chatPurge = await purgeExpiredChat(db, { retentionDays: chatRetentionDays })
    return jsonResponse({ ...summary, chatPurge })
  } catch (err) {
    return errorResponse(err)
  }
})
