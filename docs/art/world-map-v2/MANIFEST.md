# Checkpoint-1 and runtime-candidate asset/provenance manifest

## Scope and coverage

This package records issue #609's approved **Direction B — Gilded Harbor Diorama** checkpoint, including the approved city refinement, and binds the documented candidates to their shipping public asset paths. The proof/provenance system remains under `docs/art/world-map-v2/`; runtime copies are enumerated in `runtime-public-receipt.json`.

| Family          | Required | Included | Identity/readability cue                                                                                                          |
| --------------- | -------: | -------: | --------------------------------------------------------------------------------------------------------------------------------- |
| Cities          |        6 |        6 | British square bastion; Dutch stepped gable; French mansard crown; pirate ragged palisade; Spanish bell tower; neutral low market |
| Faction ships   |      5×4 |       20 | faction construction cues across distinct sloop, brigantine, frigate, and galleon silhouettes                                     |
| Faction parties |        5 |        5 | disciplined rank, low wedge, crescent rank, broken rank, cape arrowhead                                                           |
| Sea encounters  |        1 |        1 | paired merchant hulls with different sail plans                                                                                   |
| Land encounters |        3 |        3 | round village cluster, lone chimney hut, triangular barricaded camp                                                               |
| Sites           |        4 |        4 | mine arch/rails, saw blade, paired log stacks, broken arch void                                                                   |

Every runtime asset is shown at exact 24, 32, 48, and 96 CSS pixels. The fleet sheet covers all five factions by all four classes in color and grayscale; the faction marker sheet covers the existing authored flag geometry. Neutral deliberately has no party or raised standard.

## Art-system contract

- Strict orthographic near-overhead camera: 80° for land tokens and 82° for ships.
- Warm northwest/top-left key light at approximately 35° elevation with cool blue-green ambient shadow.
- Center or bottom-center optical anchors as recorded per asset in `asset-registry.json`.
- Broad silhouette and two or three primary value planes take priority over miniature detail.
- Faction identity is carried by architecture, formation, kit, sail plan, and pattern—not hue alone.
- Generated tokens contain no text, signatures, watermarks, terrain, selection rings, or baked flags.
- Tokens do not encode modifiers, rewards, danger tiers, ownership rules, or any other gameplay state.
- The fog examples are documentary presentation proofs only. Hidden examples draw no entity pixels and do not change visibility behavior.

## Generation provenance

| Field                                        | Value                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Service/tool                                 | OpenAI built-in image generator in Codex                                                       |
| Date                                         | 2026-09-03                                                                                     |
| Billing path                                 | subscription-included built-in generation authorized by D-049; no API key and no paid API call |
| Model identifier exposed by interface        | no; recorded as `null`                                                                         |
| Seed exposed by interface                    | no; recorded as `null`                                                                         |
| Checkpoint concept generations               | 21, one distinct request per checkpoint asset concept                                          |
| Runtime sea-encounter concepts               | 2, one distinct request per added encounter identity                                           |
| Fleet concept calls                          | 18 required identity calls plus one replacement Pirate-frigate concept after rejection         |
| Background-extraction edits                  | 3 checkpoint city edits plus 2 fleet alpha-recovery requests                                   |
| Fleet input references                       | Direction B map, approved British sloop, and approved Pirate galleon                           |
| Reference roles                              | style/camera/light; small-class finish/baseline; heavy-class finish/baseline                   |
| Reference SHA-256                            | `c80a488f0e2c02a4eaaabcc0e4b08fe481cd238bcc44b97dbf89f339e939c9f9`                             |
| Exact requests                               | `PROMPTS.md`                                                                                   |
| Source hashes and asset mapping              | `asset-registry.json`                                                                          |
| Normalized-source hashes and encoder receipt | `sources/selected/normalization-receipt.json`                                                  |

The raw PNG Content Credentials identified trained-algorithmic media and a `gpt-image` software agent at version `2.0`; that observation is recorded here before the oversized raw working copies are discarded. It is not treated as an interface-exposed selectable model ID, so the manifest truthfully leaves `model` null.

The checkpoint and sea-encounter requests used the repository's already-approved Direction B map proof as their only generation reference. Each fleet request attached that map plus the approved British sloop and Pirate galleon in fixed order; `runtime-additions.json` records the exact file, SHA-256, and narrowly scoped role of each input. Existing repository faction flags were not generation inputs; the compositor uses them only in color/grayscale comparison, and their paths and hashes remain recorded under `proof_only_existing_flags`.

### Usage and license basis

The outputs were created specifically for this project through the user's OpenAI subscription under the authorization recorded in D-049. Their use remains subject to the applicable OpenAI terms. This record makes no claim that generated output is exclusive or independently copyrightable. No third-party stock asset or unlicensed external image was used as an input.

## Alpha handling and source selection

