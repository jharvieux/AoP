// Turn-notification push dispatch (#158): sends a push notification to the
// newly-active seat's device(s) via FCM (Android) / APNs (iOS) whenever a turn
// advances, using the tokens the client registered through `push_tokens` (#157,
// `supabase/migrations/20260705000003_push_tokens.sql`).
//
// Wired into `_shared/match.ts` at every point a turn advances onto a new seat
// (a human's own action, an auto-played AI/`ai_takeover` seat's turn, and the
// `sweep-turns` timer skip — all of which funnel through `submitActionInternal`)
// — the same points that already fire `broadcastTurn`.
//
// Credentials live in Deno env vars, read lazily at call time — matching the
// `CRON_SECRET` convention in `compact-snapshots/index.ts` — rather than the
// Postgres-side Vault pattern in `20260705000000_cron_schedules.sql`. Vault
// exists there so a *cron job* can authenticate *to* an Edge Function; these
// credentials are used *by* the Edge Function itself to call out to
// Google/Apple, so there is no SQL-side consumer and no reason to route them
// through Postgres.
//
//   FCM_SERVER_KEY  - legacy FCM HTTP API server key
//   APNS_AUTH_KEY   - PEM-encoded (PKCS8) .p8 APNs auth key contents
//   APNS_KEY_ID     - the above key's key id
//   APNS_TEAM_ID    - Apple Developer team id
//   APNS_BUNDLE_ID  - app bundle id (sent as apns-topic)
//   APNS_ENV        - "production" (default) | "sandbox"
//
// If none of these are set — true of every environment this was developed and
// tested in, since real FCM/APNs credentials and devices are not available
// here — dispatch logs and no-ops rather than throwing. Live push delivery is
// therefore UNVERIFIED in this environment; see the PR description. What *is*
// covered by tests (`apps/web/src/multiplayer/turnPush.test.ts`, importing
// `@aop/shared/push` by its relative path the way `stripeEdge.test.ts` does for
// `@aop/shared/stripe`): the pure recipient-selection logic, the FCM/APNs
// request-shape construction, the APNs JWT signer, and this module's
// failure-isolation behavior via mocked `fetch`/DB calls.

import {
  deliverableTokens,
  dispatchPush,
  turnNotificationRecipient,
  type PushCredentials,
  type StoredPushToken,
  type TurnSeat,
} from '@aop/shared/push'
import type { Db } from './client.ts'

// deno-lint-ignore no-explicit-any
const denoEnv = (key: string): string | undefined => (globalThis as any).Deno?.env.get(key)

function readCredentials(): PushCredentials {
  const credentials: PushCredentials = {}

  const serverKey = denoEnv('FCM_SERVER_KEY')
  if (serverKey) credentials.fcm = { serverKey }

  const authKeyPem = denoEnv('APNS_AUTH_KEY')
  const keyId = denoEnv('APNS_KEY_ID')
  const teamId = denoEnv('APNS_TEAM_ID')
  const bundleId = denoEnv('APNS_BUNDLE_ID')
  if (authKeyPem && keyId && teamId && bundleId) {
    credentials.apns = {
      authKeyPem,
      keyId,
      teamId,
      bundleId,
      host: denoEnv('APNS_ENV') === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com',
    }
  }

  return credentials
}

/**
 * Best-effort push dispatch for a turn that just started on `currentSeat`.
 * Never throws: every failure mode (no credentials configured, a `push_tokens`
 * read error, an expired/invalid device token, a network error talking to
 * FCM/APNs) is caught and logged here, so a push failure can never fail or
 * roll back the turn-advance transaction that triggered it — every call site
 * in `_shared/match.ts` invokes this only after its own writes have already
 * committed.
 *
 * "Don't spam" note: this always sends when it becomes a seat's turn, even if
 * that player currently has an open Realtime connection to the match. A push
 * is harmless when the app is foregrounded (the OS/app can suppress or dedupe
 * it), and suppressing pushes for "probably online" players would need
 * presence tracking this codebase doesn't have, and would risk silently
 * dropping the notification for someone who is connected but backgrounded
 * (phone locked, tab unfocused) — exactly who most needs the nudge.
 * Always-send is the simpler and safer default.
 */
export async function dispatchTurnPush(
  db: Db,
  matchId: string,
  seats: readonly TurnSeat[],
  currentSeat: number,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    const recipient = turnNotificationRecipient(seats, currentSeat)
    if (!recipient) return

    const credentials = readCredentials()
    if (!credentials.fcm && !credentials.apns) return

    const { data, error } = await db
      .from('push_tokens')
      .select('platform, token')
      .eq('user_id', recipient.userId)
    if (error) {
      console.error(
        `Turn push: could not read push_tokens for user ${recipient.userId}: ${error.message}`,
      )
      return
    }

    const tokens = deliverableTokens((data ?? []) as StoredPushToken[])
    for (const token of tokens) {
      const result = await dispatchPush(
        fetchImpl,
        token,
        { matchId, seat: currentSeat },
        credentials,
      )
      if (!result.ok) {
        console.error(
          `Turn push failed for user ${recipient.userId} (${token.platform}): ${result.error ?? result.status}`,
        )
      }
    }
  } catch (err) {
    console.error(`Turn push dispatch threw for match ${matchId} seat ${currentSeat}:`, err)
  }
}
