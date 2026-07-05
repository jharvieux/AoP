import { describe, expect, it, vi } from 'vitest'
// The functions under test are the pure push-notification helpers the Edge
// Function turn-advance path runs (see supabase/functions/_shared/push.ts,
// which imports them via @aop/shared/push). They live in @aop/shared so this
// Node/Vitest suite exercises the exact code the Deno runtime does. Imported
// by explicit path for the same reason stripeEdge.test.ts imports @aop/shared/
// stripe that way: intentionally not re-exported from @aop/shared's barrel
// (engine/content typecheck without DOM lib, and this module needs crypto.subtle).
import {
  buildApnsRequest,
  buildFcmRequest,
  deliverableTokens,
  dispatchPush,
  signApnsJwt,
  turnNotificationRecipient,
  type PushCredentials,
  type StoredPushToken,
  type TurnSeat,
} from '../../../../packages/shared/src/push'

describe('deliverableTokens (#158: FCM/APNs only, web push is out of scope)', () => {
  it('keeps ios and android tokens, drops web tokens', () => {
    const tokens: StoredPushToken[] = [
      { platform: 'ios', token: 'ios-tok' },
      { platform: 'android', token: 'android-tok' },
      { platform: 'web', token: 'web-tok' },
    ]
    expect(deliverableTokens(tokens)).toEqual([
      { platform: 'ios', token: 'ios-tok' },
      { platform: 'android', token: 'android-tok' },
    ])
  })

  it('returns an empty array when nothing is deliverable', () => {
    expect(deliverableTokens([{ platform: 'web', token: 'w' }])).toEqual([])
  })
})

describe('turnNotificationRecipient (#158: who should get a "your turn" push)', () => {
  const seats: TurnSeat[] = [
    { seat: 1, userId: 'alice', status: 'active' },
    { seat: 2, userId: null, status: 'active' }, // pure AI seat
    { seat: 3, userId: 'carol', status: 'ai_takeover' }, // lapsed human, AI-piloted
  ]

  it('selects a human-controlled seat', () => {
    expect(turnNotificationRecipient(seats, 1)).toEqual({ seat: 1, userId: 'alice' })
  })

  it('does not notify a seat with no user (pure AI)', () => {
    expect(turnNotificationRecipient(seats, 2)).toBeNull()
  })

  it('does not notify a lapsed seat under ai_takeover, even though it has a userId', () => {
    expect(turnNotificationRecipient(seats, 3)).toBeNull()
  })

  it('does not notify an unknown seat number', () => {
    expect(turnNotificationRecipient(seats, 99)).toBeNull()
  })
})

describe('buildFcmRequest', () => {
  it('builds the legacy FCM HTTP API request shape', () => {
    const req = buildFcmRequest('device-token', { matchId: 'match-1', seat: 2 }, 'server-key')
    expect(req.url).toBe('https://fcm.googleapis.com/fcm/send')
    expect(req.headers.Authorization).toBe('key=server-key')
    const body = JSON.parse(req.body) as Record<string, unknown>
    expect(body.to).toBe('device-token')
    expect(body.data).toEqual({ matchId: 'match-1', seat: '2' })
  })
})

describe('buildApnsRequest', () => {
  it('builds the APNs HTTP/2 request shape, carrying the pre-signed JWT', () => {
    const req = buildApnsRequest(
      'device-token',
      { matchId: 'match-1', seat: 2 },
      'com.aop.app',
      'api.push.apple.com',
      'signed.jwt.value',
    )
    expect(req.url).toBe('https://api.push.apple.com/3/device/device-token')
    expect(req.headers.Authorization).toBe('bearer signed.jwt.value')
    expect(req.headers['apns-topic']).toBe('com.aop.app')
    const body = JSON.parse(req.body) as Record<string, unknown>
    expect(body.matchId).toBe('match-1')
    expect(body.seat).toBe(2)
  })
})

/** Generates a fresh P-256 keypair and exports the private half as the PKCS8 PEM
 * `signApnsJwt` expects, so the signer can be tested against a real (if
 * throwaway) EC key without any actual Apple credentials. */
async function generateApnsTestKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)))
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`
  return { pem, publicKey: pair.publicKey }
}

function decodeBase64UrlJson(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(padded)) as Record<string, unknown>
}

describe('signApnsJwt', () => {
  it('produces a three-part ES256 JWT with the right header and claims', async () => {
    const { pem } = await generateApnsTestKey()
    const jwt = await signApnsJwt('TEAM123', 'KEY456', pem, 1_700_000_000)
    const parts = jwt.split('.')
    expect(parts).toHaveLength(3)
    expect(decodeBase64UrlJson(parts[0]!)).toEqual({ alg: 'ES256', kid: 'KEY456' })
    expect(decodeBase64UrlJson(parts[1]!)).toEqual({ iss: 'TEAM123', iat: 1_700_000_000 })
  })

  it('signs with the supplied key, verifiable against its public half', async () => {
    const { pem, publicKey } = await generateApnsTestKey()
    const jwt = await signApnsJwt('TEAM123', 'KEY456', pem)
    const [header, claims, signature] = jwt.split('.') as [string, string, string]
    const signatureBytes = Uint8Array.from(
      atob(signature.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    )
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signatureBytes,
      new TextEncoder().encode(`${header}.${claims}`),
    )
    expect(valid).toBe(true)
  })
})

describe('dispatchPush (#158 failure isolation: a push send never throws)', () => {
  const payload = { matchId: 'match-1', seat: 1 }

  it('sends an android token through FCM and reports success', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    const credentials: PushCredentials = { fcm: { serverKey: 'server-key' } }
    const result = await dispatchPush(
      fetchImpl,
      { platform: 'android', token: 'tok' },
      payload,
      credentials,
    )
    expect(result).toEqual({ ok: true, status: 200 })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://fcm.googleapis.com/fcm/send',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('reports failure (without throwing) on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response('gone', { status: 410 }))
    const credentials: PushCredentials = { fcm: { serverKey: 'server-key' } }
    const result = await dispatchPush(
      fetchImpl,
      { platform: 'android', token: 'expired-tok' },
      payload,
      credentials,
    )
    expect(result).toEqual({ ok: false, status: 410 })
  })

  it('never throws when fetch itself rejects (network error)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    })
    const credentials: PushCredentials = { fcm: { serverKey: 'server-key' } }
    await expect(
      dispatchPush(fetchImpl, { platform: 'android', token: 'tok' }, payload, credentials),
    ).resolves.toEqual({ ok: false, error: 'network down' })
  })

  it('reports failure without calling fetch when no credentials are configured for the platform', async () => {
    const fetchImpl = vi.fn()
    const result = await dispatchPush(fetchImpl, { platform: 'ios', token: 'tok' }, payload, {})
    expect(result).toEqual({ ok: false, error: 'APNs credentials not configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('signs and sends an ios token through APNs when apns credentials are present', async () => {
    const { pem } = await generateApnsTestKey()
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 200 }),
    )
    const credentials: PushCredentials = {
      apns: { authKeyPem: pem, keyId: 'KEY456', teamId: 'TEAM123', bundleId: 'com.aop.app' },
    }
    const result = await dispatchPush(
      fetchImpl,
      { platform: 'ios', token: 'tok' },
      payload,
      credentials,
    )
    expect(result).toEqual({ ok: true, status: 200 })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://api.push.apple.com/3/device/tok')
    expect((init?.headers as Record<string, string>)['apns-topic']).toBe('com.aop.app')
  })
})
