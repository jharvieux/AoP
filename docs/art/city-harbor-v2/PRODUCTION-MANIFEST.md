# City Harbor v2 — production candidate manifest

## Status

Issue #608 checkpoint 1 and the Direction B city refinement are operator-approved. This
package is the complete runtime/capture candidate for operator checkpoint 2; it does not
claim checkpoint-2 approval yet.

The production batch keeps the exact existing `SCENE_SLOTS` rectangles and content IDs.
It replaces the shipping city URLs with WebP art for the backdrop, all fourteen building
IDs, and the `building:citadel:tower` accessory. `city.buildings` remains the sole source
of constructed-state truth. No engine, save, replay, theme schema, dependency, manifest,
workflow, or asset-allowlist change is part of this batch.

## Composition and runtime contract

| Property           | Production candidate                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Scene              | 16:11; 2048×1408 proof master; 1024×704 runtime backdrop                                                                           |
| Constructed art    | 14 separate building cutouts plus separate citadel tower                                                                           |
| Cutout size        | 850–900 px maximum edge; genuine-alpha WebP                                                                                        |
| Camera/light       | weak-orthographic 55° view; northwest light; cool water bounce                                                                     |
| Material language  | warm limestone, weathered timber, red-clay/shingle accents, restrained brass                                                       |
| Empty layer        | terrain, coast, road, water, vegetation, and unoccupied foundations only                                                           |
| Placement          | unchanged current percentages and bottom-center anchors                                                                            |
| Depth              | stable P0 civic, P1 shore, P2 districts, P3 fortification; baseline-sorted within a pass                                           |
| Theming            | theme override first; failed override retries shipping local art; failed local art exposes the existing category/gradient fallback |
| Asset ceiling      | every runtime file ≤300 KiB                                                                                                        |
| First-open ceiling | backdrop + 14 buildings + tower + largest faction flag ≤3 MiB                                                                      |

Measured candidate transfer is 2,326,998 bytes of city art plus the 22,910-byte largest
faction flag, or 2,349,908 bytes (2.24 MiB) total. The largest individual runtime file is
`grandArsenal.webp` at 199,168 bytes; the largest retained review proof is 246,282 bytes.

The final backdrop is a deterministic authoring composite. P10 supplies all fourteen
unoccupied foundation regions; a feathered lower-right terrain patch from the previously
approved P8 corrected-shore source restores the immutable shipyard relationship that P10
partially receded. The shipyard slot and anchor do not move: its short landward gangway
meets dry sand/limestone while its drydock, slipway, and pilings remain over luminous water.

## Production source inventory

Active generated sources:

- backdrop foundations: `sources/empty-harbor-source-r3.webp` (P10), with P8 shore patch;
- retained checkpoint roles: P2 town hall, P3 tavern, P4 trade house, P6 stone wall, P9 shipyard;
- cleaned barracks: `sources/barracks-source-r2.webp` (P11; no human-shaped dummies);
- economy: `sawmill-source-r1.webp`, `ironmine-source-r1.webp`, `distillery-source-r1.webp` (P12–P14);
- fortification: `palisade-source-r1.webp`, `citadel-source-r1.webp`, `citadel-tower-source-r1.webp` (P15, P16, P20);
- recruitment: `garrisonhall-source-r1.webp`, `fortress-armory-source-r1.webp`, `grand-arsenal-source-r1.webp` (P17–P19).

All P10–P20 built-in results were retained; none was rejected. Two outputs arrived in RGBA
containers, but no service-provided alpha was trusted. Every constructed source went
through the same semantic-mask pipeline used to repair checkpoint 1. The three older,
rejected P2–P4 transparency retries remain truthfully recorded in `PROVENANCE.json`.

Exact P10–P20 text is in `PRODUCTION-PROMPTS.md`; output hashes, input-reference roles,
service/tool, date, use basis, disposition, and unavailable interface fields are in
`PRODUCTION-PROVENANCE.json`. P1–P9 and the historical rejected retries remain in
`PROMPTS.md` and `PROVENANCE.json`.

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
- source/proof/runtime files above 300 KiB or a fully built transfer above 3 MiB;
- provenance hash drift or non-deterministic recomposition.

## Review evidence

Primary native files:

- `proofs/production-state-contact-1600x620.webp` — starting, midgame, full;
- `proofs/state-starting-1024x704.webp`, `state-midgame-1024x704.webp`, and
  `state-fully-constructed-1024x704.webp` — unframed 1× states;
- `proofs/faction-contact-1600x748.webp` and five `proofs/factions/*` scenes;
- `proofs/phone-scene-375x258.webp` — actual narrow scene size;
- `proofs/zoom-2x-evidence-1600x1040.webp` — whole-city 1× and current 3× close crops from
  the 2048×1408 source composition;
- `proofs/production-layer-contact-1800x1180.webp` — empty layer plus all fifteen cutouts;
- fifteen `proofs/stress/*-magenta-1024.webp` files — native alpha/matte review;
- `proofs/baseline-current-states-1600x620.webp` — pre-replacement PNG behavior.

The fallback/theme evidence is executable rather than illustrative:
`apps/web/src/CityScene.test.tsx` exercises the shipping consumer from override to local
WebP to existing placeholder for buildings, and override to local for the backdrop, flag,
and citadel tower. `apps/web/src/cityArtAssets.test.ts` binds exact content URLs, files,
dimensions, alpha, metadata, per-file budgets, and full first-open transfer.

## Known boundary

The retained 2048×1408 scene is a recomposition of separate high-resolution layers, not an
upscale of a flattened final city. The built-in service did not expose a native size
control, so the source backdrop is cover-cropped into 16:11 and cutouts are normalized to
the documented retained sizes. The proof supports the production direction and current
3× UI zoom; it does not claim vector or infinite-zoom detail.
