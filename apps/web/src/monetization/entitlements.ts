import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'

/**
 * Reads the caller's `entitlements` rows over PostgREST — same dependency-free
 * `fetch` approach as `SupabaseAuthBackend` (see auth/supabaseAuth.ts): a small,
 * stable REST surface, unit-testable with an injected `fetch`, no
 * `@supabase/supabase-js` in the client bundle.
 *
 * RLS restricts this to the caller's own rows (see
 * supabase/migrations/20260702000001_rls_policies.sql, `entitlements_select_own`).
 */
export class EntitlementsClient {
  private readonly url: string
  private readonly anonKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
    this.url = config.url.replace(/\/$/, '')
    this.anonKey = config.anonKey
    this.fetchImpl = fetchImpl
  }

  /** The entitlement `key`s (e.g. `'remove_ads'`) granted to this session's user. */
  async fetchKeys(session: AuthSession): Promise<string[]> {
    const path = `/rest/v1/entitlements?user_id=eq.${encodeURIComponent(session.user.id)}&select=key`
    const res = await this.fetchImpl(`${this.url}${path}`, {
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${session.accessToken}`,
      },
    })
    if (!res.ok) return []
    const rows = (await res.json().catch(() => [])) as unknown
    if (!Array.isArray(rows)) return []
    return rows
      .map((row) => (row as { key?: unknown }).key)
      .filter((key): key is string => typeof key === 'string')
  }
}

/** The entitlement key that suppresses `<AdSlot>` everywhere (docs/ARCHITECTURE.md §9). */
const REMOVE_ADS_KEY = 'remove_ads'

export function hasRemoveAds(keys: readonly string[]): boolean {
  return keys.includes(REMOVE_ADS_KEY)
}
