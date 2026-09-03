# Commercial visual v2 — manifest and provenance

Status: **APPROVED — DIRECTION B / GILDED HARBOR DIORAMA**

Issue: #607, child of #606

Generated and reviewed: 2026-09-03

This directory is a design and art-direction package. Its images are review proofs, not runtime assets. Production issues must treat Direction B plus [VISUAL-BIBLE.md](VISUAL-BIBLE.md), [RUNTIME-SPEC.md](RUNTIME-SPEC.md), and the city-composition amendment in the operator approval record as authoritative.

## Package inventory

Each direction contains eight finished review files:

```text
candidates/direction-<a|b>/
  world-map-desktop-1440x900.webp
  world-map-tablet-768x1024.webp
  world-map-phone-375x812.webp
  city-desktop-1440x900.webp
  city-tablet-768x1024.webp
  city-phone-375x812.webp
  city-start-mid-full-1440x560.webp
  direction-summary-1600x1040.webp
```

Shared review and contract files:

```text
candidates/comparison-contact-sheet-1600x1160.webp
candidates/rejected-generation-contact-sheet-1600x930.webp
contracts/city-scale-depth-anchor-1600x1000.webp
contracts/map-token-lod-1600x930.webp
contracts/readability-grayscale-1600x1030.webp
contracts/visual-system-1600x1040.webp
```

Supporting records:

- `README.md`: decision brief and native-size links;
- `VISUAL-BIBLE.md`: shared and direction-specific art/interaction rules;
- `RUNTIME-SPEC.md`: production/export/loading/theme contract;
- `PROMPTS.md`: exact positive/negative prompt assembly, models, params, seeds, and text hashes;
- `tools/generate_sources.py`: repository ComfyUI generation client wrapper for the final corrective prompt family;
- `tools/compose_styleframes.py`: deterministic state, chrome, crop, comparison, and diagram compositor;
- `sources/*.webp`: retained model-generation evidence, including selected mood/style sources and rejections.

## Generation environment

| Property              | Value                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| Host pipeline         | Local ComfyUI 0.27.0                                                                                            |
| Runtime               | torch 2.13, MPS device, 16 GB host                                                                              |
| Client                | repository `scripts/art/comfyui_client.py`                                                                      |
| Graph                 | CheckpointLoaderSimple → CLIPTextEncode positive/negative → EmptyLatentImage → KSampler → VAEDecode → SaveImage |
| Direction A           | DreamShaper 8, SD1.5                                                                                            |
| Direction B           | DreamShaperXL Turbo V2 SFW, SDXL Turbo                                                                          |
| Project source export | RGB WebP, 1024×704, quality 91, method 6                                                                        |
| Compositor export     | RGB WebP, quality 88, method 6                                                                                  |

D-041's established same-seed comparison measured approximately 31 seconds for DreamShaper 8 and 116 seconds for XL when model-swap cost was included. In this run, a warm-cache XL corrective render completed in 72.19 seconds. Speed was not used as a quality proxy.

## Checkpoint identity and license record

Checked against the publisher-hosted model pages on 2026-09-03:

