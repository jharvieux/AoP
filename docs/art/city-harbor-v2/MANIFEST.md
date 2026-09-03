# City Harbor v2 — checkpoint-one manifest

## Status and authority

This is the first operator checkpoint required by issue #608. Direction B — Gilded Harbor
Diorama — and its city refinement are approved in D-049. This representative proof is
**awaiting operator approval** before the remaining runtime building batch is produced.

The checkpoint preserves the approved material depth and shoreline plan, reduces the
fortress-first read, and separates the tavern, trade/economy, barracks/recruitment, and
shipyard silhouettes. It is documentation/source art only. Nothing under
`apps/web/public/art/city/` or `apps/web/src/` changes here.

## Composition contract

| Property               | Checkpoint value                                                |
| ---------------------- | --------------------------------------------------------------- |
| Master scene           | 2048×1408, exact 16:11                                          |
| Runtime proof          | 1024×704                                                        |
| Smallest proof         | 375×258 scene inside a 375×812 phone frame                      |
| Close proof            | One 1024×704 viewport into the existing 3× scene zoom           |
| Camera                 | Horizonless high-angle three-quarter, nominal 55° depression    |
| Light                  | Northwest/top-left, nominal 35° elevation                       |
| Backdrop               | Opaque terrain, coast, water, roads, and empty foundations only |
| Constructed elements   | Six independent genuine-alpha WebPs                             |
| Shadow                 | Separate 2048×1408 RGBA layer; maximum alpha 82/255 (32.2%)     |
| Labels/flags/values/UI | Excluded from art layers; proof-frame labels are review chrome  |

The placement rectangles below are copied exactly from `CityScene.tsx` at immutable base
`29ce63e0da7b16ac4fce5c2b866cc89d3e6be4ff`. This checkpoint does not propose a runtime
slot change.

| Asset             | Role          | Current slot `(left, top, width, height)` | Bottom-center anchor | Depth |
| ----------------- | ------------- | ----------------------------------------- | -------------------- | ----- |
| `townhall`        | Civic         | `(37, 6, 26, 36)%`                        | `(0.500, 0.420)`     | P0    |
| `shipyard`        | Shoreline     | `(80, 75, 19, 24)%`                       | `(0.895, 0.990)`     | P1    |
| `tavern`          | Hospitality   | `(4, 24, 14, 20)%`                        | `(0.110, 0.440)`     | P2    |
| `tradehouse`      | Economy       | `(19, 28, 14, 18)%`                       | `(0.260, 0.460)`     | P2    |
| `barracks`        | Recruitment   | `(47, 46, 13, 17)%`                       | `(0.535, 0.630)`     | P2    |
| `stoneWall` proof | Fortification | `(24, 66, 17, 12)%`                       | `(0.325, 0.780)`     | P3    |

`stonewall` is the proof filename; it represents the current `stoneWall` slot/content role.
Final runtime naming remains owned by the full #608 integration.

## Source generation and usage basis

Seven distinct source requests used the subscription-included OpenAI built-in image
generator on 2026-09-03. There was one call per distinct asset. No API key, CLI fallback,
paid API route, stock image, external logo, or copied game screenshot was used. The input
reference was the project-generated approved B styleframe; the generated empty harbor then
served as a spatial-only reference for the building calls.

The interface did not expose a model name/version, sampler, seed, quality, or size control.
Those fields are truthfully recorded as unavailable rather than guessed. Exact submitted
text is in [PROMPTS.md](PROMPTS.md); machine-readable hashes and reference roles are in
[PROVENANCE.json](PROVENANCE.json). Use is subject to OpenAI's applicable service terms and
law; this provenance entry is not legal advice.

The built-in service painted its transparency checker into RGB for all six cutout requests.
A targeted built-in background-extraction retry on town hall, tavern, and trade house did
the same and was rejected. `tools/compose_checkpoint.py` therefore recovers alpha by:

1. finding pale neutral pixels connected to the source border;
2. retaining meaningful foreground components;
3. eroding/feathering one source pixel to remove checker contamination;
4. extending subject-edge RGB beneath transparency for safe resampling;
5. trimming with a 17+ px source safety margin and resizing to a 900 px maximum edge.

