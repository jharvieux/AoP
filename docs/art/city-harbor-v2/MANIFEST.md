# City Harbor v2 — checkpoint-one manifest

> Historical record: checkpoint one is approved and superseded by the complete
> [production candidate manifest](PRODUCTION-MANIFEST.md). Run
> `tools/validate_production.py` for the current package contract. The hashes
> below bind immutable checkpoint-one commit
> `4dcbd44d08ca558fffb558a96916acb193e4eb33`, not the production files now at
> the same working paths.

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

Nine distinct source/variant requests used the subscription-included OpenAI built-in image
generator on 2026-09-03: the initial empty harbor and six buildings, then one corrected
empty-harbor edit and one corrected shipyard edit after integrated review exposed the
shoreline gap. There was one call per distinct asset or edit variant. No API key, CLI
fallback, paid API route, stock image, external logo, or copied game screenshot was used.
The project-generated approved B styleframe supplied style/material/camera/light; generated
harbors supplied spatial reference where recorded.

The interface did not expose a model name/version, sampler, seed, quality, or size control.
Those fields are truthfully recorded as unavailable rather than guessed. Exact submitted
text is in [PROMPTS.md](PROMPTS.md); machine-readable hashes and reference roles are in
[PROVENANCE.json](PROVENANCE.json). Use is subject to OpenAI's applicable service terms and
law; this provenance entry is not legal advice.

The built-in service painted its transparency checker into RGB for all cutout requests. A
targeted built-in background-extraction retry on town hall, tavern, and trade house did the
same and was rejected. The first checkpoint's border-connected color extraction also failed
independent review because it could not clear enclosed checker regions or disconnected pale
floor mattes. The replacement is the repository's established semantic-mask path:

1. `rembg` predicts each subject with cached `isnet-general-use`;
2. `tools/build_subject_masks.py` keeps the alpha-128 subject core's largest connected
   component without filling enclosed holes;
3. a sigma-0.65 reconstruction restores a narrow anti-aliased edge;
4. `tools/compose_checkpoint.py` extends trustworthy alpha-240 interior RGB through that
   edge so resampling cannot reveal the painted checker;
5. the cutout is trimmed with 26 source pixels of margin and resized to a 900 px maximum
   edge.

The retained `sources/*` WebPs preserve the generator result for audit. Their visible
checker is source evidence, not claimed alpha. The six lossless reviewed masks under
`masks/` and the `cutouts/*` files are the actual proof inputs. Saturated magenta/dark-teal
proofs replace checker-backed review for alpha acceptance.

## Retained generated sources

All retained source files are optimized, metadata-free RGB WebPs below 300 KiB. The
original lossless PNG hashes remain in `PROVENANCE.json`.

| File                                  | Dimensions |   Bytes | Retained SHA-256                                                   |
| ------------------------------------- | ---------: | ------: | ------------------------------------------------------------------ |
| `sources/empty-harbor-source-r1.webp` |  1567×1004 | 301,676 | `cfea5e996e61cbeb84cd7b9a309b1517f9e0bfa357a24515cccbdf753b4305e5` |
| `sources/empty-harbor-source-r2.webp` |  1567×1004 | 282,382 | `39f3e74076db87b37aab8c8588278baa7c6a750af5984d4e8760e0a6e39fc463` |
| `sources/townhall-source-r1.webp`     |  1254×1254 | 263,926 | `a4a66aad11387afbe919661993f06f01436189d00fda9be1394395b2b49f40b4` |
| `sources/tavern-source-r1.webp`       |  1254×1254 | 235,428 | `bf87156203270b169eb15ec6c156735e8222b4afe3ff886a7d324c8ebf5120c6` |
| `sources/tradehouse-source-r1.webp`   |  1254×1254 | 230,114 | `6561ce57f80bab15a50b5c82fe4189026e3da10c5e360f171798f2c9d6b92eb5` |
| `sources/barracks-source-r1.webp`     |  1254×1254 | 248,178 | `059720e79f8f48a2bc88d056bd07d9b7b6c50c2c995b63c59ca0eef2ceb9301d` |
| `sources/stonewall-source-r1.webp`    |  1254×1254 | 139,362 | `51f140a4b3cf3aa1882af39126c9511428f95d6e8062b2c4c19f27a3a31c74b6` |
| `sources/shipyard-source-r1.webp`     |  1254×1254 | 302,588 | `e190306b2a2ee3d03f2489244fedc5a10ea383e1c8b727f8f3110ed22d97fec9` |
| `sources/shipyard-source-r2.webp`     |  1254×1254 | 230,830 | `22a577d78286ad938a186a562ff853ff22dfd0a65842b48b8aac1742943728bd` |

