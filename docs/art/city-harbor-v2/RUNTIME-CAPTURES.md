# City Harbor v2 — live runtime capture record

## Result

The live browser capture gate was refreshed on 2026-09-04 against the integrated #612
city destination. A normal hex game was advanced exclusively through visible game
controls and one-building-per-round construction; the retained fully built save was
reopened through the visible Continue action. No fixture, developer shortcut, storage
mutation, or direct `GameState` edit was used.

The operator approved all eight exact files at evidence head
`dc11b60738f4f14b896532bf2db323b2bd054f5c`; the approval is recorded in
[issue #608](https://github.com/jharvieux/AoP/issues/608#issuecomment-5551752263). Approval
carries forward only across docs/evidence-only commits while the bound source, CSS, art, and
capture bytes remain exact.

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
| `runtime-captures/starting-desktop-1440x900.jpg`      | Starting, desktop, 1×                            | 279,096 | `6b8f8fdca0cc81de38db160cd4684837645057ceb77db15374c7c387a3c271c8` |
| `runtime-captures/starting-phone-390x844.jpg`         | Starting, phone, 1×                              |  59,856 | `6bed727cfc3f50bc546388d5edfb875af34d610ffe96ceb9b4acfa81de60ff55` |
| `runtime-captures/midgame-desktop-1440x900.jpg`       | Eight-building midgame, desktop, 1×              | 280,020 | `a422de677228c6b8de6dadc9c8dec306b45af369c0b8f369237d1420e58e7c40` |
| `runtime-captures/full-desktop-1440x900.jpg`          | Fully built, desktop, 1×                         | 284,730 | `77b19a10b843d00bc5c40850d940e4b16575e2964b89c6d6042fb39c2bba9eb7` |
| `runtime-captures/full-phone-390x844.jpg`             | Fully built, phone, 1×                           |  62,095 | `ef6ef75e06cd51f0503b5b3294f315cb5b7143315ab2ce19a34c6e4c2cb4b373` |
| `runtime-captures/full-phone-3x-center-390x844.jpg`   | Fully built, phone, 3× Town Hall/flag detail     |  61,467 | `16eaaef6d6782417a9d55456bb9c9d80fecb46f5d81904d390591066ed5f3254` |
| `runtime-captures/full-phone-3x-shipyard-390x844.jpg` | Fully built, phone, 3× shoreline/shipyard detail |  48,222 | `3d0c90a5d59cf7ed4e44702188246a431451924bdeb6f1ea43549c65a4d3cc2d` |
| `runtime-captures/full-desktop-3x-1440x900.jpg`       | Fully built, desktop, 3× Town Hall/flag detail   | 259,691 | `1a4d19074ed92035e3bbdc80916bb04b381ebc759f35902fa9670e42d4252b3a` |

Every retained capture is below the repository's 300 KiB per-image ceiling. JPEG is used
only for review evidence; shipping assets remain the separately validated WebPs.

## Native inspection

The integration owner inspected all eight retained JPEGs at native size after the city scene
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
