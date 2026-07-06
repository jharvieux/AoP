import type { AuthBackend, AuthSession } from './types'

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

/**
 * Builds a `getFreshSession(current, now)` function that returns `current`
 * unchanged while it's still valid, or refreshes it against `backend`
 * (#234 — the mount-time refresh in AuthContext never ran again, so every
 * session died at the access-token's ~1h lifetime). Concurrent calls made
 * while a session is expired share a single in-flight refresh request
 * (single-flight) rather than each firing their own `refreshSession` call.
 * `onRefreshed` is invoked once per successful refresh so the caller can
 * persist the new session and update UI state.
 */
export function createSessionRefresher(
  backend: Pick<AuthBackend, 'refreshSession'>,
  onRefreshed: (session: AuthSession) => void,
): (current: AuthSession, now?: number) => Promise<AuthSession> {
  let inFlight: Promise<AuthSession> | null = null

  return function getFreshSession(current: AuthSession, now: number = Date.now()) {
    if (!isExpired(current, now)) return Promise.resolve(current)
    if (!inFlight) {
      inFlight = backend
        .refreshSession(current.refreshToken)
        .then((session) => {
          onRefreshed(session)
          return session
        })
        .finally(() => {
          inFlight = null
        })
    }
    return inFlight
  }
}