Source normalization used RGB WebP quality 80 for P1, 76 for the more detailed active P8
harbor, 86 for active P9 shipyard, and 88 for other building sources; Pillow method 6 and
exact color handling. It is reproducible with `tools/prepare_generated_sources.py` when the
original built-in exports are supplied. P8 and P9 are active; P1 and P7 remain as audit
inputs to those edits.

## Reviewed subject masks

| File                        | Mode / dimensions |  Bytes | SHA-256                                                            |
| --------------------------- | ----------------- | -----: | ------------------------------------------------------------------ |
| `masks/townhall-mask.png`   | L 1254×1254       | 11,053 | `0b5b2ed3f4f274faaff3733b848bb2d882d3a784f11784fe0adcb37f2bfbd1e7` |
| `masks/tavern-mask.png`     | L 1254×1254       | 17,300 | `fe31ac2ff571d8ea27fe330121b3e0a42126c7321c6593d99eec5e69c0afffc3` |
| `masks/tradehouse-mask.png` | L 1254×1254       | 13,153 | `4f6a4ceccec8d172459a249f62e27c16a6a66b1ad6cbfbdd4925b1139bb5c393` |
| `masks/barracks-mask.png`   | L 1254×1254       | 13,796 | `b97251d90247e7a5a2a5daaebe3fe59eb93053e85f4c4c6aa7a0412b27053fed` |
| `masks/stonewall-mask.png`  | L 1254×1254       | 10,011 | `d69e0d74508e603195979dc57c1ceb4ed7497b44c8d853512c6c58406c89b267` |
| `masks/shipyard-mask.png`   | L 1254×1254       | 28,108 | `865c15e36d843d15654d8f653d2144c804f4ca5b6c9d861cda30ff8698e23c3c` |

## Cutout and layer outputs

| File                                   | Mode / dimensions |   Bytes | SHA-256                                                            |
| -------------------------------------- | ----------------- | ------: | ------------------------------------------------------------------ |
| `cutouts/townhall.webp`                | RGBA 900×840      | 181,000 | `43ef6207b60d0fb29b10a820d369566542254262c1778945c30dfdfb60a48ee6` |
| `cutouts/tavern.webp`                  | RGBA 900×858      | 189,814 | `bed8007b5e2d0a6b4fef4abb7fb5e1806c448e1fd00cbaa4bfff564693277ebe` |
| `cutouts/tradehouse.webp`              | RGBA 900×682      | 161,920 | `2140bebef959948fc734c6b9d8be1ac7884782094b32b04efdab7cd017e0db81` |
| `cutouts/barracks.webp`                | RGBA 900×828      | 170,470 | `0d10085849a2ad8fe0644169da6b182c9fa881d9c9c1d5d47a38cfe73e52c7d3` |
| `cutouts/stonewall.webp`               | RGBA 900×499      | 109,674 | `adeb8a396ca45e78095aa23586bcdb722e4291074abfec8fd3ff083f3514b041` |
| `cutouts/shipyard.webp`                | RGBA 900×747      | 189,572 | `d89be75d529fbbf4d7ea51356ddc85de2b13cad3e5eeb51fce1479e1432af83f` |
| `layers/contact-shadows.webp`          | RGBA 2048×1408    |  22,478 | `361dd6eb8249600077f6eb2a468589f6426998075bcf578391555c149e543e3e` |
| `layers/empty-backdrop-2048x1408.webp` | RGB 2048×1408     | 303,242 | `4c14305222eeb439c5e1fbd990264f559c2e656a2e53b347b0444a63114cdef9` |

