# City Harbor v2 — live runtime capture record

## Result

The live browser capture gate was refreshed on 2026-09-05 against exact #613 target source
`c1824f22bf14dca6d38f7519fd99affd789a8130`. A truthful harness imported the shipping
`CityScreen` and `CityScene` components and created explicit Pirate starting, midgame, and
full fixtures. Shipping zoom controls were operated visibly. No storage mutation, direct
post-construction `GameState` edit, or synthetic visual reimplementation was used.

The operator approved these eight replacement files at evidence head
`08717289778883d7adca6ff7a6f15b20fb7c6b25`; the durable record is
[issue #608](https://github.com/jharvieux/AoP/issues/608#issuecomment-5555061289). The
earlier approval at evidence head `dc11b60738f4f14b896532bf2db323b2bd054f5c` is retained as a non-reusable
historical record in
[issue #608](https://github.com/jharvieux/AoP/issues/608#issuecomment-5551752263) and does
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
| `runtime-captures/starting-desktop-1440x900.jpg`      | Starting, desktop, 1×                            | 238,120 | `fc53d522de957fa8aa97e22abb2e2db6c11842e07e5923f147952f73fc233fd4` |
| `runtime-captures/starting-phone-390x844.jpg`         | Starting, phone, 1×                              |  52,961 | `d15dcb92c92f41639415e8f0933d6869c68f15e5ea2f7e8073f72865f83afd6d` |
| `runtime-captures/midgame-desktop-1440x900.jpg`       | Eight-building midgame, desktop, 1×              | 238,547 | `3fc99f09f5ba9449e8e93fe2345938116078e1f2b185a69390e0da33ee885ca3` |
| `runtime-captures/full-desktop-1440x900.jpg`          | Fully built, desktop, 1×                         | 242,624 | `7301275190ff760eb097f67675f65bba6b96ea382c6ec8b18f54b447794e248d` |
| `runtime-captures/full-phone-390x844.jpg`             | Fully built, phone, 1×                           |  54,215 | `e67bf68f329bb5cabcd5fbf03cf47130c27a187555c720b9e08184da2b84d22e` |
| `runtime-captures/full-phone-3x-center-390x844.jpg`   | Fully built, phone, 3× Town Hall/flag detail     |  51,971 | `e4460ee838e11a45726195ce6da56f405b0ad153783822c481f224b83fcca696` |
| `runtime-captures/full-phone-3x-shipyard-390x844.jpg` | Fully built, phone, 3× shoreline/shipyard detail |  41,210 | `b1378c52942f596428efb5f5c3721bf48301756a054d202705fd85a48c4a0b6e` |
| `runtime-captures/full-desktop-3x-1440x900.jpg`       | Fully built, desktop, 3× Town Hall/flag detail   | 217,395 | `91b31cfe44465978b82bf85223c0e36d8bc80e83bd88a86f8b00ecbda6d55c17` |

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
