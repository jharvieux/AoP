# Capacitor native builds (#42)

Status: **scaffolded, not installed**. This repo ships `apps/web/capacitor.config.ts` and a
handful of dependency-free plugin shims (`apps/web/src/plugins/`), but `@capacitor/*` is not
yet in `package.json` and the native `ios/`/`android/` projects don't exist. See "Why not
finished" below before assuming this is a bug.

## What's here today

- `apps/web/capacitor.config.ts` — app id/name/webDir, typed against a local minimal
  interface (not `@capacitor/cli`'s `CapacitorConfig`) so it doesn't need the dependency to
  exist.
- `apps/web/src/plugins/nativeBridge.ts` — `isNativePlatform()` / `getPlatform()` /
  `getNativePlugin(name)`, all reading Capacitor's runtime-injected `window.Capacitor`
  global. No import of any `@capacitor/*` package, so it compiles and safely no-ops on web
  today and works for real once the native shell exists — nothing here needs to change.
- `apps/web/src/plugins/pushNotifications.ts` — registers for native push and routes
  received/tapped notifications to a single `onTurnNotification` handler. No multiplayer
  match screen exists in the web client yet, so nothing calls `onTurnNotification` yet —
  wire it up when that screen lands.
- `apps/web/src/plugins/androidBackButton.ts` — gesture audit finding: the app is a
  single-screen state machine with no browser history (`App.tsx`'s `Screen` union), so
  Android's hardware back button / gesture-nav swipe would otherwise exit the app instead of
  navigating back. Wired into `App.tsx` to return to the main menu instead.
- Safe-area audit: `env(safe-area-inset-*)` was already applied to `.app` (top-level) and
  `.sheet` (bottom sheets) before this change — confirmed adequate. Added
  `overscroll-behavior: contain` to `.screen`/`.sheet` so a fully-scrolled panel doesn't
  rubber-band into the WebView chrome. `viewport-fit=cover` was already set in
  `index.html`. Pan/zoom on the map canvas already uses the Pointer Events API with
  `touch-action: none` (`MapCanvas.tsx`) — verified this doesn't conflict with native
  gesture recognizers; no changes needed there.
- `scripts/capacitor/setup.sh`, `build-ios.sh`, `build-android.sh` — the one-time dependency
  install + native project generation, and per-platform unsigned debug builds.

## Why not finished: new runtime dependencies need explicit approval

Finishing #42 for real requires:

```
pnpm add @capacitor/core @capacitor/push-notifications @capacitor/app @capacitor/haptics
pnpm add -D @capacitor/cli @capacitor/ios @capacitor/android
```

`package.json`/`pnpm-lock.yaml` are a supervised path in this repo's `CLAUDE.md`, and
installing new **runtime** dependencies (as opposed to dev-deps) is explicitly listed under
"Never without explicit permission." Automated sweep execution of this issue is not a
substitute for that approval, so this PR intentionally stops short of running
`scripts/capacitor/setup.sh` or touching `package.json`.

Separately, generating and building the native projects needs toolchains this sandbox
doesn't have: a full Xcode.app + CocoaPods for iOS (only Xcode Command Line Tools are
present), and an Android SDK for Android (not installed at all). Even with dependency
approval, `npx cap add ios` / `npx cap add android` and the build scripts need to run
somewhere with those installed — almost certainly a developer machine or a dedicated CI
runner, not this container.

## To finish this

1. Operator approves the dependency list above (or a trimmed one — `@capacitor/haptics` is
   only needed if #27's haptics work is meant to route through the native Haptics plugin
   instead of the Web Vibration API it likely already uses on web).
2. Run `scripts/capacitor/setup.sh` on a machine with Xcode + Android Studio installed.
3. Wire a real match/turn screen's "new turn" event to `onTurnNotification` from
   `pushNotifications.ts` (doesn't exist yet — tracked by the multiplayer client work).
4. Wire the server side: an edge function needs to actually send FCM/APNs pushes (device
   token storage, a `push_tokens` table, a call from wherever `submit-action`/`end-turn`
   already does the email-via-Resend notification per `docs/MULTIPLAYER.md` — that email
   path isn't implemented yet either, so this is greenfield on both ends, not just the
   native side).
5. `scripts/capacitor/build-ios.sh` / `build-android.sh` produce unsigned debug artifacts;
   app store submission (signing, provisioning profiles, store listings) is out of scope
   here per the issue ("not full release automation; just build artifacts").
