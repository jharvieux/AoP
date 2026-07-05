export interface AdNetworkConfig {
  /** Ad network's loader script `src`. */
  scriptUrl: string
  /** Ad unit / slot id passed through to that script. */
  slotId: string
}

/**
 * Reads the web ad network config from Vite env, same "null when unset" shape
 * as `resolveSupabaseConfig` (auth/config.ts). Unset means no ad network is
 * configured for this build — `<AdSlot>` renders nothing rather than a broken
 * placeholder (docs/ARCHITECTURE.md §9's "fail gracefully").
 */
export function resolveAdNetworkConfig(
  env: Record<string, string | undefined> = import.meta.env as unknown as Record<
    string,
    string | undefined
  >,
): AdNetworkConfig | null {
  const scriptUrl = env.VITE_AD_NETWORK_SCRIPT_URL
  const slotId = env.VITE_AD_NETWORK_SLOT_ID
  if (!scriptUrl || !slotId) return null
  return { scriptUrl, slotId }
}
