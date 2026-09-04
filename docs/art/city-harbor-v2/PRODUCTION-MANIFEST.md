# City Harbor v2 — production candidate manifest

## Status

Issue #608 checkpoint 1 and the Direction B city refinement are operator-approved. This
package is the complete runtime/capture candidate for operator checkpoint 2, including
the requested faction mast, pin, and V-brace physically mounted to Town Hall’s central
dome. Refreshed live starting/midgame/full, phone, desktop, and maximum-zoom captures are
bound to the exact shipping sources in `RUNTIME-CAPTURE-BINDINGS.json`; checkpoint 2 does
not claim approval until independent re-verification and explicit operator acceptance.

The production batch keeps the exact existing `SCENE_SLOTS` rectangles and content IDs.
It replaces the shipping city URLs with WebP art for the backdrop, all fourteen building
IDs, and the `building:citadel:tower` accessory. `city.buildings` remains the sole source
of constructed-state truth. No engine, save, replay, theme schema, dependency, manifest,
workflow, or asset-allowlist change is part of this batch.

## Composition and runtime contract

| Property           | Production candidate                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Scene              | 16:11; 6144×4224 authored backdrop; 24 shipping 1024×1056 tiles with 2 px codec bleed                                              |
| Constructed art    | 14 separate building cutouts plus separate citadel tower                                                                           |
| Cutout size        | 921–1580 px maximum edge; genuine-alpha WebP                                                                                       |
| Camera/light       | weak-orthographic 55° view; northwest light; cool water bounce                                                                     |
| Material language  | warm limestone, weathered timber, red-clay/shingle accents, restrained brass                                                       |
| Empty layer        | terrain, coast, road, water, vegetation, and unoccupied foundations only                                                           |
| Placement          | unchanged current percentages and bottom-center anchors from shared `citySceneLayout.json`                                         |
| Depth              | stable P0 civic, P1 shore, P2 districts, P3 fortification; baseline-sorted within a pass                                           |
| Theming            | theme override first; failed override retries shipping local art; failed local art exposes the existing category/gradient fallback |
| Asset ceiling      | every runtime file ≤300 KiB                                                                                                        |
| First-open ceiling | backdrop + 14 buildings + tower + largest faction flag ≤3 MiB                                                                      |

Measured candidate transfer is 3,012,646 bytes of city art plus the 22,910-byte largest
faction flag, or 3,035,556 bytes (2.90 MiB) total. The largest individual runtime file is
`townhall.webp` at 203,636 bytes; the largest retained review proof is 291,700 bytes.

The final backdrop is a deterministic authoring composite. P10 supplies all fourteen
unoccupied foundation regions; a feathered lower-right terrain patch from the previously
approved P8 corrected-shore source restores the immutable shipyard relationship that P10
partially receded. The shipyard slot and anchor do not move: its short landward gangway
meets dry sand/limestone while its drydock, slipway, and pilings remain over luminous water.

Each compressed tile carries a deterministic two-pixel bleed. Runtime and proof consumers
crop that codec edge and expand the 1020×1052 interior into its fixed layout cell. The 24
cells are persistent and explicitly positioned, so one or several failed images expose
only their own transparent cells over the CSS fallback without reflowing later tiles.

## Production source inventory

Active generated sources:

- backdrop foundations: `sources/empty-harbor-source-r3.webp` (P10), with P8 shore patch;
- retained checkpoint roles: P2 town hall, P3 tavern, P4 trade house, P6 stone wall, P9 shipyard;
- cleaned barracks: `sources/barracks-source-r2.webp` (P11; no human-shaped dummies);
- economy: `sawmill-source-r1.webp`, `ironmine-source-r1.webp`, `distillery-source-r1.webp` (P12–P14);
- fortification: `palisade-source-r1.webp`, `citadel-source-r1.webp`, `citadel-tower-source-r1.webp` (P15, P16, P20);
- recruitment: `garrisonhall-source-r1.webp`, `fortress-armory-source-r1.webp`, `grand-arsenal-source-r1.webp` (P17–P19).
- close-zoom backdrop detail: 24 distinct retained H01–H24 tiles, composed with P10/P8
  as spatial authority into a 6144×4224 shipping source;
- close-zoom town hall: two overlapping H25/H26 detail edits, similarity-gated onto the
  P2 geometry and semantic mask as `townhall-source-r3.webp`.

