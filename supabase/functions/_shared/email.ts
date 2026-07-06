// Offline turn-notification email dispatch (#132, docs/MULTIPLAYER.md §6):
// when a turn advances onto a human seat whose player hasn't been seen in 15+
// minutes (`match_players.last_seen_at`, bumped by `get-player-view` and by
// the seat's own submissions), email them via Resend. Sibling of `push.ts`
// (#158) and wired into `_shared/match.ts` at the same post-turn call sites.
//
// The pure logic — offline gating, request shape, the never-throwing send —
// lives in `@aop/shared/email` and is covered by
// `apps/web/src/multiplayer/turnEmail.test.ts`; this wrapper owns the I/O
// (env, DB reads, the auth-admin address lookup) and the failure-isolation
// contract.
//
// Secrets, read lazily at call time (the `_shared/push.ts` convention):
//
//   RESEND_API_KEY      - Resend API key (operator-set edge-function secret).
//                         ABSENT in every environment this was developed in —
//                         live delivery is therefore UNVERIFIED; the dispatch
//                         logs loudly and degrades to the Realtime poke/push.
//   RESEND_FROM_ADDRESS - verified sender; defaults to Resend's onboarding
//                         sender, which only delivers to the account owner —
//                         fine for smoke tests, wrong for production.
//
// The recipient's address comes from `auth.users` via the service-role admin
// API at send time — contact data never touches game tables or player views.

import { buildTurnEmailRequest, isOfflineForEmail, sendEmail } from '@aop/shared/email'
import { turnNotificationRecipient, type TurnSeat } from '@aop/shared/push'
import type { Db } from './client.ts'

// deno-lint-ignore no-explicit-any
const denoEnv = (key: string): string | undefined => (globalThis as any).Deno?.env.get(key)

const DEFAULT_FROM = 'Age of Plunder <onboarding@resend.dev>'

/**
 * Best-effort "your turn" email for a turn that just started on `currentSeat`.
 * Never throws — same contract as `dispatchTurnPush`: every failure mode (no
 * key configured, a DB read error, no address on the account, Resend being
 * down) is caught and logged here, so an email failure can never fail or roll
 * back the committed turn-advance that triggered it. Sent only when the seat
 * is human-controlled AND its player is offline per the §6 15-minute
 * `last_seen_at` window — an online player already got the Realtime poke.
 */
export async function dispatchTurnEmail(
  db: Db,
  matchId: string,
  seats: readonly TurnSeat[],
  currentSeat: number,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    const recipient = turnNotificationRecipient(seats, currentSeat)
    if (!recipient) return

    const { data: row, error } = await db
      .from('match_players')
      .select('last_seen_at')
      .eq('match_id', matchId)
      .eq('seat', currentSeat)
      .maybeSingle()
    if (error) {
      console.error(
        `Turn email: could not read last_seen_at for match ${matchId} seat ${currentSeat}: ${error.message}`,
      )
      return
    }
    if (!isOfflineForEmail(row?.last_seen_at ?? null, Date.now())) return

    const apiKey = denoEnv('RESEND_API_KEY')
    if (!apiKey) {
      // Fail loud (#132): the offline player will get no nudge at all until
      // the operator provisions the secret. Not thrown — the turn already
      // committed and the push/Realtime channels still fire.
      console.error(
        `Turn email: RESEND_API_KEY is not set — offline notification for match ${matchId} seat ${currentSeat} NOT sent`,
      )
      return
    }

    const { data: userData, error: userError } = await db.auth.admin.getUserById(recipient.userId)
    if (userError || !userData.user?.email) {
      console.error(
        `Turn email: no address for user ${recipient.userId}: ${userError?.message ?? 'account has no email'}`,
      )
      return
    }

    const request = buildTurnEmailRequest(
      {
        to: userData.user.email,
        from: denoEnv('RESEND_FROM_ADDRESS') ?? DEFAULT_FROM,
        matchId,
        seat: currentSeat,
      },
      apiKey,
    )
    const result = await sendEmail(fetchImpl, request)
    if (!result.ok) {
      console.error(
        `Turn email failed for user ${recipient.userId} (match ${matchId}): ${result.error ?? result.status}`,
      )
    }
  } catch (err) {
    console.error(`Turn email dispatch threw for match ${matchId} seat ${currentSeat}:`, err)
  }
}
