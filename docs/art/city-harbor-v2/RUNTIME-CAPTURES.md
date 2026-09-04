# City Harbor v2 — live runtime capture record

## Result

The live browser gate passed for issue #608's art/runtime scope on 2026-09-04. A new
Extra Large hex game was advanced exclusively through visible game controls and normal
one-building-per-round construction. No fixture, developer shortcut, storage mutation,
or direct `GameState` edit was used.

The retained captures show the shipping city assets after fonts and images loaded in the
Codex in-app Browser against local Vite. They confirm that the empty foundations, dynamic
building layers, active-only shadows, Pirate flag, labels, scrolling, and supported 1×/3×
zoom render through the real `CityScene` consumer rather than the proof compositor.

The live game reached:

- starting state, round 1: Town Hall and Cutthroat Den;
- representative midgame, round 13: eight constructed buildings, including Grog House,
  Trade House, Corsairs' Hold, Sawmill, Distillery, and Iron Mine;
- fully built state, round 53: all fourteen constructed buildings, including Shipyard,
  Dread Arsenal, Buccaneers' Armory, Citadel, Driftwood Barricade, and Stone Wall.

## Capture inventory

| File                                                  | State / viewport                                 |   Bytes | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------ | ------: | ------------------------------------------------------------------ |
| `runtime-captures/starting-desktop-1440x900.jpg`      | Starting, desktop, 1×                            | 178,670 | `7062fbff416712e62f2ca37cf4068fce50f2f6c7373a15c8f18605ec2db7faf0` |
| `runtime-captures/starting-phone-390x844.jpg`         | Starting, phone, 1×                              |  48,560 | `c4556a56c4889e87568731bb1ccbfbfb78114e494b3de9eb4ec5c7ba75f9713e` |
| `runtime-captures/midgame-desktop-1440x900.jpg`       | Eight-building midgame, desktop, 1×              | 183,925 | `356e1baf650fd28cd28d533bb9a44f7e1c83fc6da351cdc9960106b1884daaa9` |
| `runtime-captures/full-desktop-1440x900.jpg`          | Fully built, desktop, 1×                         | 188,082 | `31bc5abec46bee5806308f603749ce874a4ba80531109c41c7dd3bda910e7af4` |
| `runtime-captures/full-phone-390x844.jpg`             | Fully built, phone, 1×                           |  54,152 | `c5ad74adb52ff81677a8c2d1fda4357e25cd8dc7a2a9d82f2dbdb1ecd943312e` |
| `runtime-captures/full-phone-3x-center-390x844.jpg`   | Fully built, phone, 3× civic/recruitment detail  |  69,121 | `88330ea3630f21661ff17b3b6d75e672d0318526bcd9f0e6f88b349d740e2da0` |
| `runtime-captures/full-phone-3x-shipyard-390x844.jpg` | Fully built, phone, 3× shoreline/shipyard detail |  69,248 | `4daf1d93553edcad51667b0676ef103eeb4c29a23f7bf433ad93e1ed6d621382` |
| `runtime-captures/full-desktop-3x-1440x900.jpg`       | Fully built, desktop, 3× town-hall detail        | 256,700 | `890accb8553972fda3e9bee92b990257c2fcc8d2eccef74a5139455ce3912fe7` |

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
  reflow was observed. At fitted 1× the Pirate flag is fully visible; at 3× normal panning
  can move it partly or wholly outside the scroll viewport without clipping its scene
  geometry.

The five-faction live matrix is not duplicated here: faction art does not change building
geometry, and the independently verified `proofs/factions/*.webp` set covers all five flag
assets using the same shared runtime layout. Theme-override and failed-image cases remain
covered by executable `CityScene` tests; these captures do not claim to picture those
failure paths.

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
