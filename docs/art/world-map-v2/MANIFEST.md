# Checkpoint-1 and runtime-candidate asset/provenance manifest

## Scope and coverage

This package records issue #609's approved **Direction B — Gilded Harbor Diorama** checkpoint, including the approved city refinement, and binds the documented candidates to their shipping public asset paths. The proof/provenance system remains under `docs/art/world-map-v2/`; runtime copies are enumerated in `runtime-public-receipt.json`.

| Family          |   Required | Included | Identity/readability cue                                                                                                          |
| --------------- | ---------: | -------: | --------------------------------------------------------------------------------------------------------------------------------- |
| Cities          |          6 |        6 | British square bastion; Dutch stepped gable; French mansard crown; pirate ragged palisade; Spanish bell tower; neutral low market |
| Ship classes    | at least 2 |        2 | narrow triangular-sail sloop versus broad multi-mast galleon                                                                      |
| Faction parties |          5 |        5 | disciplined rank, low wedge, crescent rank, broken rank, cape arrowhead                                                           |
| Sea encounters  |          1 |        1 | paired merchant hulls with different sail plans                                                                                   |
| Land encounters |          3 |        3 | round village cluster, lone chimney hut, triangular barricaded camp                                                               |
| Sites           |          4 |        4 | mine arch/rails, saw blade, paired log stacks, broken arch void                                                                   |

Every asset is shown at exact 24, 32, 48, and 96 CSS pixels. The faction sheet covers every city, every faction party, both representative ship classes, and the existing authored flag geometry in color and grayscale. Neutral deliberately has no party or raised standard.

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
| Concept generations                          | 21, one distinct request per asset concept                                                     |
| Background-extraction edits                  | 3, one each for British, Dutch, and French city sources                                        |
| Input reference                              | `../commercial-visual-v2/sources/b-gilded-harbor-diorama-map-r1.webp`                          |
| Reference role                               | style, material, palette, camera, and lighting only—not subject or composition                 |
| Reference SHA-256                            | `c80a488f0e2c02a4eaaabcc0e4b08fe481cd238bcc44b97dbf89f339e939c9f9`                             |
| Exact requests                               | `PROMPTS.md`                                                                                   |
| Source hashes and asset mapping              | `asset-registry.json`                                                                          |
| Normalized-source hashes and encoder receipt | `sources/selected/normalization-receipt.json`                                                  |

The raw PNG Content Credentials identified trained-algorithmic media and a `gpt-image` software agent at version `2.0`; that observation is recorded here before the oversized raw working copies are discarded. It is not treated as an interface-exposed selectable model ID, so the manifest truthfully leaves `model` null.

The only generation reference was the repository's already-approved Direction B map proof. Existing repository faction flags were not generation inputs; the compositor uses them only in the color/grayscale comparison sheet, and their paths and hashes are recorded under `proof_only_existing_flags`.

### Usage and license basis

The outputs were created specifically for this project through the user's OpenAI subscription under the authorization recorded in D-049. Their use remains subject to the applicable OpenAI terms. This record makes no claim that generated output is exclusive or independently copyrightable. No third-party stock asset or unlicensed external image was used as an input.

## Alpha handling and source selection

All 21 concept prompts explicitly requested genuine transparent RGBA. The built-in generator instead returned RGB PNGs with a rendered light checkerboard for all 21 concept requests. Targeted background edits produced genuine RGBA for the British and French city sources; the Dutch edit still returned RGB.

`tools/prepare_sources.py` therefore selects those two genuine-alpha edits and deterministically extracts the rendered checkerboard for the other 19 sources. It decontaminates pale edge pixels, removes disconnected alpha islands smaller than eight pixels, normalizes to a 512×512 transparent canvas, enforces the optical anchor and safety margin, and writes exact-alpha WebP. The 39 MiB rejected/raw working copies are not committed; their filenames and SHA-256 hashes remain in `asset-registry.json`, and the selected project-bound RGBA sources are committed.

Known checkpoint-source limitation: several original extracted sources retain a faint pale contact-shadow/matte remnant visible when inspected at 512 px against pure black. Those immutable checkpoint sources remain committed so the approved proof and its provenance stay reproducible. The runtime derivatives remove the visible remnants with semantic exterior and named contact masks; this does not retroactively make the original checkpoint sources matte-free.

## Deterministic outputs and budgets

The scripts require Python with Pillow and NumPy; the existing local ComfyUI virtual environment was used without installing or changing repository dependencies.

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

Checkpoint 1 was approved with the recommended city refinement. Runtime preparation therefore publishes the 21 approved identities plus two coherent replacements for the legacy native-canoe and settler-launch sea encounters. The latter were generated with the same Direction B contract; their exact prompts, original-unretained hashes, retained normalized-source hashes, interface limitations, and usage basis are recorded in `PROMPTS.md` and `runtime-additions.json`.

