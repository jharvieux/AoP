import { describe, expect, it, vi } from 'vitest'
import { SupabaseAuthBackend, type SupabaseConfig } from './supabaseAuth'
import { AuthError, type AuthSession } from './types'

const CONFIG: SupabaseConfig = { url: 'https://proj.supabase.co', anonKey: 'anon-key' }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const TOKEN_BODY = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_at: 1_700_000_000, // seconds
  user: { id: 'user-1', email: 'cap@plunder.io' },
}

function backendReturning(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>()
  for (const r of responses) fetchMock.mockResolvedValueOnce(r)
  return { backend: new SupabaseAuthBackend(CONFIG, fetchMock), fetchMock }
}

describe('SupabaseAuthBackend auth', () => {
  it('signs in with password and maps the token body to a session', async () => {
    const { backend, fetchMock } = backendReturning(jsonResponse(200, TOKEN_BODY))
    const session = await backend.signInWithPassword('cap@plunder.io', 'hunter2')

    const expected: AuthSession = {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: 1_700_000_000_000, // seconds → ms
      user: { id: 'user-1', email: 'cap@plunder.io' },
    }
    expect(session).toEqual(expected)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/auth/v1/token?grant_type=password')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).headers).toMatchObject({ apikey: 'anon-key' })
  })

  it('signs up and returns a session when tokens are present', async () => {
    const { backend } = backendReturning(jsonResponse(200, TOKEN_BODY))
    const session = await backend.signUp('cap@plunder.io', 'hunter2', 'Captain')
    expect(session.accessToken).toBe('access-1')
  })

  it('throws EMAIL_CONFIRMATION_REQUIRED when signup returns no tokens', async () => {
    const { backend } = backendReturning(jsonResponse(200, { user: { id: 'user-1' } }))
    await expect(backend.signUp('cap@plunder.io', 'hunter2', 'Captain')).rejects.toMatchObject({
      code: 'EMAIL_CONFIRMATION_REQUIRED',
    })
  })

  it('maps invalid credentials to INVALID_CREDENTIALS', async () => {
    const { backend } = backendReturning(
      jsonResponse(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }),
    )
    await expect(backend.signInWithPassword('cap@plunder.io', 'wrong')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
  })

  it('maps an already-registered email to EMAIL_TAKEN', async () => {
    const { backend } = backendReturning(jsonResponse(400, { msg: 'User already registered' }))
    await expect(backend.signUp('cap@plunder.io', 'hunter2', 'Captain')).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
    })
  })

  it('maps a fetch failure to NETWORK', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    const backend = new SupabaseAuthBackend(CONFIG, fetchMock)
    await expect(backend.signInWithPassword('cap@plunder.io', 'hunter2')).rejects.toMatchObject({
      code: 'NETWORK',
    })
  })

  it('refreshes a session via the refresh_token grant', async () => {
    const { backend, fetchMock } = backendReturning(jsonResponse(200, TOKEN_BODY))
    await backend.refreshSession('refresh-1')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/auth/v1/token?grant_type=refresh_token')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ refresh_token: 'refresh-1' })
  })

  it('builds a provider authorize URL', () => {
    const backend = new SupabaseAuthBackend(CONFIG, vi.fn())
    const url = backend.oauthAuthorizeUrl('google', 'https://app.example/callback')
    expect(url).toBe(
      'https://proj.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fapp.example%2Fcallback',
    )
  })
})

describe('SupabaseAuthBackend profiles', () => {
  const session: AuthSession = {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + 3600_000,
    user: { id: 'user-1', email: 'cap@plunder.io' },
  }

  it('upserts a profile row on ensureProfile', async () => {
    const { backend, fetchMock } = backendReturning(
      jsonResponse(201, [{ id: 'user-1', display_name: 'Captain' }]),
    )
    const profile = await backend.ensureProfile(session, 'Captain')
    expect(profile).toEqual({ id: 'user-1', displayName: 'Captain' })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/rest/v1/profiles')
    expect((init as RequestInit).headers).toMatchObject({
      Prefer: 'resolution=merge-duplicates,return=representation',
    })
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      id: 'user-1',
      display_name: 'Captain',
    })
  })

  it('returns null when no profile row exists', async () => {
    const { backend } = backendReturning(jsonResponse(200, []))
    expect(await backend.getProfile(session)).toBeNull()
  })

  it('updates a display name', async () => {
    const { backend, fetchMock } = backendReturning(
      jsonResponse(200, [{ id: 'user-1', display_name: 'Blackbeard' }]),
    )
    const profile = await backend.updateDisplayName(session, 'Blackbeard')
    expect(profile.displayName).toBe('Blackbeard')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/rest/v1/profiles?id=eq.user-1')
    expect((init as RequestInit).method).toBe('PATCH')
  })
})

it('AuthError carries its code', () => {
  const err = new AuthError('NOT_CONFIGURED', 'nope')
  expect(err).toBeInstanceOf(Error)
  expect(err.code).toBe('NOT_CONFIGURED')
})
