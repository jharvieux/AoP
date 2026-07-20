/**
 * Turn-notification push dispatch (#158): the pure request-construction and
 * recipient-selection logic behind sending a push when it becomes a player's
 * turn, built on top of the token storage from #157
 * (`supabase/migrations/20260705000003_push_tokens.sql`).
 *
 * Mirrors the split `stripe.ts` established: everything here uses only
 * Web-standard globals (`crypto.subtle`, `TextEncoder`, `atob`/`btoa`), so it
 * runs unchanged under Deno (the Edge Functions, via the `@aop/shared/push`
 * entry in `supabase/functions/deno.json`) and under Node/Vitest (`apps/web`'s
 * coverage of this file). Deliberately NOT re-exported from `@aop/shared`'s
 * barrel: the engine and content packages typecheck under `lib: ES2022` (no
 * DOM), so pulling `crypto`/`CryptoKey` types into their program would break
 * `pnpm typecheck`. Only the Edge Functions and their tests reach for this
 * module, via its explicit path.
 *
 * I/O (reading `push_tokens`, reading credentials from the environment, and
 * the actual `fetch` calls to FCM/APNs) lives in the Deno-only wrapper
 * `supabase/functions/_shared/push.ts`, which is where `dispatchTurnPush`'s
 * failure-isolation contract is enforced.
 */

export type PushPlatform = 'ios' | 'android' | 'web'

/** A row from `push_tokens`, as read by the Edge Function (camelCase — the
 * Deno wrapper maps the table's snake_case `platform`/`token` columns here). */
export interface StoredPushToken {
  platform: PushPlatform
  token: string
}

export interface TurnPushPayload {
  matchId: string
  /** The seat number now on the clock. */
  seat: number
}

/**
 * Web push tokens are not sent through FCM/APNs — that's the separate Web
 * Push protocol (VAPID + a browser push service), out of scope for #158 —
 * so only tokens that can actually receive an FCM/APNs push are selected.
 * Pure, so "which stored tokens can this dispatch reach" is unit-testable
 * without any I/O.
 */
export function deliverableTokens(tokens: readonly StoredPushToken[]): StoredPushToken[] {
  return tokens.filter(
    (t): t is StoredPushToken & { platform: 'ios' | 'android' } =>
      t.platform === 'ios' || t.platform === 'android',
  )
}

/** The minimal seat-shape `turnNotificationRecipient` needs — deliberately not
 * the Edge Function's DB row type (`SeatRow` in `_shared/match.ts`), so this
 * stays a plain-data pure function the Vitest suite can call directly. */
export interface TurnSeat {
  seat: number
  userId: string | null
  status: string
}

/**
 * Which seat-holder (if any) should get a "your turn" push. Mirrors the
 * `isAi` check `_shared/match.ts`'s AI auto-play loop already uses: a seat
 * with no `userId` is a pure-AI seat (nobody to notify), and a seat flipped
 * to `ai_takeover` (§8, after missing too many turns) is being played by the
 * AI on the lapsed player's behalf, so it doesn't need a push either — only
 * a seat currently under a human's own control does.
 */
export function turnNotificationRecipient(
  seats: readonly TurnSeat[],
  currentSeat: number,
): { seat: number; userId: string } | null {
  const row = seats.find((s) => s.seat === currentSeat)
  if (!row || !row.userId || row.status === 'ai_takeover') return null
  return { seat: row.seat, userId: row.userId }
}

/** Per-environment push credentials. Both are optional: an environment with
 * neither configured (e.g. this one — see the doc comment on
 * `_shared/push.ts`'s `readCredentials`) simply cannot dispatch any push. */
export interface PushCredentials {
  fcm?: { serverKey: string }
  apns?: {
    /** PEM-encoded `.p8` private key contents (PKCS8). */
    authKeyPem: string
    keyId: string
    teamId: string
    /** The app's bundle id, sent as `apns-topic`. */
    bundleId: string
    /** Defaults to the production APNs host. */
    host?: string
  }
}

export interface PushRequest {
  url: string
  headers: Record<string, string>
  body: string
}

const NOTIFICATION_TITLE = 'Your turn!'
const NOTIFICATION_BODY = 'It is your turn in Age of Plunder.'

