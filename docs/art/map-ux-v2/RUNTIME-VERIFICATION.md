# Map UX v2 — runtime verification

## Exact-source capture states

Every retained frame reported the requested inner dimensions, `aria-busy=false`, no
`.map-canvas-error`, no document overflow, zero pairwise intersections among the six map overlay
regions, no undersized visible direct target, and a 44 CSS px minimum direct target. Rectangles are
`[x, y, width, height]` CSS pixels. The 375 × 667 frame used DPR 2; every other frame used DPR 1.

| Viewport   | Mode         | Events                     | Alerts                 | Navigation              | Roster                      | Minimap                                 | Route                             | Dock                         |
| ---------- | ------------ | -------------------------- | ---------------------- | ----------------------- | --------------------------- | --------------------------------------- | --------------------------------- | ---------------------------- |
| 375 × 667  | SP           | `[8,112.5938,155,47.5938]` | `[8,164.5938,359,102]` | `[179,112.5938,188,44]` | `[8,517.2031,246,52]`       | `[262,464.2031,105,105]`                | `[93.75,412.2031,187.5,44]`       | `[0,577.2031,375,89.7969]`   |
| 390 × 844  | SP focus     | `[8,112.0938,170,47.5938]` | `[8,164.0938,374,102]` | `[194,112.0938,188,44]` | `[8,701.7031,247.5234,44]`  | `[272.8047,636.5078,109.1953,109.1953]` | `[97.5,584.5078,195,44]`          | `[0,754.2031,390,89.7969]`   |
| 844 × 390  | SP confirm   | `[12,76,240,44]`           | `[162,128,520,62]`     | `[644,76,188,44]`       | `[12,192.2031,236.3125,52]` | `[736,148.2031,96,96]`                  | `[300.0742,196.2031,243.8516,48]` | `[0,256.2031,844,133.7969]`  |
| 768 × 1024 | SP           | `[12,76,240,44]`           | `[124,128,520,62]`     | `[712,76,44,200]`       | `[12,878.2031,263.5234,44]` | `[636,802.2031,120,120]`                | `[262.0742,818.2031,243.8516,48]` | `[0,934.2031,768,89.7969]`   |
| 1024 × 768 | MP           | `[12,76,240,44]`           | `[252,128,520,62]`     | `[968,76,44,200]`       | `[12,647,234.2734,44]`      | `[889.125,586.0078,122.875,104.9922]`   | `[390.0742,587,243.8516,48]`      | `[0,703,1024,65]`            |
| 1440 × 900 | SP More open | `[12,81.7969,240,55.5938]` | `[460,81.7969,520,62]` | `[1384,81.7969,44,200]` | `[12,710.2031,263.5234,44]` | `[1278,604.2031,150,150]`               | `[598.0742,650.2031,243.8516,48]` | `[0,766.2031,1440,133.7969]` |
| 844 × 390  | MP confirm   | `[12,76,240,44]`           | `[162,128,520,62]`     | `[644,76,188,44]`       | `[12,225,234.2734,44]`      | `[736,186.9766,96,82.0234]`             | `[300.0742,221,243.8516,48]`      | `[0,281,844,109]`            |

The SP compact More menu was `[542,290,220,44]` in both open and confirm states. Its confirm state
contained Saves `[546,290,47.8203,44]`, Confirm Resign `[597.8203,290,96.8438,44]`, and Cancel
`[698.6641,290,52.6563,44]`. The MP confirm menu was `[422.0625,290,339.9375,44]` and fully
contained Diplomacy, Chat, Confirm Resign, Cancel, and Leave; Leave ended at x=758, 86 px inside
the 844 px document edge. The desktop open menu was `[840,800,220,44]` and retained Saves and
Resign. Each open/confirm menu had zero intersections with the six overlay regions, all visible
actions were at least 44 CSS px high, and City plus End Turn remained visible in every frame.

The in-app Browser does not emulate nonzero notch insets; these rectangles used zero environment
insets, while the four `env(safe-area-inset-*)` anchors remain source/test verified.

## Exact-source minimap, camera, and city evidence

At 390 × 844 the focused minimap showed a `2px solid rgb(200, 150, 44)` outline, accessible name
`Map overview`, and the literal `View` label inside a double/dashed viewport boundary. The cue
therefore does not depend on color. Independent exact-head browser verification also confirmed
that Enter moved the viewport and a hidden keyboard target was announced as `Tile column 31, row
31, unexplored` without disclosing hidden contents.

The current exact-head source and regression tests cover pointer/wheel cancellation before camera
mutation, every square/hex clamp path, map-smaller-than-viewport centering, and the repaired hex
keyboard keep-visible falsifier. They also cover the city overlay's single-dialog layering,
underlying-map inert state, close lifecycle, and focus restoration to City. The prior live numeric
camera and dialog observations were deliberately not carried across the source-head change; this
package labels these current-head claims as source/test evidence rather than a new live numeric
recheck.

## Fog and privacy

The final multiplayer fixture is an authoritative sanitized `PlayerView`. An explored but not
currently visible British city remains intentionally remembered as a static main-map landmark
and generic minimap dot. Enemy mobile entities require current visibility. The earlier negative
fixture supplied an enemy captain on a `visible:false` tile; server sanitization makes that state
impossible, so it was rejected and both MP frames were recaptured. The census found no #613
privacy regression. Pre-existing single-player accessibility/interaction side channels are
tracked separately in [#623](https://github.com/jharvieux/AoP/issues/623).

## Reduced motion and input limits

The in-app Browser does not expose media-query emulation, touch-device emulation, multitouch, or
video recording. No IAB reduced-motion or touch claim is made. Focused source and regression
falsifiers verify that reduced motion makes programmatic camera targets immediate, clears travel,
skips ambient ticker writes, preserves one static high-contrast selection state, and removes
nonessential DOM motion.

A separate exact-`c1824f22` iPhone 17 Pro Simulator run used native press-and-drag and
`XCUIElement.pinch`, then navigated the minimap, recentered on the fleet, fit the map, and completed
the two-tap route preview/confirmation flow in one contiguous 38.86-second MOV. XCTest passed 1/1.
The original 1206 × 2622 MOV is SHA-256 `06523603…`; its metadata is SHA-256 `1618a296…`. The
720 × 1566 GitHub-safe derivative is SHA-256 `5ce7e920…` and is durably attached to
[issue #613](https://github.com/user-attachments/assets/764e3854-47ee-4c34-bd7a-8c859a76d453).
This is Simulator evidence, not physical-hardware performance evidence.

## Verification

- Independent exact-source verification passed at application source
  `c1824f22bf14dca6d38f7519fd99affd789a8130`, tree
  `68b5529d91f15cdbfeeb0f612da5ee0c7ebd547d`, archive SHA-256
  `0464a34facfca2b4838983fccb0faa90932212d1c6e27932cca936f0f9e27903`.
- The verifier's full application gate passed: shared **5 files / 57 tests**, engine **37 / 765**,
  web **108 / 1007**, typechecks, Prettier, and build.
- All seven JPEG/JFIF RGB captures are below 300 KiB.
- The deterministic receipt rebuild and validator pass with negative controls for source, material,
  archive, hash, dimensions, budgets, required viewports/DPRs, overlay collisions, More-menu
  containment, action clipping, supplemental MP proof, approval, and durable touch integration.
- The operator approval is bound to evidence head
  `08717289778883d7adca6ff7a6f15b20fb7c6b25` in
  [issue #613](https://github.com/jharvieux/AoP/issues/613#issuecomment-5555054349).