All 21 concept prompts explicitly requested genuine transparent RGBA. The built-in generator instead returned RGB PNGs with a rendered light checkerboard for all 21 concept requests. Targeted background edits produced genuine RGBA for the British and French city sources; the Dutch edit still returned RGB.

`tools/prepare_sources.py` therefore selects those two genuine-alpha edits and deterministically extracts the rendered checkerboard for the other 19 sources. It decontaminates pale edge pixels, removes disconnected alpha islands smaller than eight pixels, normalizes to a 512×512 transparent canvas, enforces the optical anchor and safety margin, and writes exact-alpha WebP. The 39 MiB rejected/raw working copies are not committed; their filenames and SHA-256 hashes remain in `asset-registry.json`, and the selected project-bound RGBA sources are committed.

Known checkpoint-source limitation: several original extracted sources retain a faint pale contact-shadow/matte remnant visible when inspected at 512 px against pure black. Those immutable checkpoint sources remain committed so the approved proof and its provenance stay reproducible. The runtime derivatives remove the visible remnants with semantic exterior and named contact masks; this does not retroactively make the original checkpoint sources matte-free.

For the 18 new fleet identities, 16 selected built-in outputs arrived as native full-range RGBA. The selected replacement Pirate frigate and Spanish-sloop alpha edit instead returned an RGB image with a rendered neutral checker; `tools/ship_fleet.py` deterministically recovers only those two explicitly recorded images before the same crop, premultiplied resize, optical-baseline alignment, and transparent-RGB cleanup. Three superseded outputs remain in provenance as unretained rejects with exact hashes, dimensions, modes, byte counts, prompt sections, and rejection reasons.

## Deterministic outputs and budgets

The deterministic preparation scripts require Python with Pillow and NumPy and did not install or change repository dependencies. Every generation and edit request used the built-in OpenAI image generator; no CLI, API, or ComfyUI generation path was used.

| Output                            | Rule                                            | Observed                         |
| --------------------------------- | ----------------------------------------------- | -------------------------------- |
| normalized 512 px sources         | RGBA, 10% optical margin, ≤300 KiB              | 21/21 pass; largest 61,570 bytes |
| optimized 256 px token candidates | RGBA, ≤128 KiB target and ≤300 KiB hard ceiling | 21/21 pass; largest 19,412 bytes |
| token contact sheet               | 2400×3108, ≤300 KiB                             | 217,352 bytes                    |
| faction color/grayscale sheet     | 2200×1800, ≤300 KiB                             | 111,764 bytes                    |
| fog-truth sheet                   | 2100×1040, ≤300 KiB                             | 71,650 bytes                     |

`tools/compose_checkpoint.py --check` rebuilds all token candidates, all three sheets, and coverage metadata into a temporary directory and requires byte-for-byte equality. `tools/validate_checkpoint.py` fails on missing categories or IDs, malformed provenance, source/receipt hash drift, wrong dimensions, non-RGBA candidates, suspicious alpha, insufficient safety margin, budget overruns, incomplete size/grayscale/fog coverage, a hidden token draw, or nondeterministic composition.

All 21 normalized sources, all 21 token candidates, and all three final proof sheets were visually inspected at original size. The faction-sheet ship panel was expanded after inspection exposed a footer overlap; the corrected 2200×1800 sheet was regenerated and re-inspected.

## Runtime candidate delivery

Checkpoint 1 was approved with the recommended city refinement, and checkpoint 2 was approved at `63fc0fd29c9659f93901b36c1822bd7100547188`. Runtime preparation now publishes the 21 approved identities, two coherent replacements for the legacy native-canoe and settler-launch encounters, and 18 additional faction/class ship variants. Together with the approved British sloop and Pirate galleon, those variants complete the five-faction by four-class fleet. Their exact prompts, input-reference roles and hashes, original-unretained hashes, retained normalized-source hashes, unavailable model/seed fields, selection or rejection status, and usage basis are recorded in `PROMPTS.md` and `runtime-additions.json`. A fresh exact-head verifier must still judge this audit repair; checkpoint-2 approval does not by itself resolve the newer audit finding.

Before the renderer change, a cold texture request returned no texture on its first draw and initiated an unawaited decode; the procedural fallback was therefore visible until the loader marked a later frame dirty and the sprite appeared. A missing URL stayed on the procedural fallback. The baseline eligibility gates were also recorded: active sea encounters, land encounters, and sites required current visibility; another player's ship or party required current visibility; another player's city required exploration; the viewer's own cities, ships, and parties remained eligible. The runtime implementation preserves those gates while moving the finite eligible decode set ahead of the first interactive frame.

The two additional generated PNGs initially arrived as 1,254×1,254 RGBA files above the repository's literal 300 KiB per-image ceiling. `tools/polish_runtime_sources.py --normalize-retained-sources` replaced those working bytes in place with project-bound 512×512 RGBA PNGs using an alpha-bounds crop, premultiplied-Lanczos scale to a 384 px maximum subject dimension, transparent centering, and deterministic PNG encoding. The native-canoe source is now 138,454 bytes (`39a00546…`), and the settler-launch source is 228,737 bytes (`f977e0fa…`). Their original byte streams are not retained; `runtime-additions.json` preserves the original hashes (`3867d03e…` and `c4333e9e…`), sizes (953,313 and 1,317,086 bytes), dimensions, and alpha bounds separately from the committed retained-file records.

