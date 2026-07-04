import { describe, expect, it } from 'vitest'
import {
  REFRESH_SKEW_MS,
  clearStoredSession,
  isExpired,
  loadStoredSession,
  storeSession,
} from './session'
import type { AuthSession } from './types'

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
