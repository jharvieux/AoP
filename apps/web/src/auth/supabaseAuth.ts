import {
  AuthError,
  type AuthBackend,
  type AuthSession,
  type AuthUser,
  type OAuthProvider,
  type Profile,
} from './types'

export interface SupabaseConfig {
  /** Project URL, e.g. `http://127.0.0.1:54321` locally. No trailing slash. */
  url: string
  /** Public anon key; safe to ship to the client bundle. */
  anonKey: string
}

/**
 * Supabase Auth (GoTrue) + `profiles` (PostgREST) over `fetch`. We deliberately
 * do not pull in `@supabase/supabase-js`: the REST endpoints used here are a
 * small, stable subset, and injecting `fetch` keeps every flow unit-testable
 * without a live project or the SDK's global auth-state singleton.
 */
export class SupabaseAuthBackend implements AuthBackend {
  private readonly url: string
  private readonly anonKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
    this.url = config.url.replace(/\/$/, '')
    this.anonKey = config.anonKey
    this.fetchImpl = fetchImpl
  }

  async signUp(email: string, password: string, displayName: string): Promise<AuthSession> {
    const body = await this.authFetch('/auth/v1/signup', {
      email,
      password,
      data: { display_name: displayName },
    })
    // With email confirmation on, signup returns a user but no tokens.
    if (!body.access_token) {
      throw new AuthError(
        'EMAIL_CONFIRMATION_REQUIRED',
        'Check your inbox to confirm your email before signing in.',
      )
    }
    return toSession(body)
  }

  async signInWithPassword(email: string, password: string): Promise<AuthSession> {
    const body = await this.authFetch('/auth/v1/token?grant_type=password', { email, password })
    return toSession(body)
  }

  async refreshSession(refreshToken: string): Promise<AuthSession> {
    const body = await this.authFetch('/auth/v1/token?grant_type=refresh_token', {
      refresh_token: refreshToken,
    })
    return toSession(body)
  }

  async signOut(session: AuthSession): Promise<void> {
    await this.request('/auth/v1/logout', {
      method: 'POST',
      headers: this.headers(session.accessToken),
    })
  }

  oauthAuthorizeUrl(provider: OAuthProvider, redirectTo: string): string {
    const params = new URLSearchParams({ provider, redirect_to: redirectTo })
    return `${this.url}/auth/v1/authorize?${params.toString()}`
  }

  async ensureProfile(session: AuthSession, displayName: string): Promise<Profile> {
    // Upsert: the profiles row is not auto-created by a DB trigger, so account
    // creation must write it (display_name is NOT NULL). merge-duplicates makes
    // this safe to call again on later sign-ins.
    const rows = await this.restFetch('/rest/v1/profiles', {
      method: 'POST',
      headers: {
        ...this.headers(session.accessToken),
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({ id: session.user.id, display_name: displayName }),
    })
    return toProfile(rows[0], session.user.id, displayName)
  }

  async getProfile(session: AuthSession): Promise<Profile | null> {
    const rows = await this.restFetch(
      `/rest/v1/profiles?id=eq.${session.user.id}&select=id,display_name`,
      { method: 'GET', headers: this.headers(session.accessToken) },
    )
    const row = rows[0]
    return row ? toProfile(row, session.user.id, '') : null
  }

  async updateDisplayName(session: AuthSession, displayName: string): Promise<Profile> {
    const rows = await this.restFetch(`/rest/v1/profiles?id=eq.${session.user.id}`, {
      method: 'PATCH',
      headers: {
        ...this.headers(session.accessToken),
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ display_name: displayName }),
    })
    return toProfile(rows[0], session.user.id, displayName)
  }

  private headers(accessToken?: string): Record<string, string> {
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${accessToken ?? this.anonKey}`,
      'Content-Type': 'application/json',
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.url}${path}`, init)
    } catch {
      throw new AuthError('NETWORK', 'Could not reach the server. Check your connection.')
    }
  }

  /** POST to a GoTrue endpoint and parse the JSON body, mapping known errors. */
  private async authFetch(path: string, payload: unknown): Promise<GoTrueTokenBody> {
    const res = await this.request(path, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    })
    const body = (await res.json().catch(() => ({}))) as GoTrueTokenBody & GoTrueErrorBody
    if (!res.ok) throw mapAuthError(res.status, body)
    return body
  }

  /** Call a PostgREST endpoint and return the JSON rows (empty array on 204). */
  private async restFetch(path: string, init: RequestInit): Promise<Record<string, unknown>[]> {
    const res = await this.request(path, init)
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as GoTrueErrorBody
      throw mapAuthError(res.status, body)
    }
    if (res.status === 204) return []
    const parsed = (await res.json().catch(() => [])) as unknown
    return Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : [parsed as Record<string, unknown>]
  }
}

interface GoTrueTokenBody {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  user?: { id: string; email?: string | null }
}

interface GoTrueErrorBody {
  error?: string
  error_description?: string
  msg?: string
  message?: string
  code?: string
}

function toUser(user: { id: string; email?: string | null } | undefined): AuthUser {
  if (!user?.id) throw new AuthError('UNKNOWN', 'Auth response was missing a user.')
  return { id: user.id, email: user.email ?? null }
}

function toSession(body: GoTrueTokenBody): AuthSession {
  if (!body.access_token || !body.refresh_token) {
    throw new AuthError('UNKNOWN', 'Auth response was missing tokens.')
  }
  const expiresAt =
    typeof body.expires_at === 'number'
      ? body.expires_at * 1000
      : Date.now() + (body.expires_in ?? 3600) * 1000
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt,
    user: toUser(body.user),
  }
}

function toProfile(
  row: Record<string, unknown> | undefined,
  fallbackId: string,
  fallbackName: string,
): Profile {
  const id = typeof row?.id === 'string' ? row.id : fallbackId
  const displayName = typeof row?.display_name === 'string' ? row.display_name : fallbackName
  return { id, displayName }
}

function mapAuthError(status: number, body: GoTrueErrorBody): AuthError {
  const message =
    body.error_description || body.msg || body.message || body.error || 'Request failed.'
  if (status === 400 || status === 401) {
    if (/already registered|already been registered|duplicate/i.test(message)) {
      return new AuthError('EMAIL_TAKEN', 'That email already has an account. Try signing in.')
    }
    return new AuthError('INVALID_CREDENTIALS', 'Email or password is incorrect.')
  }
  if (status === 409) {
    return new AuthError('EMAIL_TAKEN', 'That email already has an account. Try signing in.')
  }
  return new AuthError('UNKNOWN', message)
}