The retained `sources/*` WebPs preserve the generator result for audit. Their visible
checker is source evidence, not claimed alpha. The `cutouts/*` files are the actual RGBA
proof inputs.

## Retained generated sources

All retained source files are optimized, metadata-free RGB WebPs below 300 KiB. The
original lossless PNG hashes remain in `PROVENANCE.json`.

| File                                  | Dimensions |   Bytes | Retained SHA-256                                                   |
| ------------------------------------- | ---------: | ------: | ------------------------------------------------------------------ |
| `sources/empty-harbor-source-r1.webp` |  1567×1004 | 301,676 | `cfea5e996e61cbeb84cd7b9a309b1517f9e0bfa357a24515cccbdf753b4305e5` |
| `sources/townhall-source-r1.webp`     |  1254×1254 | 263,926 | `a4a66aad11387afbe919661993f06f01436189d00fda9be1394395b2b49f40b4` |
| `sources/tavern-source-r1.webp`       |  1254×1254 | 235,428 | `bf87156203270b169eb15ec6c156735e8222b4afe3ff886a7d324c8ebf5120c6` |
| `sources/tradehouse-source-r1.webp`   |  1254×1254 | 230,114 | `6561ce57f80bab15a50b5c82fe4189026e3da10c5e360f171798f2c9d6b92eb5` |
| `sources/barracks-source-r1.webp`     |  1254×1254 | 248,178 | `059720e79f8f48a2bc88d056bd07d9b7b6c50c2c995b63c59ca0eef2ceb9301d` |
| `sources/stonewall-source-r1.webp`    |  1254×1254 | 139,362 | `51f140a4b3cf3aa1882af39126c9511428f95d6e8062b2c4c19f27a3a31c74b6` |
| `sources/shipyard-source-r1.webp`     |  1254×1254 | 302,588 | `e190306b2a2ee3d03f2489244fedc5a10ea383e1c8b727f8f3110ed22d97fec9` |

Source normalization was RGB WebP quality 80 for the empty harbor and quality 88 for
building sources, Pillow method 6, exact color handling. It is reproducible with
`tools/prepare_generated_sources.py` when the original built-in exports are supplied.

## Cutout and layer outputs

| File                                   | Mode / dimensions |   Bytes | SHA-256                                                            |
| -------------------------------------- | ----------------- | ------: | ------------------------------------------------------------------ |
| `cutouts/townhall.webp`                | RGBA 900×838      | 183,456 | `c806cb66099726c9b97c4b1ee25787e8a326bdb4297a1db793576f7b131acd09` |
| `cutouts/tavern.webp`                  | RGBA 900×857      | 188,218 | `57baf305de439be7a2fbcfe7f9709b5e63c8da70ea42b983646a55d4dec39625` |
| `cutouts/tradehouse.webp`              | RGBA 900×681      | 167,334 | `a198bf0bbc212bca0d462a29c13bbb9921390587b5ff1dbf812f1f0d03c759d5` |
| `cutouts/barracks.webp`                | RGBA 900×825      | 172,462 | `126139dab5fd8651ba121b622108989cd0056dd32fb9cb1a77dc6d456c75a99f` |
| `cutouts/stonewall.webp`               | RGBA 900×498      | 108,776 | `4f27e45daab24655b92e24befe4a0f2b0d0e99bfab9e543a3ba7b0235aa03cfb` |
| `cutouts/shipyard.webp`                | RGBA 900×876      | 223,102 | `e434217a1872fe893456a53970951393ed9722917b7167ef04f23b0bbea89f56` |
| `layers/contact-shadows.webp`          | RGBA 2048×1408    |  22,478 | `361dd6eb8249600077f6eb2a468589f6426998075bcf578391555c149e543e3e` |
| `layers/empty-backdrop-2048x1408.webp` | RGB 2048×1408     | 303,358 | `6c19ac590f0d5221e0372b48020e16daf44882077880c7c0267a109cf48d2d75` |

## Proof outputs

