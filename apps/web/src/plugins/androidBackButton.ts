import { getNativePlugin, isNativePlatform } from './nativeBridge'

/**
 * Gesture audit finding (#42): the app is a single-page screen state machine
 * with no browser history/router (see App.tsx's `Screen` union). Left
 * unhandled, Android's hardware back button / gesture-nav back swipe falls
 * through to Capacitor's default behavior on the root view, which **exits
 * the app** instead of returning to the previous in-app screen — jarring
 * from any non-menu screen.
 *
 * Wires the (forward-scaffolded, not-yet-installed) `@capacitor/app`
 * `backButton` event to a caller-supplied handler. The handler returns
 * `true` if it navigated somewhere (so the app should stay open) or `false`
 * to fall back to the platform default (minimize/exit) — mirrors the
 * `canGoBack`-checking pattern Capacitor's own docs recommend.
 *
 * No-op on web and a no-op on native until the native project + `App`
 * plugin actually exist (see docs/runbooks/capacitor-native.md).
 */
export function registerBackButtonHandler(handler: () => boolean): () => void {
  if (!isNativePlatform()) return () => {}

  const plugin = getNativePlugin('App')
  if (!plugin?.addListener) return () => {}

  const listener = plugin.addListener('backButton', () => {
    const handled = handler()
    if (!handled) {
      const exitPlugin = getNativePlugin('App')
      void exitPlugin?.exitApp?.()
    }
  })

  return () => {
    void (listener as { remove?: () => void } | undefined)?.remove?.()
  }
}
