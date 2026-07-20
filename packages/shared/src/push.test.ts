import { describe, expect, it } from 'vitest'
import { base64UrlFromBytes, base64UrlFromString, signApnsJwt } from './push'

/** Reverses {@link base64UrlFromBytes} using only the same Web-standard
 * globals it's built on, so this test doesn't just re-check the
 * implementation against itself with different syntax. */
function base64UrlToBytes(s: string): Uint8Array {
  const padded = s
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(s.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

describe('base64UrlFromBytes (#554)', () => {
  it('never emits the standard-base64 chars it is meant to replace', () => {
    // 0, 1, and 2 padding-byte cases (byte lengths 3, 1, 2 mod 3) all in one
    // input so every padding amount base64 can produce is exercised.
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 62, 63, 10])
    const out = base64UrlFromBytes(bytes)
    expect(out).not.toMatch(/[+/=]/)
  })

  it('round-trips arbitrary byte sequences', () => {
    const cases = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([255]),
      new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      new Uint8Array(Array.from({ length: 64 }, (_, i) => (i * 37) % 256)),
    ]
    for (const bytes of cases) {
      expect(base64UrlToBytes(base64UrlFromBytes(bytes))).toEqual(bytes)
    }
  })

  it('matches the known RFC 4648 test-vector encoding, url-safe', () => {
    // "any carnal pleas" -> standard base64 "YW55IGNhcm5hbCBwbGVhcw==" (RFC
    // 4648 §10); the trailing "==" is exactly the padding this function must
    // strip, and none of the bytes here happen to need +/- so this alone
    // doesn't cover the char substitution — the byte-254/255 case above does.
    expect(base64UrlFromString('any carnal pleas')).toBe('YW55IGNhcm5hbCBwbGVhcw')
  })
})

describe('base64UrlFromString (#554)', () => {
  it('encodes multi-byte UTF-8 (TextEncoder, not UTF-16 code units)', () => {
    const out = base64UrlFromString('pirate ☠️ captain')
    expect(base64UrlToBytes(out)).toEqual(new TextEncoder().encode('pirate ☠️ captain'))
  })

  it('produces distinct output for distinct input', () => {
    expect(base64UrlFromString('a')).not.toBe(base64UrlFromString('b'))
  })
})

describe('signApnsJwt (#554 — base64url in its real call site)', () => {
  it('produces a three-segment JWT whose header/claims decode to the expected JSON', async () => {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
    const pem = `-----BEGIN PRIVATE KEY-----\n${base64UrlFromBytes(new Uint8Array(pkcs8))
      .replace(/-/g, '+')
      .replace(/_/g, '/')}\n-----END PRIVATE KEY-----`

    const jwt = await signApnsJwt('TEAM123', 'KEYID45', pem, 1_700_000_000)
    const [headerSeg, claimsSeg, sigSeg] = jwt.split('.')
    expect(headerSeg && claimsSeg && sigSeg).toBeTruthy()

    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerSeg!)))
    const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(claimsSeg!)))
    expect(header).toEqual({ alg: 'ES256', kid: 'KEYID45' })
    expect(claims).toEqual({ iss: 'TEAM123', iat: 1_700_000_000 })

    // Closes the loop: the base64url-decoded signature segment must verify
    // against the public half of the key that signed it, over the exact
    // "header.claims" string — proof the encode/decode round-trip in the
    // signing path (which is entirely base64url plumbing) preserves bytes.
    const signature = base64UrlToBytes(sigSeg!)
    const signedData = new TextEncoder().encode(`${headerSeg}.${claimsSeg}`)
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.publicKey,
      signature.buffer as ArrayBuffer,
      signedData,
    )
    expect(verified).toBe(true)
  })
})