All P10–P20 built-in results were retained; none was rejected. Two outputs arrived in RGBA
containers, but no service-provided alpha was trusted. Every constructed source went
through the same semantic-mask pipeline used to repair checkpoint 1. The three older,
rejected P2–P4 transparency retries remain truthfully recorded in `PROVENANCE.json`.

Exact P10–P20 text is in `PRODUCTION-PROMPTS.md`; P10–P20 hashes and input roles are in
`PRODUCTION-PROVENANCE.json`. Fully expanded H01–H26 prompts, hashes, reference roles, and
the six rejected pilot calls are in `HIGH-RES-PROVENANCE.json`. P1–P9 and the historical
rejected retries remain in `PROMPTS.md` and `PROVENANCE.json`. The validator recomputes
all retained provenance and `PRODUCTION-OUTPUT-HASHES.json` entries.

## Alpha and matte acceptance

`tools/build_subject_masks.py` applies cached `rembg` `isnet-general-use` to all fifteen
constructed sources, keeps the largest alpha-128 subject without filling holes, rebuilds a
narrow antialiased edge, and extends trusted interior color through that edge. The final
cutout composer reserves twelve transparent pixels after resize even when a generated
subject touched its source canvas.

`tools/validate_production.py` rejects:

- any alpha-8 or alpha-128 disconnected subject island;
- a soft fringe more than five pixels from opaque art;
- meaningful alpha entering the eight-pixel safety band;
- lost enclosed transparency in open structures, which would indicate a painted checker
  or internal matte;
- missing magenta/dark-teal stress, state, faction, phone, or zoom evidence;
- shipyard art that does not occupy both the dry-shore and water witness regions;
- a faction cloth that clips, or a mast base and V-brace that miss Town Hall subject alpha
  at phone/desktop and every supported zoom stop;
- any of the 38 shipping tile joins whose mean or p99 delta exceeds both its absolute
  visibility limit and twice the adjacent within-tile gradient;
- source/proof/runtime files above 300 KiB or a fully built transfer above 3 MiB;
- provenance hash drift, stale live-capture bindings, or non-deterministic recomposition.

## Review evidence

Primary native files:

- `RUNTIME-CAPTURES.md` and `runtime-captures/*.jpg` — live game progression and actual
  browser layout/sampling at 1440×900 and 390×844, including the current 3× zoom;
- `RUNTIME-CAPTURE-BINDINGS.json` — exact hashes binding every live JPEG to the shipping
  `CityScene`, shared layout, and city-scene CSS sources;
- `proofs/production-state-contact-1600x620.webp` — starting, midgame, full;
- `proofs/state-starting-1024x704.webp`, `state-midgame-1024x704.webp`, and
  `state-fully-constructed-1024x704.webp` — unframed 1× states;
- `proofs/faction-contact-1600x748.webp` and five `proofs/factions/*` scenes;
- `proofs/phone-scene-375x258.webp` — actual narrow scene size;
- `proofs/zoom-2x-evidence-1600x1040.webp` — whole-city 1× and current 3× close crops from
  the 6144×4224 shipping tile composition;
- `proofs/backdrop-seam-census-1600x920.webp` — four runtime joins sampled at 1:1, backed
  by the all-38-join validator census;
- `proofs/production-layer-contact-1800x1180.webp` — empty layer plus all fifteen cutouts;
- fifteen `proofs/stress/*-magenta-1024.webp` files — native alpha/matte review;
- `proofs/baseline-current-states-1600x620.webp` — pre-replacement PNG behavior.

The fallback/theme evidence is executable rather than illustrative:
`apps/web/src/CityScene.test.tsx` exercises the shipping consumer from override to local
WebP to existing placeholder for buildings, and override to local for the backdrop, flag,
and citadel tower. `apps/web/src/cityArtAssets.test.ts` binds exact content URLs, files,
dimensions, alpha, metadata, per-file budgets, full first-open transfer, and the full
375/1440/1920 DPR2 resolution census across every approved zoom stop. The CityScene tests
also fail the first, middle, last, and multiple default tiles and prove all wrapper
positions and surviving URLs remain stable.

## Known boundary

The 6144×4224 backdrop is a deterministic synthesis of 24 separately generated detail
edits over the approved low-frequency geography, not an enlarged flattened city. The
two-pixel codec bleed leaves a conservative 6120×4208 unique runtime interior. The worst
1920×1080 DPR2 3× ratios are 1.047× for that backdrop interior, 1.022× for town hall, and
1.066× for shipyard; `RESOLUTION-CENSUS.json` contains every viewport/zoom/asset result.
This is finite raster coverage for the approved 3× stop, not a vector or infinite-zoom claim.
