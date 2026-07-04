/**
 * Capacitor config for the iOS/Android native wrappers (#42).
 *
 * Deliberately NOT typed against `@capacitor/cli`'s `CapacitorConfig` — that
 * package isn't installed yet (see docs/runbooks/capacitor-native.md for
 * why: adding it is a new-runtime-dependency change gated behind explicit
 * operator approval, per this repo's CLAUDE.md). `CapacitorConfigShape`
 * below covers the subset of the real schema this project needs; swap the
 * import for `import type { CapacitorConfig } from '@capacitor/cli'` the
 * moment the dependency lands — the values themselves don't need to change.
 */

interface CapacitorConfigShape {
  appId: string
  appName: string
  webDir: string
  ios?: { scrollEnabled?: boolean }
  android?: { allowMixedContent?: boolean }
  server?: { androidScheme?: string }
}

const config: CapacitorConfigShape = {
  // Placeholder reverse-DNS app id — pick the real one before submitting to
  // either app store (App Store Connect / Play Console bundle/package ID is
  // permanent once published).
  appId: 'com.ageofplunder.app',
  appName: 'Age of Plunder',
  // Vite's default build output (see vite.config.ts) — `pnpm build` before `cap sync`.
  webDir: 'dist',
  ios: {
    // The web app has no browser history/back-navigation of its own (single
    // React state machine — see App.tsx); disabling the WebView's own
    // rubber-band/scroll-chaining avoids double-handling swipe gestures
    // that the map canvas and bottom sheets already own via touch-action.
    scrollEnabled: false,
  },
  android: {
    allowMixedContent: false,
  },
  server: {
    // https by default; required for Android 9+ cleartext restrictions if a
    // future dev-server-on-device workflow points webDir at a live URL.
    androidScheme: 'https',
  },
}

export default config
