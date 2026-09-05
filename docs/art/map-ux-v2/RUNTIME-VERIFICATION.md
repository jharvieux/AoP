# Map UX v2 — runtime verification

## Exact-source capture states

Every retained frame reported the requested inner dimensions at DPR 1, `aria-busy=false`, no
`.map-canvas-error`, no document overflow, zero pairwise intersections among the six map overlay
regions, no undersized visible direct target, and a 44 CSS px minimum direct target. Rectangles are
`[x, y, width, height]` CSS pixels.

| Viewport   | Mode            | Map                         | Events                     | Alerts                 | Navigation              | Roster                      | Minimap                                 | Route                             | Dock                        |
| ---------- | --------------- | --------------------------- | -------------------------- | ---------------------- | ----------------------- | --------------------------- | --------------------------------------- | --------------------------------- | --------------------------- |
| 375 × 667  | SP              | `[0,104.5938,375,472.6094]` | `[8,112.5938,155,47.5938]` | `[8,164.5938,359,102]` | `[179,112.5938,188,44]` | `[8,517.2031,246,52]`       | `[262,464.2031,105,105]`                | `[93.75,412.2031,187.5,44]`       | `[0,577.2031,375,89.7969]`  |
| 390 × 844  | SP              | `[0,104.5938,390,649.6094]` | `[8,112.5938,170,47.5938]` | `[8,164.5938,374,102]` | `[194,112.5938,188,44]` | `[8,702.2031,247.5234,44]`  | `[272.8047,637.0078,109.1953,109.1953]` | `[97.5,585.0078,195,44]`          | `[0,754.2031,390,89.7969]`  |
| 844 × 390  | SP              | `[0,64,844,236.203]`        | `[12,76,240,44]`           | `[162,128,520,62]`     | `[644,76,188,44]`       | `[12,236.203,236.3125,52]`  | `[736,192.203,96,96]`                   | `[300.0742,240.203,243.8516,48]`  | `[0,300.203,844,89.797]`    |
| 768 × 1024 | SP              | `[0,64,768,870.2031]`       | `[12,76,240,44]`           | `[124,128,520,62]`     | `[712,76,44,200]`       | `[12,878.2031,263.5234,44]` | `[636,802.2031,120,120]`                | `[262.0742,818.2031,243.8516,48]` | `[0,934.2031,768,89.7969]`  |
| 1024 × 768 | MP              | `[0,64,1024,639]`           | `[12,76,240,44]`           | `[252,128,520,62]`     | `[968,76,44,200]`       | `[12,647,234.2734,44]`      | `[889.125,586.0078,122.875,104.9922]`   | `[390.0742,587,243.8516,48]`      | `[0,703,1024,65]`           |
| 1440 × 900 | SP              | `[0,69.7969,1440,740.4063]` | `[12,81.7969,240,55.5938]` | `[460,81.7969,520,62]` | `[1384,81.7969,44,200]` | `[12,754.2031,263.5234,44]` | `[1278,648.2031,150,150]`               | `[598.0742,694.2031,243.8516,48]` | `[0,810.2031,1440,89.7969]` |
| 844 × 390  | MP supplemental | `[0,64,844,261]`            | `[12,76,240,44]`           | `[162,128,520,62]`     | `[644,76,188,44]`       | `[12,269,234.2734,44]`      | `[736,230.9766,96,82.0234]`             | `[300.0742,265,243.8516,48]`      | `[0,325,844,65]`            |

At 844 × 390, City measured 198.203 × 44 and End Turn 267.586 × 44. At 1440 ×
900, More remained a 198.211 × 44 visible target and its open menu visibly retained Saves and
Resign. Compact landscapes use a horizontal 188 × 44 navigation row. Every frame preserves a
useful central interaction area, and every overlay stays within the map and safe-layout offsets.
The in-app Browser does not emulate nonzero notch insets; these live rectangles used zero
environment insets, while the four `env(safe-area-inset-*)` anchors remain source/test verified.

## Live minimap, camera, and city observations

At 390 × 844 the focused minimap showed a static focus outline, a dashed keyboard cursor, and the
literal `View` label inside a double/dashed viewport boundary, so the viewport cue does not depend
on color. ArrowRight plus Enter changed the selected region and viewport; Home restored the full
`0%, 0%, 100%, 100%` fit. A pointer click focused the minimap and changed the viewport from
`38.3464%, 0%, 25.3906%, 42.3177%` to
`2.92969%, 59.0495%, 25.3906%, 40.9505%` without unbounding the page.

A direct canvas drag during a live zoom transition left the viewport at
`2.60417%, 61.5104%, 20.3125%, 33.8542%`; the values were byte-identical after 400 ms. A separate
zoom followed by wheel input left it at `8.32284%, 70.7022%, 8.7666%, 14.611%`, again identical
after 400 ms. Those supported mouse paths interrupted the programmatic move and remained inside
the 0–100% minimap bounds. Pure camera tests cover every clamp path, square/hex geometry,
map-smaller-than-viewport centering, and the repaired hex keyboard keep-visible falsifier.

City opened exactly one role=`dialog`, moved focus to Return to world map, and made the underlying
game screen inert. Closing it removed the dialog and inert state and restored focus to the exact
City button that launched it.

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
video recording. No live reduced-motion, pinch, or physical-touch claim is made. Focused source
and regression falsifiers verify that reduced motion makes programmatic camera targets immediate,
clears travel, skips ambient ticker writes, preserves one static high-contrast selection state,
and removes nonessential DOM motion. Pointer down/wheel cancel camera transition state before
mutation; touch first-tap preview/second-tap confirmation, pointer capture, pinch distinction,
keyboard cursor, and live announcements remain regression-covered.

The requested physical-touch recording covering drag, pinch, minimap navigation, fleet recenter,
fit, and route confirmation remains a **pending external gate**. A mouse drag, wheel, minimap
pointer/keyboard, city lifecycle, and all layout measurements were observed live, but they are not
substituted for that recording.

## Verification

- Independent exact-source verification passed at application source
  `a5a8fd5f8c522ebddfb146510b492bcea1c28ee2`, tree
  `71328fc4b018f021686ecefcd21f89a0ffc04c6a`, including the repaired hex cursor falsifier.
- Focused map/chrome regression passed: **5 files / 67 tests**.
- All seven JPEG/JFIF RGB captures are below 300 KiB.
- The deterministic receipt rebuild and validator pass with negative controls for source, material,
  hash, dimensions, budgets, required viewports, supplemental MP proof, approval, and the open
  touch gate.

Operator approval and the external physical-touch recording are intentionally not claimed here.