## Proof outputs

| File                                             | Dimensions |   Bytes | Purpose                                        |
| ------------------------------------------------ | ---------: | ------: | ---------------------------------------------- |
| `proofs/checkpoint-contact-sheet-1600x1120.webp` |  1600×1120 | 181,464 | Concise approval summary                       |
| `proofs/desktop-1440x900.webp`                   |   1440×900 | 214,692 | Native 1024×704 scene in desktop review chrome |
| `proofs/phone-375x812.webp`                      |    375×812 |  50,480 | Actual 375×258 phone scene                     |
| `proofs/max-zoom-1024x704.webp`                  |   1024×704 |  95,514 | One current 3× viewport; tavern/economy detail |
| `proofs/layer-separation-1600x1000.webp`         |  1600×1000 | 178,194 | Empty/RGBA/shadow/slot/depth/anchor evidence   |
| `proofs/empty-runtime-1024x704.webp`             |   1024×704 | 192,690 | Building-free semantic inspection              |
| `proofs/scene-runtime-1024x704.webp`             |   1024×704 | 220,312 | Unframed integrated composition                |

All six `proofs/stress/*-magenta-1024.webp` files are native 1024×1024 composites with the
900 px cutout centered over uninterrupted magenta and dark-teal fields. They range from
82,632 to 140,786 bytes and make pale checker islands, edge mattes, and enclosed-gap failures
visible instead of camouflaging them with another checkerboard.

Every retained WebP, including sources and the 2048 master, is below 300 KiB. This is
stricter than the checkpoint request for proof files and does not claim final runtime
payload acceptance for the unfinished full batch.

## Visual inspection record

Inspected at original size on 2026-09-03:

- all nine retained generated sources, including active P8 backdrop and P9 shipyard;
- all six retained masks and all six final RGBA cutouts;
- all six native 1024 saturated magenta/dark-teal stress composites;
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
- the shipyard carries no painted water; its upper-right gangway reaches dry sand/limestone
  while its drydock and lower-left slip remain over water inside the unchanged slot;
- enclosed crane/roof/railing gaps show the saturated proof background, and cutouts have no
  detached pale floor matte or visible checker fringe in native stress or the 3× proof;
- phone composition retains six discoverable silhouettes without permanent labels on the
  scene itself.

## Automated validation record

`tools/validate_checkpoint.py` passed on 2026-09-03. It checks the complete 30-WebP
inventory, declared modes and dimensions, metadata removal, 300 KiB ceiling, source/mask
provenance hashes, P1–P9 prompt coverage, genuine cutout alpha, eight-pixel safety bands,
single alpha-8/alpha-128 subject islands, a five-pixel maximum soft-edge reach, explicit
enclosed-hole witnesses for all five failed cutouts, six saturated stress fields, Direction
B's 38% shadow cap, exact 16:11 geometry, current `SCENE_SLOTS`, dry-shore and water
shipyard witnesses, and byte-identical recomposition of all 21 derived files.

## Known limitations and next-gate corrections

1. This is a representative subset, not the fourteen-building runtime batch. Starting,
   midgame, full-city, replacement fortifications, citadel accessory, and five faction-flag
   composites remain for checkpoint 2.
2. This is a direction/composition proof, not a final source-sharpness claim. The final
   batch must author separate high-resolution layers in place instead of treating an
   upscaled flattened composite as final art, and should tighten per-building optical
   scale, contact edge, and foundation fit while preserving these approved silhouettes.
3. Two small wooden training dummies in the barracks can resemble static figures at source
   scale. They read as rack detail at runtime size, but must be removed or simplified before
   final export.
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