| Local checkpoint                         |         Bytes | SHA-256                                                            | Publisher record                                                                                                                                                                                                           | Declared license                                                                                                                                                                                                                               |
| ---------------------------------------- | ------------: | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DreamShaper_8_pruned.safetensors`       | 2,132,625,894 | `879db523c30d3b9017143d56705015e15a2cb5628762c11d086fed9538abd7fd` | [matching Lykon checkpoint](https://huggingface.co/Lykon/DreamShaper/blob/main/DreamShaper_8_pruned.safetensors), [DreamShaper 8 diffusers card](https://huggingface.co/Lykon/dreamshaper-8/blob/main/README.md)           | The exact-checkpoint repository is labeled `other`; the publisher's version-8 diffusers card declares `creativeml-openrail-m`. Preserve this discrepancy and verify the applicable checkpoint terms before a new commercial runtime-art batch. |
| `DreamShaperXL_Turbo_V2-SFW.safetensors` | 6,939,220,250 | `6e718af03dcb651250ec8911554c4df8472a6d7027bcb3678a206c1170cc94fc` | [matching Lykon checkpoint](https://huggingface.co/Lykon/dreamshaper-xl-v2-turbo/blob/main/DreamShaperXL_Turbo_V2-SFW.safetensors), [model card](https://huggingface.co/Lykon/dreamshaper-xl-v2-turbo/blob/main/README.md) | `openrail++`                                                                                                                                                                                                                                   |

The checkpoint files are not redistributed. The source WebPs were generated locally for this project; no stock imagery, external logos, or copied game screenshots were used. Model-license compliance and the legal status of generated output remain subject to the applicable terms and jurisdiction; this provenance record is not legal advice.

ComfyUI and Pillow are authoring tools only and add no runtime dependency. Georgia and Trebuchet MS were local styleframe-rendering proxies; no font file is included. Runtime typography remains the repository's self-hosted Pirata One and Cabin.

## Exact prompts, models, and seeds

[PROMPTS.md](PROMPTS.md) is the exact record. It preserves all superseded prompt fragments, the literal assembly rule, four negative profiles, positive/negative SHA-256 prefixes, model/sampler settings, and this fixed semantic seed map:

| Asset role    |    Seed |
| ------------- | ------: |
| World map     | 6071001 |
| Empty city    | 6071002 |
| Starting city | 6071003 |
| Midgame city  | 6071004 |
| Full city     | 6071005 |

The original ComfyUI PNG metadata was checked against every retained source's recorded prompt hashes before the source PNGs were excluded from the project package. WebPs intentionally contain no embedded workflow metadata.

## Source disposition

All retained model sources are 1024×704 RGB WebP. “Selected” means selected as a visual ingredient in the approved Direction B style target, not approved as a runtime export. The baked map and city paintings remain non-shippable references.

| Source                                  |   Bytes | Disposition                     | Inspection and reason                                                                                                                                                                   |
| --------------------------------------- | ------: | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a-chartmakers-gouache-map-r1.webp`     |  94,268 | Rejected                        | Attractive islands, but landscape horizon/aerial-photo read fails the playable overhead camera.                                                                                         |
| `a-chartmakers-gouache-empty-r1.webp`   | 150,026 | Rejected                        | Scenic island vista; no stable harbor ground plane or build-plot system.                                                                                                                |
| `a-chartmakers-gouache-map-r2.webp`     |  40,336 | Rejected                        | Overhead corrected, but baked border/garbled text and icon-like single landmass fail the map gate.                                                                                      |
| `a-chartmakers-gouache-empty-r2.webp`   |  53,178 | Rejected                        | Hallucinated huts and detached square ground base violate the empty-backdrop contract.                                                                                                  |
| `a-chartmakers-gouache-start-r2.webp`   |  37,902 | Rejected                        | Ignores two-building state and collapses the harbor into a badge-like object.                                                                                                           |
| `a-chartmakers-gouache-mid-r2.webp`     |  49,450 | Rejected                        | Floating compact town, no coherent shoreline plots or additive state relationship.                                                                                                      |
| `a-chartmakers-gouache-full-r2.webp`    |  26,982 | Rejected                        | Isolated castle emblem; no readable town-hall/economy/recruitment/shipyard districts.                                                                                                   |
| `b-gilded-harbor-diorama-map-r1.webp`   | 134,896 | **Selected B map mood source**  | Strong overhead cove, land/water material, and small-screen hierarchy. Ambient boats/shelters are baked and therefore cannot become a terrain export.                                   |
| `b-gilded-harbor-diorama-empty-r1.webp` | 132,980 | Rejected                        | Polished material, but a large building is baked into “empty” and roof language drifts East Asian.                                                                                      |
| `b-gilded-harbor-diorama-start-r1.webp` | 142,874 | Rejected                        | Multiple buildings and East Asian roof drift; does not represent the two-building state.                                                                                                |
| `b-gilded-harbor-diorama-mid-r1.webp`   | 155,536 | Rejected                        | Scenic harbor, but construction count/layout are uncontrolled and non-modular.                                                                                                          |
| `b-gilded-harbor-diorama-full-r1.webp`  | 126,842 | Rejected                        | More plausible harbor, but distant horizon, mixed architecture, and soft fortification/shipyard anchors miss the contract.                                                              |
| `b-gilded-harbor-diorama-empty-r2.webp` | 131,496 | Rejected                        | Camera/colonial language improved; lighthouse, fort, houses, boats, and dock remain baked in.                                                                                           |
| `b-gilded-harbor-diorama-start-r2.webp` | 158,706 | Rejected                        | Camera/architecture pass, but approximately seven buildings violate the two-building state.                                                                                             |
| `b-gilded-harbor-diorama-mid-r2.webp`   | 153,046 | Rejected                        | Useful material reference; overbuilt, insufficient open plots, and not separable.                                                                                                       |
| `b-gilded-harbor-diorama-full-r2.webp`  | 143,868 | Rejected                        | Strong town, but fortification and shoreline shipyard are not dominant enough for the required anchors.                                                                                 |
| `b-gilded-harbor-diorama-full-r3.webp`  | 151,292 | **Selected B city mood source** | Passes horizonless high-angle, colonial material, fortified civic anchor, visible drydock, shoreline, and district-density gate. It is fortress-heavy and remains a baked concept only. |