/** Legacy FCM HTTP API (`fcm/send`) request. Simpler than the newer HTTP v1 API
 * (which needs an OAuth2 access token minted from a service-account JSON key
 * rather than a single static server key) and sufficient for a first cut. */
export function buildFcmRequest(
  token: string,
  payload: TurnPushPayload,
  serverKey: string,
): PushRequest {
  return {
    url: 'https://fcm.googleapis.com/fcm/send',
    headers: {
      Authorization: `key=${serverKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      priority: 'high',
      notification: { title: NOTIFICATION_TITLE, body: NOTIFICATION_BODY },
      data: { matchId: payload.matchId, seat: String(payload.seat) },
    }),
  }
}

/**
 * RFC 4648 §5 base64url, built on the Web-standard `btoa` (no Node `Buffer`,
 * per the file-level doc comment) — `+`/`/` swapped for `-`/`_` and the `=`
 * padding dropped, exactly as JWT compact serialization requires. Exported
 * (but not re-exported from `@aop/shared`'s barrel, same as everything else
 * here) so push.test.ts can exercise it directly (#554: this correctness-
 * sensitive routine had no test coverage before).
 */
export function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlFromString(s: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(s))
}

function pemToBytes(pem: string): Uint8Array {
  const stripped = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  const raw = atob(stripped)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function importApnsPrivateKey(authKeyPem: string): Promise<CryptoKey> {
  const bytes = pemToBytes(authKeyPem)
  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

/**
 * Signs the ES256 provider-authentication JWT APNs' token-based (HTTP/2)
 * auth requires — one token can be reused across pushes/devices until it
 * expires, so this is called per-push rather than cached (a future
 * optimization, not a correctness requirement: Apple documents these tokens
 * as cheap to mint and tolerant of reuse *or* reissue).
 * https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
 *
 * `nowSeconds` is injectable so tests can assert on `iat` deterministically.
 */
export async function signApnsJwt(
  teamId: string,
  keyId: string,
  authKeyPem: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const header = { alg: 'ES256', kid: keyId }
  const claims = { iss: teamId, iat: nowSeconds }
  const unsigned = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(claims))}`
  const key = await importApnsPrivateKey(authKeyPem)
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned),
  )
  return `${unsigned}.${base64UrlFromBytes(new Uint8Array(signature))}`
}

/** APNs HTTP/2 request. `jwt` is a pre-signed {@link signApnsJwt} result — kept
 * as a parameter (rather than signed inside this builder) so the pure
 * request-shape assertion in tests doesn't need a real EC key. */
export function buildApnsRequest(
  token: string,
  payload: TurnPushPayload,
  bundleId: string,
  host: string,
  jwt: string,
): PushRequest {
  return {
    url: `https://${host}/3/device/${token}`,
    headers: {
      Authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      aps: { alert: { title: NOTIFICATION_TITLE, body: NOTIFICATION_BODY }, sound: 'default' },
      matchId: payload.matchId,
      seat: payload.seat,
    }),
  }
}

export interface PushSendResult {
  ok: boolean
  status?: number
  error?: string
}

/**
 * Sends one push to one device token via whichever provider its platform
 * needs, using `credentials` for that provider. Never throws — a missing
 * credential, a network error, or a non-2xx response all resolve to
 * `{ ok: false }` so the caller (`dispatchTurnPush` in the Deno wrapper) can
 * log and move on to the next token without any try/catch of its own.
 */
export async function dispatchPush(
  fetchImpl: typeof fetch,
  token: StoredPushToken,
  payload: TurnPushPayload,
  credentials: PushCredentials,
): Promise<PushSendResult> {
  try {
    let request: PushRequest
    if (token.platform === 'android') {
      if (!credentials.fcm) return { ok: false, error: 'FCM credentials not configured' }
      request = buildFcmRequest(token.token, payload, credentials.fcm.serverKey)
    } else if (token.platform === 'ios') {
      if (!credentials.apns) return { ok: false, error: 'APNs credentials not configured' }
      const { authKeyPem, keyId, teamId, bundleId, host = 'api.push.apple.com' } = credentials.apns
      const jwt = await signApnsJwt(teamId, keyId, authKeyPem)
      request = buildApnsRequest(token.token, payload, bundleId, host, jwt)
    } else {
      return { ok: false, error: `Unsupported push platform ${token.platform}` }
    }

    const res = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, status: res.status }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