| File                                             | Dimensions |   Bytes | Purpose                                        |
| ------------------------------------------------ | ---------: | ------: | ---------------------------------------------- |
| `proofs/checkpoint-contact-sheet-1600x1120.webp` |  1600×1120 | 184,260 | Concise approval summary                       |
| `proofs/desktop-1440x900.webp`                   |   1440×900 | 210,986 | Native 1024×704 scene in desktop review chrome |
| `proofs/phone-375x812.webp`                      |    375×812 |  51,312 | Actual 375×258 phone scene                     |
| `proofs/max-zoom-1024x704.webp`                  |   1024×704 |  91,306 | One current 3× viewport; tavern/economy detail |
| `proofs/layer-separation-1600x1000.webp`         |  1600×1000 | 184,890 | Empty/RGBA/shadow/slot/depth/anchor evidence   |
| `proofs/empty-runtime-1024x704.webp`             |   1024×704 | 184,176 | Building-free semantic inspection              |
| `proofs/scene-runtime-1024x704.webp`             |   1024×704 | 216,370 | Unframed integrated composition                |

Every retained WebP, including sources and the 2048 master, is below 300 KiB. This is
stricter than the checkpoint request for proof files and does not claim final runtime
payload acceptance for the unfinished full batch.

## Visual inspection record

Inspected at original size on 2026-09-03:

- all seven retained generated sources;
- all six recovered-alpha cutouts against the viewer's transparency grid;
- empty 2048 master and 1024 semantic proof;
- unframed 1024 integrated scene;
- desktop, phone, current 3× crop, layer/anchor sheet, and contact sheet.

Observed pass conditions:

- empty layer has terrain, coast, roads, vegetation, water, and unoccupied plots only;
- no art layer contains a city name, number, faction flag, selection state, UI, signature,
  or watermark;
- the town hall is civic rather than defensive; the wall is a supporting perimeter piece;
- tavern's crooked gables/casks, trade house's arcade/awning, barracks' watch stair/drill
  court, and shipyard's hull cradle/crane remain visually distinct;
- the shipyard carries no painted water and occupies the current shoreline slot;
- cutouts have no visible pale checker fringe in the integrated native or 3× proof;
- phone composition retains six discoverable silhouettes without permanent labels on the
  scene itself.

## Automated validation record

`tools/validate_checkpoint.py` passed on 2026-09-03. It checks the complete 22-WebP
inventory, declared modes and dimensions, metadata removal, 300 KiB ceiling, source
provenance hashes, prompt coverage, genuine cutout alpha and eight-pixel safety bands,
Direction B's 38% shadow cap, exact 16:11 geometry, current `SCENE_SLOTS`, and byte-identical
recomposition of all 15 derived files.

## Known limitations and next-gate corrections

1. This is a representative subset, not the fourteen-building runtime batch. Starting,
   midgame, full-city, replacement fortifications, citadel accessory, and five faction-flag
   composites remain for checkpoint 2.
2. The generated source camera and background camera are close but not yet an authored
   in-place master. The final batch should tighten per-building optical scale, contact edge,
   and foundation fit while preserving these approved silhouettes.
3. Two small wooden training dummies in the barracks can resemble static figures at source
   scale. They read as rack detail at runtime size; remove or simplify them in final export
   if the operator reads them as people.
4. The exact current `SCENE_SLOTS` force the tavern/trade pair toward the far left and the
   shipyard to the extreme lower-right. This checkpoint proves those constraints rather
   than silently retuning them. Any final slot change must be separately justified and
   coordinated with the city-presentation integration owner.
5. The empty harbor source is 1567×1004 rather than native 16:11 because the built-in tool
   did not expose size control. The compositor uses a deterministic cover crop before the
   exact 2048×1408 and 1024×704 exports.
6. The proof-frame typography uses local Georgia/Trebuchet proxies. Runtime Pirata One and
   Cabin remain unchanged and require later in-app verification.
7. No runtime loading, theme override, failed-image fallback, offline cache, five-faction
   flag, fully built payload, or 3 MiB transfer claim is made at checkpoint 1.
