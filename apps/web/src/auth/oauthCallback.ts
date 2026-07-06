import type { AuthBackend, AuthSession, OAuthCallbackTokens } from './types'

/**
 * Parses the redirect fragment GoTrue's implicit OAuth flow appends to the
 * URL (`#access_token=...&refresh_token=...&expires_in=...`). Returns null
 * when the fragment carries no OAuth tokens (the normal case on every boot
 * that isn't an OAuth callback) (#233).
 */
export function parseOAuthCallbackHash(
  hash: string,
  now: number = Date.now(),
): OAuthCallbackTokens | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(raw)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) return null

  const expiresAtSeconds = params.get('expires_at')
  const expiresInSeconds = params.get('expires_in')
  const expiresAt = expiresAtSeconds
    ? Number(expiresAtSeconds) * 1000
    : now + Number(expiresInSeconds ?? 3600) * 1000

  return { accessToken, refreshToken, expiresAt }
}

/**
 * Boot-time entry point: if `location.hash` carries an OAuth implicit-flow
 * callback, exchanges it for a full session via `backend`. Returns null
 * (a no-op) when there's nothing to parse. Does not touch history or
 * storage — the caller (AuthContext) persists the session, dispatches it,
 * and scrubs the URL.
 */
export async function completeOAuthCallback(
  backend: Pick<AuthBackend, 'exchangeOAuthCallback'>,
  location: Pick<Location, 'hash'>,
  now: number = Date.now(),
): Promise<AuthSession | null> {
  const tokens = parseOAuthCallbackHash(location.hash, now)
  if (!tokens) return null
  return backend.exchangeOAuthCallback(tokens)
}
