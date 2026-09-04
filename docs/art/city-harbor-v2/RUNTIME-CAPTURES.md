# City Harbor v2 — live runtime capture record

## Result

The refreshed live browser capture gate completed for issue #608's art/runtime scope on
2026-09-04; independent re-verification remains before checkpoint 2. A new Extra Large
hex game was advanced exclusively through visible game controls and normal
one-building-per-round construction. No fixture, developer shortcut, storage mutation,
or direct `GameState` edit was used.

The retained captures show the shipping city assets after fonts and images loaded in the
Codex in-app Browser against local Vite. They confirm that the empty foundations, dynamic
building layers, active-only shadows, mounted Pirate flag, labels, scrolling, and
supported 1×/3× zoom render through the real `CityScene` consumer rather than the proof
compositor. `RUNTIME-CAPTURE-BINDINGS.json` binds every JPEG to exact hashes of that
consumer, its shared layout, and its city-scene CSS.

The live game reached:

- starting state, round 1: Town Hall and Cutthroat Den;
- representative midgame, round 14: eight constructed buildings, including Grog House,
  Trade House, Corsairs' Hold, Sawmill, Distillery, and Iron Mine;
- fully built state, round 54: all fourteen constructed buildings, including Shipyard,
  Dread Arsenal, Buccaneers' Armory, Citadel, Driftwood Barricade, and Stone Wall.

## Capture inventory

| File                                                  | State / viewport                                 |   Bytes | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------ | ------: | ------------------------------------------------------------------ |
| `runtime-captures/starting-desktop-1440x900.jpg`      | Starting, desktop, 1×                            | 176,357 | `89de7ba00a0a5e6705322c903f92c8fade60bfbf53ab23750d802e4e6a712c78` |
| `runtime-captures/starting-phone-390x844.jpg`         | Starting, phone, 1×                              |  47,855 | `bc6d8e52326bc9d05210248308ab8db808c43314b83aa6a9477e1918fa536be8` |
| `runtime-captures/midgame-desktop-1440x900.jpg`       | Eight-building midgame, desktop, 1×              | 181,841 | `66f109101f63db133862cbd8996ab04d6c4521c9175e31d9fc43b762f007da30` |
| `runtime-captures/full-desktop-1440x900.jpg`          | Fully built, desktop, 1×                         | 185,565 | `b40c949c9030f5a9ef257b737fcbffcd5885867609fe8aa4e29c2efa95a515ba` |
| `runtime-captures/full-phone-390x844.jpg`             | Fully built, phone, 1×                           |  53,462 | `13172dd8ecfb18eed671cab105035bb0bbb4f0cda1f4fdc44de4afba25300c09` |
| `runtime-captures/full-phone-3x-center-390x844.jpg`   | Fully built, phone, 3× civic/recruitment detail  |  81,271 | `bc842cc1049edc505c57d8c8062c3787bbd3af3f430200c902ceeb4cf2680d29` |
| `runtime-captures/full-phone-3x-shipyard-390x844.jpg` | Fully built, phone, 3× shoreline/shipyard detail |  68,294 | `b658c7e0e5450c9ad5c83e655f8adc8f52edfbbdd0913c60b3df39929eb1c53d` |
| `runtime-captures/full-desktop-3x-1440x900.jpg`       | Fully built, desktop, 3× town-hall detail        | 244,147 | `3241b61b354be9a7704f22e113edea7754a1aae221c2ca0e5088dea78d16df1d` |

Every retained capture is below the repository's 300 KiB per-image ceiling. JPEG is used
only for review evidence; shipping assets remain the separately validated WebPs.

## Native inspection

- Starting, midgame, and fully built scenes contain exactly the constructed buildings
  reported by the live city roster; empty plots remain visible until built.
- The scene remains the dominant readable element at 1440×900 and 390×844. The major
  civic, economy, recruitment, fortification, and shoreline silhouettes remain distinct.
- Current 3× zoom exposes genuine roof, stone, timber, shore, and water detail without the
  former soft upscale or tile-join bands. The scrollable scene can reach the civic center,
  recruitment district, citadel, and shipyard.
- The shipyard's gangway visibly meets dry shoreline while the slip, crane, hull frame,
  and pilings remain over water.
- No baked future building, opaque checker/matte, detached alpha fragment, or fallback
  reflow was observed. At fitted 1× the smaller Pirate flag is fully visible and centered
  over Town Hall. At civic 3× the mast pin and V-brace visibly terminate on the central
  dome; normal panning can move the assembly partly or wholly outside the scroll viewport
  without clipping its scene geometry.

The five-faction live matrix is not duplicated here: faction art does not change building
geometry, and the deterministically rebuilt `proofs/factions/*.webp` set covers all five
flag assets using the same shared runtime layout. Independent re-verification remains.
Theme-override and failed-image cases are covered by executable `CityScene` tests; these
captures do not claim to picture those failure paths.

## Routed UI follow-up

This #608 gate evaluates the art set and its existing runtime consumer; city-management UI
redesign is explicitly outside #608. The live phone census found the existing city zoom
buttons at 44×32 and Garrison at 332×40, below the 44×44 target owned by #612. The existing
possessive copy also renders as “You's Capital” and “You's Flagship.” Both findings are
carried into #612's dedicated city-shell, target-size, and copy polish work and do not alter
the #608 art verdict.

The screenshot pixel dimensions reflect the browser viewport output. Source-density
coverage at DPR2, across every supported zoom stop including 3×, is separately measured
for every asset in `RESOLUTION-CENSUS.json`; these captures do not mislabel the screenshot
output as a DPR2 bitmap.
