import type { AuthSession } from './types'

/**
 * Session persistence. Kept behind a `Storage`-shaped port so it can be tested
 * with an in-memory stub and so a private-mode browser that throws on
 * `localStorage` access degrades to guest play rather than crashing.
 */
const SESSION_KEY = 'aop-auth-session'

/** Refresh this many ms before actual expiry to avoid using a token mid-flight. */
export const REFRESH_SKEW_MS = 60_000

export function loadStoredSession(storage: Storage): AuthSession | null {
  let raw: string | null
  try {
    raw = storage.getItem(SESSION_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AuthSession
    if (
      typeof parsed?.accessToken === 'string' &&
      typeof parsed?.refreshToken === 'string' &&
      typeof parsed?.expiresAt === 'number' &&
      typeof parsed?.user?.id === 'string'
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function storeSession(storage: Storage, session: AuthSession): void {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Non-persistent storage is acceptable; the session lives in memory for now.
  }
}

export function clearStoredSession(storage: Storage): void {
  try {
    storage.removeItem(SESSION_KEY)
  } catch {
    // Ignore — nothing to clear if storage is unavailable.
  }
}

/** True when the session is at or past its (skew-adjusted) expiry. */
export function isExpired(session: AuthSession, now: number): boolean {
  return now >= session.expiresAt - REFRESH_SKEW_MS
}