The [rejected contact sheet](candidates/rejected-generation-contact-sheet-1600x930.webp) shows the representative failure classes at review size.

## Deterministic composition provenance

### Direction A

No rejected wide-scene DreamShaper 8 output is silently presented as the finished direction. `tools/compose_styleframes.py` builds the map ground deterministically and composes the current project building cutouts on one harbor ground plane. Those cutouts trace to:

- `docs/art/city-v1/MANIFEST.md`;
- `docs/art/city-backdrop-v2/MANIFEST.md`;
- `docs/art/shipyard-v2/MANIFEST.md`.

This is the honest continuity proposal: retain DreamShaper 8's proven small-object silhouette language, then repaint the production library to the locked camera/light/material rules. It also demonstrates arbitrary building subsets without relying on a generated full scene.

### Direction B

The normal map uses `b-gilded-harbor-diorama-map-r1.webp`; the full city uses `b-gilded-harbor-diorama-full-r3.webp`. Tokens, fog, routes, range, HUD, chrome, selection, and panel are deterministic overlays.

Starting/mid/full proofs deliberately use the current separable backdrop and building cutouts with a cool/warm glaze. Two XL prompt rounds failed exact state counts, so substituting generated city-state paintings would falsely claim modularity. In production, rebuild independent B-direction backdrop/building/shadow layers to match the r3 finish while preserving the proof's anchors and state sets.

### Shared compositor

The compositor:

- draws original map semantic icons, route/range/fog treatments, chrome, and diagrams;
- reads existing project art without modifying it;
- places buildings by named state sets and stable anchors;
- exports optimized review WebPs only under this directory;
- does not write runtime assets, source manifests, app code, or theme data.

## Responsive map semantic provenance

The paired maps use one canonical 1024×704 source-world state per direction. Coordinates below are `(x, y)` source pixels and are projected through the same rounded cover transform as the terrain.

| Semantic       | Required terrain | Direction A | Direction B |
| -------------- | ---------------- | ----------- | ----------- |
| Own city       | land/coast       | `(315,170)` | `(500,345)` |
| Enemy city     | land/coast       | `(620,180)` | `(600,240)` |
| Neutral city   | land/coast       | `(570,520)` | `(650,520)` |
| Own fleet      | water            | `(410,460)` | `(390,520)` |
| Enemy fleet    | water            | `(400,300)` | `(350,220)` |
| Sea encounter  | water            | `(520,370)` | `(500,200)` |
| Land encounter | land/coast       | `(540,210)` | `(540,330)` |
| Land site      | land/coast       | `(660,500)` | `(660,440)` |
| Route target   | water            | `(510,410)` | `(485,455)` |

Canonical drawn route paths, including the selected fleet as their first point, are:

- Direction A: `(410,460) → (430,450) → (450,442) → (470,435) → (490,423) → (510,410)`;
- Direction B: `(390,520) → (410,510) → (430,500) → (450,488) → (468,472) → (485,455)`.

The third point after the fleet is the outlined current-turn break. The validator checks every drawn dot plus every source pixel traversed by each segment against declared land masks and the actual source painting—not only the endpoints.

The “Venture · 5/8” chip is attached to the projected own-fleet anchor with deterministic art-canvas offsets: desktop/tablet `(-46,+28)` at 13 px and phone `(-42,+24)` at 11 px. The phone's separate top “Course ready · Tap to sail” banner is route-confirmation chrome, not a fleet label.

The validator also verifies no proof marker or route enters fog, then project/unprojects every anchor, route dot, and label attachment through desktop, tablet, and phone crops with at most one source-pixel rounding error. Range offsets originate from the canonical own-fleet coordinate.

## Validation record

Completed:

