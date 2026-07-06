import { describe, expect, it, vi } from 'vitest'
import { completeOAuthCallback, parseOAuthCallbackHash } from './oauthCallback'
import type { AuthBackend, AuthSession } from './types'

const SESSION: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 3_600_000,
  user: { id: 'u1', email: 'cap@plunder.io' },
}

describe('parseOAuthCallbackHash', () => {
  it('returns null for an ordinary boot with no hash', () => {
    expect(parseOAuthCallbackHash('')).toBeNull()
  })

  it('returns null for a hash that carries no OAuth tokens', () => {
    expect(parseOAuthCallbackHash('#some-other-fragment')).toBeNull()
  })

  it('extracts tokens from a GoTrue implicit-flow redirect fragment', () => {
    const tokens = parseOAuthCallbackHash(
      '#access_token=access-1&refresh_token=refresh-1&expires_in=3600&token_type=bearer',
      0,
    )
    expect(tokens).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: 3_600_000,
    })
  })

  it('prefers an absolute expires_at (seconds) over expires_in when both are present', () => {
    const tokens = parseOAuthCallbackHash(
      '#access_token=a&refresh_token=r&expires_at=1700&expires_in=60',
      0,
    )
    expect(tokens?.expiresAt).toBe(1_700_000)
  })

  it('works whether or not the leading # is included', () => {
    const withHash = parseOAuthCallbackHash('#access_token=a&refresh_token=r', 0)
    const withoutHash = parseOAuthCallbackHash('access_token=a&refresh_token=r', 0)
    expect(withHash).toEqual(withoutHash)
  })

  it('returns null when only one of the two tokens is present', () => {
    expect(parseOAuthCallbackHash('#access_token=a')).toBeNull()
    expect(parseOAuthCallbackHash('#refresh_token=r')).toBeNull()
  })
})

describe('completeOAuthCallback', () => {
  function fakeBackend(
    impl: () => Promise<AuthSession> = async () => SESSION,
  ): Pick<AuthBackend, 'exchangeOAuthCallback'> {
    return { exchangeOAuthCallback: vi.fn(impl) }
  }

  it('is a no-op when the location has no OAuth callback hash', async () => {
    const backend = fakeBackend()
    const result = await completeOAuthCallback(backend, { hash: '' })
    expect(result).toBeNull()
    expect(backend.exchangeOAuthCallback).not.toHaveBeenCalled()
  })

  it('exchanges callback tokens for a full session via the backend', async () => {
    const backend = fakeBackend()
    const result = await completeOAuthCallback(
      backend,
      { hash: '#access_token=access-1&refresh_token=refresh-1&expires_in=3600' },
      0,
    )
    expect(result).toEqual(SESSION)
    expect(backend.exchangeOAuthCallback).toHaveBeenCalledWith({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: 3_600_000,
    })
  })
})
