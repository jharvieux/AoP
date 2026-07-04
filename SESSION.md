# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-04 (Issue #42 (Capacitor) scaffolded, PR #97 open, not merged)._

## Just completed

Executed issue #42 (Capacitor native builds + push notifications), previously skipped in
the Phase-3 sweep (PR #83) as a supervised-path conflict. Landed dependency-free scaffolding
on `feature/sweep-capacitor-42` (PR #97, **not merged — awaiting operator review/approval**):

- `apps/web/capacitor.config.ts` (typed locally, not against `@capacitor/cli`)
- `apps/web/src/plugins/{nativeBridge,pushNotifications,androidBackButton}.ts` — all
  feature-detect via Capacitor's runtime-injected `window.Capacitor` global, no
  `@capacitor/*` import required, so they compile and no-op safely on web today
- Safe-area/gesture audit: existing `env(safe-area-inset-*)`/`viewport-fit=cover`/
  Pointer-Events map pan-zoom confirmed correct; added `overscroll-behavior: contain`
- `scripts/capacitor/{setup,build-ios,build-android}.sh` for an operator to run later
- `docs/runbooks/capacitor-native.md` + `MEMORY.md` D-014 document why this stops short of
  installing `@capacitor/*` (new runtime deps — gated behind explicit operator approval per
  CLAUDE.md) and generating the native projects (needs full Xcode + an Android SDK, neither
  present in this sandbox)
- Opened follow-up issue #98 tracking the remaining steps (dependency install, native
  project generation, wiring a real match/turn screen once one exists, server-side
  FCM/APNs send + email-via-Resend fallback)
- `pnpm verify` green; no new dependencies added; PR #97 labeled `auto-triaged`

## Next steps

1. **Operator decision on #97/#98**: approve (or trim) the `@capacitor/*` dependency list,
   then someone with Xcode + Android Studio runs `scripts/capacitor/setup.sh` to actually
   generate the native projects. Until then #42 stays open.
2. **Below-cutoff items** (#39 tactical battle, #40 matchmaking, #41 map editor, #51 test
   tooling, #25 smarter AI, #43 monetization — also previously skipped as supervised, same
   root cause as #42) — queue for follow-up sweep.
3. **PR #70 / migrations**: per prior session, verify the `Supabase / migrations` CI job
   passes against the incremental migration once that PR's CI runs are checked.

## Prior session summary (2026-07-01 sweep, unchanged)

- **Issue-sweep complete**: 10 issues across 4 batches (audio, platform/PWA, auth,
  multiplayer) merged into `main` — PRs #82, #83, #84, #85.
- **Tests**: 126 engine tests, all passing; 28 web auth tests.
- **Engine invariants**: all 4 maintained.
- **Supabase credentials**: provisioned (`.env.local` + GitHub Actions secrets).
- **Blocked on operator**: #97/#98 (Capacitor dependency approval + native toolchain access).