Before the renderer change, a cold texture request returned no texture on its first draw and initiated an unawaited decode; the procedural fallback was therefore visible until the loader marked a later frame dirty and the sprite appeared. A missing URL stayed on the procedural fallback. The baseline eligibility gates were also recorded: active sea encounters, land encounters, and sites required current visibility; another player's ship or party required current visibility; another player's city required exploration; the viewer's own cities, ships, and parties remained eligible. The runtime implementation preserves those gates while moving the finite eligible decode set ahead of the first interactive frame.

The two additional generated PNGs initially arrived as 1,254×1,254 RGBA files above the repository's literal 300 KiB per-image ceiling. `tools/polish_runtime_sources.py --normalize-retained-sources` replaced those working bytes in place with project-bound 512×512 RGBA PNGs using an alpha-bounds crop, premultiplied-Lanczos scale to a 384 px maximum subject dimension, transparent centering, and deterministic PNG encoding. The native-canoe source is now 138,454 bytes (`39a00546…`), and the settler-launch source is 228,737 bytes (`f977e0fa…`). Their original byte streams are not retained; `runtime-additions.json` preserves the original hashes (`3867d03e…` and `c4333e9e…`), sizes (953,313 and 1,317,086 bytes), dimensions, and alpha bounds separately from the committed retained-file records.

`tools/polish_runtime_sources.py` keeps the immutable 21 checkpoint sources and the two normalized retained sources, applies deterministic semantic exterior/contact cleanup, and writes review-scale 512 px and optimized 256 px exact-alpha WebP derivatives. The named problem assets—British sloop, pirate galleon, British and Spanish parties, mine, hermit, and native village—must each report removed pixels. The Spanish party, hermit, and native village additionally carry four explicit source-visible contamination witnesses apiece; every witness must be exactly zero alpha after cleanup. Its `--check` mode rebuilds all 23 derivatives and 31 runtime proofs in a temporary directory and requires byte equality.

| Runtime evidence                                | Rule                                            | Observed                     |
| ----------------------------------------------- | ----------------------------------------------- | ---------------------------- |
| runtime identities                              | 21 approved + 2 coherent sea replacements       | 23/23                        |
| retained generated sources                      | RGBA, ≤300 KiB per committed image              | 2/2; 138,454 / 228,737 bytes |
| optimized public tokens                         | RGBA, ≤128 KiB target and ≤300 KiB hard ceiling | 23/23; total 355,010 bytes   |
| conservative all-family cold-cache critical set | ≤3 MiB                                          | 1,022,061 bytes              |
| quadrant overview pages                         | 512 px source layout across all four fields     | 4/4; largest 148,760 bytes   |
| actual-size stress sheet                        | every identity at 96 px                         | 23/23; 46,772 bytes          |
| full-footprint 512 px proofs                    | every identity repeated on all four fields      | 23/23; largest 115,182 bytes |
| full-footprint 96 px proof                      | every identity repeated on all four fields      | 23/23; 138,258 bytes         |
| faction marker proof                            | 24 px, color and grayscale                      | 5/5; 23,116 bytes            |
| runtime/public contact sheet                    | all 23 at 24/32/48/96 + grayscale factions      | 23/23; 154,140 bytes         |
| committed/referenced image census               | every enumerated image ≤300 KiB                 | 155/155 pass                 |

`tools/validate_runtime.py` also requires real full-range alpha, zero-alpha corner sentinels, no newly revealed pixels outside the source silhouette, exact-zero contamination witnesses, byte-identical public copies, exact receipt hashes, distinct retained versus original-unretained provenance, all 23 public identities in the runtime-bound 24/32/48/96 sheet, complete prompt records, and the original checkpoint validator. It enumerates all images in this package plus every external reference, proof flag/tile input, and published receipt target, applying the 300 KiB ceiling to each. Negative controls must reject an oversized retained image, a nonzero semantic witness, and an incomplete 21-only runtime sheet. Hidden-entity eligibility remains a renderer concern rather than an art-file property; the production registry tests use throwing identity lookups and an override-lookup census to prove hidden city, ship, party, encounter, and site detail is absent from preload requests.

The runtime renderer preserves existing exploration and visibility gates, gives neutral cities a safe neutral default, keeps `city:own` and `city:enemy` theme overrides ahead of faction defaults, and waits for every eligible winning texture to settle as loaded or failed before revealing the interactive map. The wait is finite because failed decodes settle to the existing procedural fallback. It does not preload unseen detail art.

Phone, tablet, and desktop in-game captures of the exact integrated head—including fog states, missing-asset fallback, initial-load behavior, and theme overrides—are still required for checkpoint 2. This manifest does not claim checkpoint-2 operator approval.
