import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession, AuthState } from '../auth/types'

/**
 * Persists a device's native push token to the `push_tokens` table (#157) via
 * PostgREST, so the send path (#158) can later reach the device. Talks to
 * Supabase over `fetch` directly — matching `SupabaseAuthBackend`, and for the
 * same reasons: the REST surface is tiny and staying SDK-free keeps this
 * unit-testable with an injected `fetch`.
 *
 * RLS restricts every row to `auth.uid() = user_id`, so these calls carry the
 * user's access token and can only touch that user's own tokens.
 */
export interface PushTokenStore {
  /** Upsert this user's token for a platform (keyed on user_id + platform). */
  upsert(session: AuthSession, token: string, platform: string): Promise<void>
  /** Delete this user's token for a platform (called on explicit sign-out). */
  remove(session: AuthSession, platform: string): Promise<void>
}

export function createSupabasePushTokenStore(
  config: SupabaseConfig,
  fetchImpl: typeof fetch = fetch,
): PushTokenStore {
  const url = config.url.replace(/\/$/, '')

  function headers(accessToken: string): Record<string, string> {
    return {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
  }

  return {
    async upsert(session, token, platform) {
      // resolution=merge-duplicates makes this an INSERT ... ON CONFLICT DO
      // UPDATE on the (user_id, platform) primary key: a re-registering device
      // updates its row instead of creating a duplicate. updated_at is bumped
      // server-side by the push_tokens_set_updated_at trigger.
      const res = await fetchImpl(`${url}/rest/v1/push_tokens`, {
        method: 'POST',
        headers: {
          ...headers(session.accessToken),
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ user_id: session.user.id, platform, token }),
      })
      if (!res.ok) {
        throw new Error(`Failed to store push token (${res.status})`)
      }
    },

    async remove(session, platform) {
      // RLS already scopes deletes to the caller's rows; the platform filter
      // narrows to this device's token so signing out on one platform doesn't
      // clear another. The row's user_id is implied by the authenticated token.
      const res = await fetchImpl(
        `${url}/rest/v1/push_tokens?platform=eq.${encodeURIComponent(platform)}`,
        {
          method: 'DELETE',
          headers: headers(session.accessToken),
        },
      )
      if (!res.ok) {
        throw new Error(`Failed to remove push token (${res.status})`)
      }
    },
  }
}

/**
 * Persist a freshly-registered token, but only for an authenticated session
 * (a guest has no `user_id` to key on). Best-effort: a storage failure must
 * not surface as an app error, so it's swallowed — the device simply retries
 * on the next registration.
 */
export async function syncPushToken(
  store: PushTokenStore,
  state: AuthState,
  token: string,
  platform: string,
): Promise<void> {
  if (state.status !== 'authenticated') return
  try {
    await store.upsert(state.session, token, platform)
  } catch {
    // best-effort; see doc comment
  }
}

/**
 * Drop this device's token on explicit sign-out. Best-effort for the same
 * reason as syncPushToken: cleanup failing must never block sign-out.
 */
export async function clearPushToken(
  store: PushTokenStore,
  state: AuthState,
  platform: string,
): Promise<void> {
  if (state.status !== 'authenticated') return
  try {
    await store.remove(state.session, platform)
  } catch {
    // best-effort; see doc comment
  }
}
