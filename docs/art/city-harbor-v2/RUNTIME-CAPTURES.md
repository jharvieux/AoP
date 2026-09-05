# City Harbor v2 — live runtime capture record

## Result

The live browser capture gate was refreshed on 2026-09-05 against exact #613 target source
`a5a8fd5f8c522ebddfb146510b492bcea1c28ee2`. A truthful harness imported the shipping
`CityScreen` and `CityScene` components and created explicit Pirate starting, midgame, and
full fixtures. Shipping zoom controls were operated visibly. No storage mutation, direct
post-construction `GameState` edit, or synthetic visual reimplementation was used.

Direct operator approval of these eight replacement files is pending. The approval at
evidence head `dc11b60738f4f14b896532bf2db323b2bd054f5c` is retained as a non-reusable
historical record in
[issue #608](https://github.com/jharvieux/AoP/issues/608#issuecomment-5551752263); it does
not approve the current bytes.

The retained captures were taken after the production preview visibly settled with the
city imagery and project fonts present. They confirm that empty foundations, dynamic
building layers, active-only shadows, the Town Hall-mounted Pirate flag, labels,
scrolling, and supported 1×/3× zoom render through the real `CityScene` consumer rather
than the proof compositor. `RUNTIME-CAPTURE-BINDINGS.json` binds every JPEG to exact
hashes of that consumer, its shared layout, building and faction content, sprite routing,
and the city-scene CSS/token closure. The full stylesheet hash remains diagnostic only,
so unrelated-screen CSS cannot invalidate city-art evidence while a material city-scene
selector, token, component property, or source change still does.

The live game reached:

- starting state, round 1: Town Hall and Cutthroat Den;
- representative midgame, round 13: eight constructed buildings, including Grog House,
  Trade House, Sawmill, Distillery, Iron Mine, and Driftwood Barricade;
- fully built state, round 54: all fourteen constructed buildings, including Shipyard,
  Dread Arsenal, Buccaneers' Armory, Citadel, Driftwood Barricade, and Stone Wall.

## Capture inventory

| File                                                  | State / viewport                                 |   Bytes | SHA-256                                                            |
| ----------------------------------------------------- | ------------------------------------------------ | ------: | ------------------------------------------------------------------ |
| `runtime-captures/starting-desktop-1440x900.jpg`      | Starting, desktop, 1×                            | 237,116 | `b5cae3bfd07ab97c8aa6eaba53162d2bdaa49c8eeef3921254350e112b523678` |
| `runtime-captures/starting-phone-390x844.jpg`         | Starting, phone, 1×                              |  52,088 | `6cc22627a0f2c0838efcb9f36589e9e72e095122fd23fa6eabf003962ff28205` |
| `runtime-captures/midgame-desktop-1440x900.jpg`       | Eight-building midgame, desktop, 1×              | 237,477 | `cbc12a310450ab6c85641df6e6b28983fa87143020a447d54e29fef365b11af7` |
| `runtime-captures/full-desktop-1440x900.jpg`          | Fully built, desktop, 1×                         | 241,364 | `da8e255f134f82135bd97bfc1e6a6f49ba5fcd0591ad80a78661804c6e006928` |
| `runtime-captures/full-phone-390x844.jpg`             | Fully built, phone, 1×                           |  53,418 | `bca3cd1b04de09916344f1040688914a23b7b64e3b7d42c0e14a177777d321c4` |
| `runtime-captures/full-phone-3x-center-390x844.jpg`   | Fully built, phone, 3× Town Hall/flag detail     |  51,196 | `d50a451d33471ab40a195301f0fb362e45be2d6b3c32b881b7082daa7330ef22` |
| `runtime-captures/full-phone-3x-shipyard-390x844.jpg` | Fully built, phone, 3× shoreline/shipyard detail |  40,114 | `b698c7a907aa11c04aa118448cc9cf99b2cde71ea71a509163a3ec6a7d541cc2` |
| `runtime-captures/full-desktop-3x-1440x900.jpg`       | Fully built, desktop, 3× Town Hall/flag detail   | 221,797 | `704a3449008342fa57cf3d6ea5879d7096c046ebce4c3495b9e122c72ce2e6e0` |

Every retained capture is below the repository's 300 KiB per-image ceiling. JPEG is used
only for review evidence; shipping assets remain the separately validated WebPs.

## Native inspection

The integration owner inspected all eight replacement JPEGs at native size after the city scene
and project fonts visibly settled. This is a visual review record, not a claim that capture
automation programmatically awaited fonts or images.

- Starting, midgame, and fully built scenes contain exactly the constructed buildings
  reported by the live city roster; empty plots remain visible until built.
- The scene remains the dominant readable element at 1440×900 and 390×844. On portrait
  phones the fitted harbor is aligned to the upper scene frame without the former tall
  letterbox; status controls remain anchored below. The major civic, economy,
  recruitment, fortification, and shoreline silhouettes remain distinct.
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

## Integrated city-shell boundary

These refreshed frames include #612's dedicated city destination rather than the former
generic task sheet. The mounted flag, art layers, construction truth, and shoreline
relationship remain #608 evidence; the surrounding responsive inspector/drawer, corrected
“Your Capital” and “Your Flagship” copy, 44×44 controls, focus behavior, and management
layout are verified by the separate `docs/art/city-ui-v2/` package.

The screenshot pixel dimensions reflect the browser viewport output. Source-density
coverage at DPR2, across every supported zoom stop including 3×, is separately measured
for every asset in `RESOLUTION-CENSUS.json`; these captures do not mislabel the screenshot
output as a DPR2 bitmap.
