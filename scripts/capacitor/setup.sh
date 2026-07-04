#!/usr/bin/env bash
# One-time setup for the Capacitor iOS/Android native wrappers (#42).
#
# NOT run automatically by CI or by the agent that scaffolded this — adding
# these packages to package.json/pnpm-lock.yaml is a new-runtime-dependency
# change gated behind explicit operator approval (see this repo's CLAUDE.md
# and docs/runbooks/capacitor-native.md). Run this yourself once you've
# approved the dependency list below.
#
# Requires, on top of the usual toolchain:
#   - Xcode (full app, not just Command Line Tools) + CocoaPods, for iOS
#   - Android Studio + an Android SDK install, for Android
set -euo pipefail
cd "$(dirname "$0")/../../apps/web"

pnpm add @capacitor/core @capacitor/push-notifications @capacitor/app @capacitor/haptics
pnpm add -D @capacitor/cli @capacitor/ios @capacitor/android

# capacitor.config.ts already exists (committed) — no `cap init` needed, it
# would just prompt to overwrite. `cap add` reads it directly.
pnpm build
npx cap add ios
npx cap add android

echo "Native projects created under apps/web/ios and apps/web/android."
echo "Next: pnpm build && npx cap sync, then open in Xcode / Android Studio."
