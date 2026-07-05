/**
 * Native IAP scaffolding for the remove-ads purchase (#43, Phase 4 hook for #42
 * "Capacitor native builds"). The native iOS/Android projects and an IAP plugin
 * don't exist yet, and `@capacitor/core` isn't an installed dependency — adding
 * it is a new-runtime-dependency change gated behind explicit operator approval.
 *
 * Capacitor's native runtime injects a `window.Capacitor` global into the
 * WebView itself, no npm package required to *detect* it. Every function here
 * degrades to an inert, well-typed no-op on web (or before the native plugin
 * is registered), and lights up once #42 lands the real Capacitor project and
 * an in-app-purchase plugin is added.
 *
 * A real purchase still needs a server-side receipt-verification step before
 * it can grant the `remove_ads` entitlement (mirroring stripe-webhook for the
 * web flow) — that Edge Function isn't written yet since it needs real App
 * Store Connect / Play Console credentials to verify against, which is an
 * operator action. Wire it in once #42's native projects exist.
 */

interface CapacitorPlugin {
  purchase?: (opts: { productId: string }) => Promise<unknown> | unknown
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: Record<string, CapacitorPlugin>
}

interface WindowLike {
  Capacitor?: CapacitorGlobal
}

function defaultWindow(): WindowLike | undefined {
  return typeof window !== 'undefined' ? (window as unknown as WindowLike) : undefined
}

/** True when running inside a Capacitor-wrapped native shell (iOS/Android). */
export function isNativePlatform(win: WindowLike | undefined = defaultWindow()): boolean {
  return win?.Capacitor?.isNativePlatform?.() === true
}

export type NativePlatformName = 'ios' | 'android' | 'web'

/** 'ios' | 'android' | 'web' — mirrors Capacitor's own Platform values. */
export function nativePlatformName(
  win: WindowLike | undefined = defaultWindow(),
): NativePlatformName {
  const platform = win?.Capacitor?.getPlatform?.()
  return platform === 'ios' || platform === 'android' ? platform : 'web'
}

/**
 * Scaffolding name for the eventual IAP plugin (e.g. a RevenueCat- or
 * `@capacitor-community/in-app-purchases`-shaped `Purchases` plugin). Swap
 * once #42 lands the native project and a real plugin is chosen and installed.
 */
const IAP_PLUGIN_NAME = 'Purchases'
const REMOVE_ADS_PRODUCT_ID = 'remove_ads'

export type NativePurchaseResult = 'purchased' | 'cancelled' | 'unavailable' | 'error'

/**
 * Attempts the native remove-ads purchase. Resolves `'unavailable'` (never
 * throws) on web, or on native before a real IAP plugin is registered — so
 * callers can always treat this as a normal, if currently inert, purchase
 * attempt (docs/ARCHITECTURE.md §9's "fail gracefully").
 */
export async function purchaseRemoveAdsNative(
  win: WindowLike | undefined = defaultWindow(),
): Promise<NativePurchaseResult> {
  if (!isNativePlatform(win)) return 'unavailable'
  const plugin = win?.Capacitor?.Plugins?.[IAP_PLUGIN_NAME]
  if (!plugin?.purchase) return 'unavailable'

  try {
    const result = (await plugin.purchase({ productId: REMOVE_ADS_PRODUCT_ID })) as
      { cancelled?: boolean } | undefined
    return result?.cancelled ? 'cancelled' : 'purchased'
  } catch {
    return 'error'
  }
}
