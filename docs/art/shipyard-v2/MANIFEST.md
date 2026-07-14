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
| File     | `apps/web/public/art/city/shipyard.png` (433×481, RGBA, ~232 KiB) |
| Model    | `DreamShaper_8_pruned.safetensors` (SD1.5)                        |
| Seed     | 8108                                                              |
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

Picked: seed 8108 — dock house plus a tall crane/pulley rig on a small round
grass-and-stone island base, matching the same base convention as
`tavern.png` / `sawmill.png` / `townhall.png`. No water anywhere in the
source render; rembg cutout has clean edges with no ghosting.

Scene-slot re-check (#493 acceptance criteria): `SCENE_SLOTS.shipyard` in
`apps/web/src/CityScene.tsx` was tuned for the old sprite to hide its baked
water square in the backdrop's sea corner. A scene-composite render (all 14
buildings + the new cutout at the existing slot, and again at an alternate
grass-cluster slot) showed the existing bottom-right slot already lands the
new sprite's grass base right at the backdrop's sand/water transition —
the shoreline runs closest to that corner — so it reads as "shipyard docked
at the water's edge" without any code change. Slot left as-is; the
CityScene.tsx comment was updated to describe the current (accurate)
reasoning instead of the old one.
