/**
 * Capacitor feature-detection, dependency-free.
 *
 * #42 (Capacitor native builds + push notifications): the native iOS/Android
 * projects aren't generated yet, and `@capacitor/core` isn't an installed
 * dependency (adding it is a new-runtime-dependency change gated behind
 * explicit operator approval — see docs/runbooks/capacitor-native.md).
 *
 * Capacitor's native runtime injects a `window.Capacitor` global into the
 * WebView itself — no npm package or import required to *detect* it. That
 * lets this module (and everything built on it) compile and run correctly
 * today on web, and light up for real the moment the native shell exists,
 * with no changes needed here.
 *
 * Once `@capacitor/core` is installed, callers that need typed plugin access
 * should import `Capacitor` from `@capacitor/core` directly instead of this
 * shim — keep this file limited to the parts of the app that must stay
 * buildable without the dependency present.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: Record<string, Record<string, (...args: unknown[]) => unknown>>
}

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal
  }
}

/** True when running inside a Capacitor-wrapped native shell (iOS/Android), false on web. */
export function isNativePlatform(): boolean {
  return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true
}

/** 'ios' | 'android' | 'web' — mirrors Capacitor's own Platform values. */
export function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web'
  const platform = window.Capacitor?.getPlatform?.()
  return platform === 'ios' || platform === 'android' ? platform : 'web'
}

/**
 * Looks up a native plugin registered by the Capacitor runtime (e.g.
 * `getNativePlugin('PushNotifications')`). Returns undefined on web or if
 * the plugin isn't registered in the native build yet. Prefer the typed
 * `@capacitor/*` package import once one is installed — this exists so
 * plugin-shaped scaffolding (see pushNotifications.ts) can be written and
 * type-checked before any Capacitor dependency lands in package.json.
 */
export function getNativePlugin(name: string) {
  if (typeof window === 'undefined') return undefined
  return window.Capacitor?.Plugins?.[name]
}
