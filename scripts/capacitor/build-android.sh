#!/usr/bin/env bash
# Builds the Android wrapper (unsigned debug APK — not app store submission).
# Requires scripts/capacitor/setup.sh to have been run first, and an Android
# SDK install (ANDROID_HOME / ANDROID_SDK_ROOT set).
set -euo pipefail
cd "$(dirname "$0")/../../apps/web"

if [ ! -d android ]; then
  echo "apps/web/android not found — run scripts/capacitor/setup.sh first." >&2
  exit 1
fi

pnpm build
npx cap sync android

cd android
./gradlew assembleDebug

echo "Built. Artifact under apps/web/android/app/build/outputs/apk/debug/app-debug.apk"
