# #613 deterministic touch-recording harness

This isolated fixture mounts the shipping `MapCanvas` directly. It exists to record real iPhone
Simulator touch behavior without guessing canvas coordinates or substituting browser-dispatched
pointer events.

The fixture is deliberately small and fixed:

- 12 × 12 square map containing only deep water and shallows;
- one preselected Pirate captain at `(2,7)` with 1 movement point;
- no cities, encounters, land sites, or parties;
- empty water target `(9,7)` / **column 10, row 8**, seven movement steps away;
- the real `Minimap`, Zoom, Center on fleet, and Fit to map controls rendered by `MapCanvas`;
- a supplied `onSetCourse` callback that records its argument in visible fixture state without
  changing the captain, map, or any game state.

The first target tap must expose the shipping text
`Course preview — tap again to set course`. The second must expose
`Queued course confirmed — column 10, row 8`, which is the fixture's visible observation that the
shipping component invoked `onSetCourse({ x: 9, y: 7 })`.

## Exact coordinate, not a guessed pixel

The target reticle does not appear until the real **Fit to map** button is tapped and its production
camera transition has had 450 ms to settle. The fixture then uses the shipping `fitMapCamera` and
`cellCenter` functions, the live map element dimensions, and `MapCanvas`'s 32 px tile contract to
position a pointer-events-none DOM reticle exactly over `(9,7)`.

`TouchRecordingUITests.swift` reads the real map and reticle frames from XCTest, converts the
reticle centre to an `XCUIElement`-normalized map coordinate, and taps that coordinate. It contains
no viewport-specific pixels. `window.__AOP_TOUCH_RECORDING__.measure()` exposes the same read-only
geometry and observable outcome for inspection; it exposes no mutation or camera-control method.

## Build and binding checks

From the repository root:

```sh
node docs/art/map-ux-v2/tools/touch-recording/check.mjs
pnpm --filter @aop/web exec tsc \
  -p ../../docs/art/map-ux-v2/tools/touch-recording/tsconfig.json
pnpm --filter @aop/web exec vite build \
  --config ../../docs/art/map-ux-v2/tools/touch-recording/vite.config.ts
```

Serve the no-cache fixture on its fixed origin:

```sh
pnpm --filter @aop/web exec vite \
  --config ../../docs/art/map-ux-v2/tools/touch-recording/vite.config.ts
```

Open `http://127.0.0.1:4613/`. Wait for Fit to become enabled before interacting.

`BINDING.json` binds ordinary SHA-256 hashes for the complete `apps/web/src`, public assets,
engine/content/shared source, build inputs, and every harness input to source commit
`c1824f22bf14dca6d38f7519fd99affd789a8130` (tree
`68b5529d91f15cdbfeeb0f612da5ee0c7ebd547d`). The checker also rejects scope escape, source drift,
fixture drift, target occupation/in-range drift, browser event injection, direct game-state mutation,
and a premature recording claim.

## Final-source freeze gate

The current binding proves the harness against the final integrated application source used for the
definitive native XCTest recording. `BINDING.json` intentionally says
`recording.status = "not-recorded"` and has no video path because this file binds reproducible source
and fixture inputs only; recording products and their run metadata are admitted into the final
evidence package separately.

After all runtime fixes are integrated, freeze that application source in a commit first. Then, in
a follow-up harness-only commit:

1. replace `SOURCE_HEAD` / `sourceHead` in `fixtureData.ts` and `check.mjs` with the frozen commit;
2. replace `SOURCE_TREE` / `sourceTree` with `git rev-parse <frozen-commit>^{tree}`;
3. run `node docs/art/map-ux-v2/tools/touch-recording/check.mjs --write`;
4. rerun the check and Vite build;
5. only then record the final Simulator run.

Any runtime byte change after that freeze makes the checker fail. Do not copy a video into the
evidence package or change an approval/manifest until the frozen-head run itself passes.

## Ephemeral iPhone Simulator/XCUITest recording

The checked-in Swift file is a test asset, not a persistent Xcode project. On a Mac with full Xcode
and an iPhone Simulator runtime:

1. In a temporary directory such as `/private/tmp/AoPTouchRunner`, create a minimal iOS App with a
   UI Testing target. The app's own UI is irrelevant; it only hosts the test runner.
2. Replace the generated UI test with `TouchRecordingUITests.swift` and ensure target membership is
   the UI Testing bundle.
3. Start the fixed Vite server above.
4. Boot the same named iPhone Simulator used for the evidence and open the fixture:

   ```sh
   export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
   xcrun simctl boot "iPhone 17 Pro"
   open -a Simulator
   xcrun simctl bootstatus booted -b
   xcrun simctl openurl booted http://127.0.0.1:4613/
   ```

   If that simulator is already booted, omit the first command. Complete Mobile Safari's first-run
   screen before recording, if present.

5. Start Simulator video capture outside the repository, run only the named UI test, then stop the
   recorder cleanly:

   ```sh
   xcrun simctl io booted recordVideo --codec=h264 --force \
     /private/tmp/aop-613-touch-recording.mov &
   RECORDER_PID=$!

   xcodebuild test \
     -project /private/tmp/AoPTouchRunner/AoPTouchRunner.xcodeproj \
     -scheme AoPTouchRunner \
     -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' \
     -only-testing:AoPTouchRunnerUITests/TouchRecordingUITests/testShippingMapTouchRecording

   kill -INT "$RECORDER_PID"
   wait "$RECORDER_PID"
   ```

The test performs, in order, an XCTest press/drag, `XCUIElement.pinch`, minimap tap, fleet recenter,
fit, and two taps at the mechanically derived target. It retains screenshots immediately after the
dynamic preview and queued-course confirmation. A pass is the functional proof; the `.mov` is the
visual record tied to the frozen binding.

Keep the `.xcresult`, exported XCTest attachments, contiguous Simulator movie, and a hash manifest
together. The deterministic web build and binding check remain locally executable without Xcode.