- both authoring scripts compiled successfully in the ComfyUI Python environment;
- 22/22 candidate/contract outputs rendered successfully;
- every one of the 17 retained source images and 22 composed images was opened and visually inspected;
- DS8 r1 failures triggered an overhead/camera correction; DS8 r2 still failed wide-scene composition and was rejected rather than silently adopted;
- XL r1 architecture/state failures triggered a colonial/camera correction; XL r2 state control still failed and was replaced by deterministic modular proof; XL r3 corrected the full-city citadel/drydock anchors;
- phone, tablet, desktop, starting/mid/full, strategic/normal/close, selected-building, panel, chrome, and grayscale proofs were checked;
- desktop header collision and selected-panel/object mismatch found during QA were corrected and the full set re-rendered/re-inspected;
- native-size acceptance inspection found unsupported font glyphs in the command dock and map controls; fleet, city, course, end-turn, zoom-in, zoom-out, and overview controls were replaced with locally drawn geometry, added to the visual-system sheet at 20 px, and all dependent proofs were re-rendered;
- responsive acceptance inspection found viewport-relative semantic overlays drifting against separately cropped terrain; all map semantics and fog were moved to canonical source-world coordinates, projected with the terrain crop, and checked against land/water eligibility in both directions;
- the related defect-class sweep found the semantic-zoom diagram's example fleet and route over land; both were moved to the navigable-water side of the shared island;
- route-sample acceptance inspection found Direction B's curved intermediate dots crossing sand despite valid endpoints; both directions now use explicit source-water route paths, every drawn and traversed sample is validated, and phone receives a directly fleet-anchored chip distinct from its route-confirmation banner;
- all review WebPs are below the runtime 300 KiB comparison ceiling; the largest review image is the 228 KiB comparison sheet, although these files are not proposed runtime exports;
- local checkpoint byte size and SHA-256 matched publisher-hosted files;
- prompt text hashes were checked against original ComfyUI PNG metadata;
- no new dependency, runtime asset, component, engine, `GameState`, content, balance, theme schema, or CI file changed.

Focused repository command results are recorded in the delivering commit/PR evidence; visual inspection is also represented by [the grayscale sheet](contracts/readability-grayscale-1600x1030.webp).

## Known limitations and required production corrections

1. Direction A's current city proof intentionally exposes legacy inconsistencies: some cutouts have different ground bases, light, detail density, and dimensionality. Approval selects the direction, not those files as final production art.
2. The current town-hall cutout and B full-city source contain incidental flag-like color. Production removes baked faction identity and uses the existing authored flag overlay and content IDs.
3. Direction B's selected map source includes ambient boats/shelters and its selected city source bakes every structure. Neither source may ship as terrain/backdrop.
4. Direction B r3 is more fortress-dominant than a typical mid-tier town. Production retains its material/depth quality while restoring clearer individual economy, recruitment, tavern, and shipyard silhouettes.
5. Diffusion did not reliably obey exact construction counts in either checkpoint. Dynamic-state acceptance must use separable authored layers, not prompt-only full scenes.
6. The styleframe fonts are local proxies. Final screens must be checked again with Pirata One and Cabin.
7. The exact DreamShaper 8 checkpoint repository and its version-8 diffusers mirror expose different license labels. Resolve and record the applicable terms before generating new commercial runtime art with that checkpoint.
8. These are static concepts. Implementation issues still own keyboard/focus behavior, reduced motion, decode errors, PWA cold-cache behavior, and measured runtime payloads.

## Operator approval record

**Current record: APPROVED on 2026-09-03.**

```text
Commercial visual direction: B — Gilded Harbor Diorama
Camera: approve
Lighting: approve
Palette: approve
City composition: approve with amendment — preserve Direction B's layered depth, coherent harbor materials, and shoreline plan; reduce fortress dominance; give the tavern, economy, recruitment, and shipyard districts clearer individual silhouettes; and implement the city as an empty terrain/coast/road/foundation backdrop plus separable building, shadow, flag, selection, label, value, and UI layers.
Map readability: approve
Faction treatment: approve
Typography: approve
Icon style: approve
Ornament level: approve — retain restrained near-blackened wood and thin brass so gameplay art remains the visual hero.
Decision: approved for #608–#613 production, subject to each child issue's dependency and evidence gates; baked concept paintings are not approved runtime assets.
Approval issue/comment URL: https://github.com/jharvieux/AoP/issues/607#issuecomment-5532926456
Operator/date: repository operator, 2026-09-03
```

The operator declined a separate OpenAI bake-off and authorized selective use of subscription-included OpenAI image generation in later approved art batches when it offers a clear quality or editing advantage. Deterministic local compositing, optimization, provenance, and runtime budget controls remain mandatory. This does not convert generated scene paintings into runtime assets or waive any child issue's proof gate.
