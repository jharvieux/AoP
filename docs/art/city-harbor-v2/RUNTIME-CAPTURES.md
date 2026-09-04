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
consumer, its shared layout, building and faction content, and sprite routing. Binding
schema 2 fingerprints every `.city-scene` rule, the generic button states it inherits,
and the recursive `:root` token closure those rules consume. The full stylesheet hash is
retained as a diagnostic only, so an unrelated screen cannot invalidate city evidence
while any material city selector, token, component property, or source change still does.

The live game reached:

- starting state, round 1: Town Hall and Cutthroat Den;
- representative midgame, round 14: eight constructed buildings, including Grog House,
  Trade House, Corsairs' Hold, Sawmill, Distillery, and Iron Mine;
- fully built state, round 55: all fourteen constructed buildings, including Shipyard,
  Dread Arsenal, Buccaneers' Armory, Citadel, Driftwood Barricade, and Stone Wall.

## Capture inventory

| File                                                  | State / viewport                                 |   Bytes | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------ | ------: | ------------------------------------------------------------------ |
| `runtime-captures/starting-desktop-1440x900.jpg`      | Starting, desktop, 1×                            | 188,959 | `cf3ea9749f47e62cdacd8403771af885bf4fe2cc846dd9bcf7a8b0fa2329c648` |
| `runtime-captures/starting-phone-390x844.jpg`         | Starting, phone, 1×                              |  52,150 | `3278040cb365b79728a00adcd61cb212f3b853fefad53fe5ccd24839e5cab8a0` |
| `runtime-captures/midgame-desktop-1440x900.jpg`       | Eight-building midgame, desktop, 1×              | 191,844 | `8aefcb4f27a51c4bc5da17fe65146ccedec86ccd0b63d4142fb6b41899333616` |
| `runtime-captures/full-desktop-1440x900.jpg`          | Fully built, desktop, 1×                         | 196,088 | `a6d14c8099daef3f66c06a11e3dd5227f883db39fa6b0a61055726c472adb1b6` |
| `runtime-captures/full-phone-390x844.jpg`             | Fully built, phone, 1×                           |  57,466 | `c8189037a52f4c56d8b6d8a3e9db658d62538d6a5dc42bb8dc1180a89cfa5274` |
| `runtime-captures/full-phone-3x-center-390x844.jpg`   | Fully built, phone, 3× civic/recruitment detail  |  78,785 | `3213ad4bc81e89f4978c29a820198662e5be2d2bc9634bae99a5199725ca8fd7` |
| `runtime-captures/full-phone-3x-shipyard-390x844.jpg` | Fully built, phone, 3× shoreline/shipyard detail |  61,349 | `9498bd55a5f77be3ee74614d65f0bba122ca3a9b358e9b0f83bd237d4be4dc2f` |
| `runtime-captures/full-desktop-3x-1440x900.jpg`       | Fully built, desktop, 3× town-hall detail        | 265,635 | `4aa7a84647c413a353394f731ff68a07dcd7aad0cecead926cd0ca801ed47913` |

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
redesign is explicitly outside #608. The cumulative #610 chrome pass raised both city zoom
and Garrison actions to the 44×44 minimum and added explicit non-color disabled treatment.
The existing possessive copy still renders as “You's Capital” and “You's Flagship”; that
copy defect remains in #612's dedicated city-shell follow-up and does not alter the #608 art
verdict.

The screenshot pixel dimensions reflect the browser viewport output. Source-density
coverage at DPR2, across every supported zoom stop including 3×, is separately measured
for every asset in `RESOLUTION-CENSUS.json`; these captures do not mislabel the screenshot
output as a DPR2 bitmap.
