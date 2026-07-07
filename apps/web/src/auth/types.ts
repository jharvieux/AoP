/**
 * Auth domain types. The client talks to Supabase Auth (GoTrue) and the
 * `profiles` table (PostgREST) directly over `fetch` — see supabaseAuth.ts.
 * Nothing here depends on `@supabase/supabase-js`; the REST surface is small
 * and stable, and staying dependency-free keeps the client bundle lean and
 * these flows unit-testable with an injected `fetch`.
 */

/** OAuth providers wired for account sign-in (docs/ARCHITECTURE.md §4). */
export type OAuthProvider = 'google' | 'microsoft'

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ['google', 'microsoft']

export interface AuthUser {
  id: string
  email: string | null
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  /** Absolute expiry, epoch milliseconds. */
  expiresAt: number
  user: AuthUser
}

/** A row in the `profiles` table. */
export interface Profile {
  id: string
  displayName: string
}

/**
 * Tokens GoTrue's implicit OAuth flow appends to the redirect URL as a hash
 * fragment (`#access_token=...&refresh_token=...`) — see oauthCallback.ts.
 * The fragment carries no user id/email, so exchanging these for a full
 * `AuthSession` still requires a round trip to the backend.
 */
export interface OAuthCallbackTokens {
  accessToken: string
  refreshToken: string
  /** Absolute expiry, epoch milliseconds. */
  expiresAt: number
}

/**
 * Auth state is a two-state machine: single-player is always reachable as a
 * `guest`; an `authenticated` account unlocks multiplayer and cloud-backed
 * entitlements (docs/ARCHITECTURE.md §9).
 */
export type AuthState =
  { status: 'guest' } | { status: 'authenticated'; user: AuthUser; session: AuthSession }

export const GUEST_STATE: AuthState = { status: 'guest' }

/** Stable error codes so the UI can branch without string-matching messages. */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_TAKEN'
  | 'EMAIL_CONFIRMATION_REQUIRED'
  | 'NOT_CONFIGURED'
  | 'NOT_AUTHENTICATED'
  | 'NETWORK'
  | 'UNKNOWN'

export class AuthError extends Error {
  readonly code: AuthErrorCode
  constructor(code: AuthErrorCode, message: string) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

/**
 * The backend port the auth flows depend on. `SupabaseAuthBackend` is the real
 * `fetch`-based implementation; tests supply a fake.
 */
export interface AuthBackend {
  signUp(email: string, password: string, displayName: string): Promise<AuthSession>
  signInWithPassword(email: string, password: string): Promise<AuthSession>
  refreshSession(refreshToken: string): Promise<AuthSession>
  signOut(session: AuthSession): Promise<void>
  /** Build the provider redirect URL; the caller navigates the browser to it. */
  oauthAuthorizeUrl(provider: OAuthProvider, redirectTo: string): string
  /**
   * Exchange OAuth implicit-flow tokens (already parsed from the redirect
   * fragment by oauthCallback.ts) for a full session, fetching the user
   * record the fragment doesn't include (#233).
   */
  exchangeOAuthCallback(tokens: OAuthCallbackTokens): Promise<AuthSession>
  /** Create-or-update the caller's `profiles` row. */
  ensureProfile(session: AuthSession, displayName: string): Promise<Profile>
  getProfile(session: AuthSession): Promise<Profile | null>
  updateDisplayName(session: AuthSession, displayName: string): Promise<Profile>
}