`tools/polish_runtime_sources.py` keeps the immutable 21 checkpoint sources and all 20 normalized retained runtime additions, applies deterministic semantic exterior/contact cleanup, and writes review-scale 512 px and optimized 256 px exact-alpha WebP derivatives. The named problem assets—British sloop, pirate galleon, British and Spanish parties, mine, hermit, and native village—must each report removed pixels. The Spanish party, hermit, and native village additionally carry four explicit source-visible contamination witnesses apiece; every witness must be exactly zero alpha after cleanup. Its `--check` mode rebuilds all 41 derivatives and 54 runtime proofs in a temporary directory and requires byte equality.

| Runtime evidence                                | Rule                                            | Observed                     |
| ----------------------------------------------- | ----------------------------------------------- | ---------------------------- |
| runtime identities                              | approved family + sea replacements + full fleet | 41/41                        |
| ship identities                                 | 5 factions × 4 distinct classes                 | 20/20                        |
| retained generated sources                      | RGBA, ≤300 KiB per committed image              | 20/20; largest 228,737 bytes |
| optimized public tokens                         | RGBA, ≤128 KiB target and ≤300 KiB hard ceiling | 41/41; total 607,240 bytes   |
| conservative all-family cold-cache critical set | ≤3 MiB                                          | 716,870 bytes                |
| quadrant overview pages                         | 512 px source layout across all four fields     | 6/6; largest 148,760 bytes   |
| actual-size stress sheet                        | every identity at 96 px                         | 41/41; 77,606 bytes          |
| full-footprint 512 px proofs                    | every identity repeated on all four fields      | 41/41; largest 115,182 bytes |
| full-footprint 96 px proof                      | every identity repeated on all four fields      | 41/41; 227,346 bytes         |
| faction marker proof                            | 24 px, color and grayscale                      | 5/5; 23,116 bytes            |
| runtime/public contact sheet                    | all 41 at 24/32/48/96 + grayscale factions      | 41/41; 240,336 bytes         |
| dedicated fleet contact sheet                   | all 20 at 24/32/48/96 + color/grayscale matrix  | 20/20; 117,316 bytes         |
| dedicated fleet alpha-stress sheet              | all 20 at 96 px on water/dark/magenta/cyan      | 20/20; 97,676 bytes          |
| committed/referenced image census               | every enumerated image ≤300 KiB                 | 253/253 pass                 |

`tools/validate_runtime.py` also requires real full-range alpha, zero-alpha corner sentinels, zero RGB under transparent pixels in retained generated sources, a shared ship optical baseline, no newly revealed pixels outside the source silhouette, exact-zero contamination witnesses, byte-identical public copies, exact receipt hashes, distinct retained versus original-unretained provenance, all 41 public identities in the current runtime-bound 24/32/48/96 sheet, the complete 20-ship color/grayscale and alpha-stress evidence, exact prompts and input roles, and the original checkpoint validator. It enumerates all images in this package plus every external reference, proof flag/tile input, and published receipt target, applying the 300 KiB ceiling to each. The clean-browser capture receipt additionally binds the exact runtime head, unused origin, default/no-override theme state, settle procedure, three JPEG hashes, and per-viewport generated-sloop reference crops; the known legacy Pirate ship and all three stale capture hashes fail loud. Negative controls must reject an oversized retained image, the legacy Pirate ship as capture evidence, a nonzero semantic witness, incomplete runtime coverage, the old checkpoint-only sheet as current evidence, and an incomplete ship matrix. Hidden-entity eligibility remains a renderer concern rather than an art-file property; the production registry tests use throwing identity lookups and an override-lookup census to prove hidden city, ship, party, encounter, and site detail is absent from preload requests.

The runtime renderer preserves existing exploration and visibility gates, gives neutral cities a safe neutral default, keeps `city:own` and `city:enemy` theme overrides ahead of faction defaults, and waits for every eligible winning texture to settle as loaded or failed before revealing the interactive map. The wait is finite because failed decodes settle to the existing procedural fallback. It does not preload unseen detail art.

The complete-fleet runtime candidate independently passed at
`7c4c56d7a28baea8a7f176e51fadd15d70353648`. The phone, tablet, and desktop
captures in `RUNTIME-CAPTURES.md` were renewed from exact runtime head
`09368902401310bf9a43455865f1151a6bb02d87`, whose runtime/art bytes match that candidate.
They visibly and perceptually bind the generated Pirate sloop but still require renewed
checkpoint-2 operator approval for those exact pixels. This manifest does not claim that
approval or that the pre-PR audit is resolved.
