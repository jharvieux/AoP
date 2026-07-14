# Shipyard v2 — provenance

Deferred remainder of #490 (closed by PR #491, which shipped the deterministic
half: edge feathering + the `artLoaded` fix). Feathering only softened the
geometric edge — the sprite's own baked-in water color/tone still differed
slightly from the backdrop's sea corner, leaving a faint blend seam. This
batch regenerates the sprite as a true cutout instead: real alpha, no water
baked into the art at all. Replaces `apps/web/public/art/city/shipyard.png`.

Generated with the ComfyUI pipeline (#444), rembg cutout pass, alpha-bbox
trim (+2px, the #495 convention all other city sprites already use).

|          |                                                                   |
| -------- | ----------------------------------------------------------------- |
| File     | `apps/web/public/art/city/shipyard.png` (400×448, RGBA, ~201 KiB) |
| Model    | `DreamShaper_8_pruned.safetensors` (SD1.5)                        |
| Seed     | 8101 (operator pick, see below — was seed 8108 through PR #524)   |
| Params   | steps 32, cfg 7.5, dpmpp_2m / karras, 512×512 (source)            |
| Pipeline | ComfyUI v0.27.0, torch 2.13 MPS (`scripts/art/comfyui_client.py`) |
| Cutout   | rembg (u2net, `~/aop-ai-tools/venv`), alpha-bbox trim +2px        |

Prompt (`BUILDING_STYLE` from `scripts/art/aop_styles.py`, `BUILDINGS["shipyard"]`,
strengthened against the baked-in-water failure mode per the sweep plan):

> stylized isometric game asset of a single small shipyard dry dock with a
> half-built wooden ship hull on a slipway and a crane, flat cel shading,
> clean vector-like game art, dark charcoal roof, cream stone and timber
> walls, sitting on a small round grass island base, centered, plain solid
> white background, no text, high quality, on dry land, dry dock

Negative (`BUILDING_NEGATIVE`, same strengthening):

> photo, realistic, blurry, ugly, deformed, text, watermark, frame, border,
> multiple buildings, people, cluttered background, scenery, sky, clouds,
> warm yellow tint, sepia, water, sea, ocean surface, waves, blue background

Selection: 8 candidates (seeds 8101–8108), same prompt/params, with an rembg
cutout and alpha-bbox-trim applied to each before judging (contact sheet on
a checkerboard so real transparency was visible, not just white-background
renders). None of the eight rendered the prompt's ship-hull-on-a-slipway
literally — DreamShaper 8 drifted toward "dock house with crane/rigging"
across the board, consistent with the rest of the building set abstracting
its theme (compare `ironmine.png`: cave entrance, no house) rather than
depicting every prompt noun.

Rejected: seed 8105 (rembg ghosting — the saliency pass failed to clear a
teal/smoke halo around the subject, leaving visible non-alpha background);
seed 8106 (grass island read well, but the pier base under it kept a
green-tinted reflective band that still reads as water); seed 8107 (faint
cyan fringing between the deck pilings — a smaller instance of the same
ghosting failure mode the guide calls out for low-contrast scenic
backgrounds); seed 8102 and 8104 (open-topped/roofless box and a
disconnected floating-platform-on-a-platform composition, neither reads as
a believable single building); seed 8101 and 8103 (clean cutouts, no water,
but built on stilts over open air with no visible ground — reads as "pier",
not "dry land").

Originally picked (PR #524, since overridden — see below): seed 8108 — dock
house plus a tall crane/pulley rig on a small round grass-and-stone island
base, matching the same base convention as `tavern.png` / `sawmill.png` /
`townhall.png`. No water anywhere in the source render; rembg cutout has
clean edges with no ghosting.

Scene-slot re-check (#493 acceptance criteria, done against seed 8108):
`SCENE_SLOTS.shipyard` in `apps/web/src/CityScene.tsx` was tuned for the old
sprite to hide its baked water square in the backdrop's sea corner. A
scene-composite render (all 14 buildings + the new cutout at the existing
slot, and again at an alternate grass-cluster slot) showed the existing
bottom-right slot already lands the new sprite's grass base right at the
backdrop's sand/water transition — the shoreline runs closest to that
corner — so it read as "shipyard docked at the water's edge" without any
code change.

## Operator override (PR #524, 2026-07-14)

Operator style decision, verbatim: **"Let's go with the first shipyard
seed8101"**. Swapped the shipped sprite from seed 8108 to seed 8101.

Seed 8101 was one of the two candidates rejected during the original #493
pass specifically for its _composition_ (pier on stilts over open water,
no visible ground — see the rejection list above), not for cutout quality;
its rembg cutout was already clean (no ghosting, no fringing). The operator
preferred that pier read over the grass-island convention used by the other
seven candidates and the rest of the building set.

|        |                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| File   | `apps/web/public/art/city/shipyard.png` (400×448, RGBA, ~201 KiB)                                                        |
| Seed   | 8101                                                                                                                     |
| Cutout | Reused the rembg + alpha-bbox-trim(+2px) output already produced during the #493 candidate pass (no regeneration needed) |

Scene-slot re-check (done again against seed 8101, since a pier-on-stilts
composition has different grounding needs than a grass-island one): composed
the full 14-building scene at the existing `SCENE_SLOTS.shipyard` position
(`{ left: 80, top: 75, width: 19, height: 24 }`) and at a candidate slot
nudged further into the water (`{ left: 82, top: 80, width: 18, height: 20 }`)
to see whether the pier read better fully offshore. The existing slot won:
the pier's near pilings land right at the sand/water transition (partly on
wet sand, partly over water) while the far side extends over open water,
which reads as "pier built out from the shore" — exactly the shipyard's
narrative (needs both land and sea access). The nudged-further-out variant
disconnected the structure from the shoreline with no clear benefit. Slot
left unchanged; confirmed again in the real running app (fresh game → built
Sawmill → banked timber → built Shipyard → City screen) with no console
errors.
