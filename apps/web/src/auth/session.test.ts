import { describe, expect, it, vi } from 'vitest'
import {
  REFRESH_SKEW_MS,
  clearStoredSession,
  createSessionRefresher,
  isExpired,
  loadStoredSession,
  storeSession,
} from './session'
import type { AuthBackend, AuthSession } from './types'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  }
}

const SESSION: AuthSession = {
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: 10_000_000,
  user: { id: 'u1', email: 'cap@plunder.io' },
}

describe('session persistence', () => {
  it('round-trips a stored session', () => {
    const storage = memoryStorage()
    storeSession(storage, SESSION)
    expect(loadStoredSession(storage)).toEqual(SESSION)
  })

  it('returns null when nothing is stored', () => {
    expect(loadStoredSession(memoryStorage())).toBeNull()
  })

  it('returns null for a malformed record', () => {
    const storage = memoryStorage()
    storage.setItem('aop-auth-session', '{"accessToken":123}')
    expect(loadStoredSession(storage)).toBeNull()
  })

  it('clears the stored session', () => {
    const storage = memoryStorage()
    storeSession(storage, SESSION)
    clearStoredSession(storage)
    expect(loadStoredSession(storage)).toBeNull()
  })
})

describe('isExpired', () => {
  it('is false well before expiry', () => {
    expect(isExpired(SESSION, SESSION.expiresAt - REFRESH_SKEW_MS - 1)).toBe(false)
  })

  it('is true once inside the refresh skew window', () => {
    expect(isExpired(SESSION, SESSION.expiresAt - REFRESH_SKEW_MS)).toBe(true)
    expect(isExpired(SESSION, SESSION.expiresAt)).toBe(true)
  })
})

describe('createSessionRefresher', () => {
  // A session freshly issued at t=0 with Supabase's default 1h access-token
  // lifetime (#234 — AuthContext only ever refreshed at mount, so nothing
  // called refreshSession again once this expired).
  const issuedAt0: AuthSession = {
    accessToken: 'a1',
    refreshToken: 'r1',
    expiresAt: 3_600_000,
    user: { id: 'u1', email: 'cap@plunder.io' },
  }
  const refreshed: AuthSession = { ...issuedAt0, accessToken: 'a2', expiresAt: 7_200_000 }

  function fakeBackend(impl?: () => Promise<AuthSession>): Pick<AuthBackend, 'refreshSession'> {
    return { refreshSession: vi.fn(impl ?? (async () => refreshed)) }
  }

  it('returns the current session unchanged when it is still valid', async () => {
    const backend = fakeBackend()
    const onRefreshed = vi.fn()
    const getFreshSession = createSessionRefresher(backend, onRefreshed)

    const result = await getFreshSession(issuedAt0, 0)

    expect(result).toBe(issuedAt0)
    expect(backend.refreshSession).not.toHaveBeenCalled()
    expect(onRefreshed).not.toHaveBeenCalled()
  })

  it('refreshes a session once the 1h access-token lifetime has passed', async () => {
    const backend = fakeBackend()
    const onRefreshed = vi.fn()
    const getFreshSession = createSessionRefresher(backend, onRefreshed)

    // 1h + 1 minute later: well past expiresAt (and its skew window).
    const result = await getFreshSession(issuedAt0, 3_660_000)

    expect(backend.refreshSession).toHaveBeenCalledWith('r1')
    expect(result).toEqual(refreshed)
    expect(onRefreshed).toHaveBeenCalledWith(refreshed)
  })

  it('single-flights concurrent refresh calls for an expired session', async () => {
    let resolveRefresh: (session: AuthSession) => void = () => undefined
    const backend = fakeBackend(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve
        }),
    )
    const onRefreshed = vi.fn()
    const getFreshSession = createSessionRefresher(backend, onRefreshed)

    const first = getFreshSession(issuedAt0, 3_660_000)
    const second = getFreshSession(issuedAt0, 3_660_000)
    resolveRefresh(refreshed)

    expect(await first).toEqual(refreshed)
    expect(await second).toEqual(refreshed)
    expect(backend.refreshSession).toHaveBeenCalledTimes(1)
    expect(onRefreshed).toHaveBeenCalledTimes(1)
  })

  it('lets a later call retry after a failed refresh instead of staying stuck', async () => {
    const backend = fakeBackend()
    ;(backend.refreshSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('network down'),
    )
    const onRefreshed = vi.fn()
    const getFreshSession = createSessionRefresher(backend, onRefreshed)

    await expect(getFreshSession(issuedAt0, 3_660_000)).rejects.toThrow('network down')
    const result = await getFreshSession(issuedAt0, 3_660_000)

    expect(result).toEqual(refreshed)
    expect(backend.refreshSession).toHaveBeenCalledTimes(2)
  })
})
