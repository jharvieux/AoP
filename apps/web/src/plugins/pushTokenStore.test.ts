import { describe, expect, it, vi } from 'vitest'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession, AuthState } from '../auth/types'
import {
  clearPushToken,
  createSupabasePushTokenStore,
  syncPushToken,
  type PushTokenStore,
} from './pushTokenStore'

const CONFIG: SupabaseConfig = { url: 'https://proj.supabase.co/', anonKey: 'anon-key' }

const SESSION: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 1_700_000_000_000,
  user: { id: 'user-1', email: 'cap@plunder.io' },
}

const AUTHED: AuthState = { status: 'authenticated', user: SESSION.user, session: SESSION }
const GUEST: AuthState = { status: 'guest' }

function storeReturning(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>()
  for (const r of responses) fetchMock.mockResolvedValueOnce(r)
  return { store: createSupabasePushTokenStore(CONFIG, fetchMock), fetchMock }
}

describe('createSupabasePushTokenStore', () => {
  it('upserts with the auth token and merge-duplicates against push_tokens', async () => {
    const { store, fetchMock } = storeReturning(new Response(null, { status: 201 }))
    await store.upsert(SESSION, 'device-token-abc', 'ios')

    const [url, init] = fetchMock.mock.calls[0]!
    // Trailing slash in config is trimmed; hits the push_tokens collection.
    expect(url).toBe('https://proj.supabase.co/rest/v1/push_tokens')
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer access-1')
    expect(headers.apikey).toBe('anon-key')
    // merge-duplicates is what makes re-registration an upsert, not a duplicate.
    expect(headers.Prefer).toContain('resolution=merge-duplicates')
    expect(JSON.parse(init?.body as string)).toEqual({
      user_id: 'user-1',
      platform: 'ios',
      token: 'device-token-abc',
    })
    // updated_at is server-set by trigger; the client must not send it.
    expect(JSON.parse(init?.body as string)).not.toHaveProperty('updated_at')
  })

  it('throws when the upsert request fails', async () => {
    const { store } = storeReturning(new Response(null, { status: 403 }))
    await expect(store.upsert(SESSION, 'tok', 'ios')).rejects.toThrow(/403/)
  })

  it('deletes only the current platform row, scoped by the auth token', async () => {
    const { store, fetchMock } = storeReturning(new Response(null, { status: 204 }))
    await store.remove(SESSION, 'android')

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://proj.supabase.co/rest/v1/push_tokens?platform=eq.android')
    expect(init?.method).toBe('DELETE')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-1')
  })

  it('throws when the delete request fails', async () => {
    const { store } = storeReturning(new Response(null, { status: 500 }))
    await expect(store.remove(SESSION, 'ios')).rejects.toThrow(/500/)
  })
})

describe('syncPushToken', () => {
  it('upserts when authenticated', async () => {
    const store: PushTokenStore = { upsert: vi.fn().mockResolvedValue(undefined), remove: vi.fn() }
    await syncPushToken(store, AUTHED, 'tok', 'ios')
    expect(store.upsert).toHaveBeenCalledWith(SESSION, 'tok', 'ios')
  })

  it('is a no-op for a guest (no user to key the token to)', async () => {
    const store: PushTokenStore = { upsert: vi.fn(), remove: vi.fn() }
    await syncPushToken(store, GUEST, 'tok', 'ios')
    expect(store.upsert).not.toHaveBeenCalled()
  })

  it('swallows storage errors (best-effort, never surfaces to the app)', async () => {
    const store: PushTokenStore = {
      upsert: vi.fn().mockRejectedValue(new Error('boom')),
      remove: vi.fn(),
    }
    await expect(syncPushToken(store, AUTHED, 'tok', 'ios')).resolves.toBeUndefined()
  })
})

describe('clearPushToken', () => {
  it('removes this platform on sign-out when authenticated', async () => {
    const store: PushTokenStore = { upsert: vi.fn(), remove: vi.fn().mockResolvedValue(undefined) }
    await clearPushToken(store, AUTHED, 'android')
    expect(store.remove).toHaveBeenCalledWith(SESSION, 'android')
  })

  it('is a no-op for a guest', async () => {
    const store: PushTokenStore = { upsert: vi.fn(), remove: vi.fn() }
    await clearPushToken(store, GUEST, 'ios')
    expect(store.remove).not.toHaveBeenCalled()
  })

  it('swallows cleanup errors so sign-out is never blocked', async () => {
    const store: PushTokenStore = {
      upsert: vi.fn(),
      remove: vi.fn().mockRejectedValue(new Error('boom')),
    }
    await expect(clearPushToken(store, AUTHED, 'ios')).resolves.toBeUndefined()
  })
})
