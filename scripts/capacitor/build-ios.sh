#!/usr/bin/env bash
# Builds the iOS wrapper (unsigned debug artifact — not app store submission).
# Requires scripts/capacitor/setup.sh to have been run first, and a full
# Xcode install (not just Command Line Tools) with CocoaPods.
set -euo pipefail
cd "$(dirname "$0")/../../apps/web"

if [ ! -d ios ]; then
  echo "apps/web/ios not found — run scripts/capacitor/setup.sh first." >&2
  exit 1
fi

pnpm build
npx cap sync ios

xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath ios/build \
  build

echo "Built. Artifact under apps/web/ios/build/Build/Products/Debug-iphonesimulator/App.app"
