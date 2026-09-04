# Gilded Harbor city art — checkpoint 1

**Status:** operator checkpoint 1 for issue #608; not runtime art and not yet approved for
the full production batch.

![Checkpoint contact sheet](proofs/checkpoint-contact-sheet-1600x1120.webp)

This package answers the first art gate in #608 with one representative Direction B city.
It contains the town hall, tavern, shoreline shipyard, trade-house economy building,
barracks recruitment building, and a low stone-wall element. The proof applies D-049's
amendment: it keeps the layered harbor depth, limestone/timber material language, and
luminous water while reducing fortress dominance and giving the working districts
different silhouettes.

## Approval question

**Does this feel like the right city-art direction to carry through the complete building
set—specifically the open harbor composition, reduced fortress mass, and clearer tavern,
economy, recruitment, and shoreline-shipyard silhouettes?**

Approval advances #608 to the complete runtime-asset batch and its second integrated
starting/midgame/full-city checkpoint. Requested changes should name the visual role or
overall balance that feels wrong; no code review is needed.

## Native review files

- [Desktop composite, 1440×900](proofs/desktop-1440x900.webp)
- [Phone composite, 375×812](proofs/phone-375x812.webp) — includes the actual 375×258 city
  scene size
- [Maximum-zoom crop, 1024×704](proofs/max-zoom-1024x704.webp) — one viewport into the
  current 3× zoom, centered on tavern and trade house
- [Layer / depth / anchor sheet, 1600×1000](proofs/layer-separation-1600x1000.webp)
- Native 1024×1024 saturated alpha stress: [town hall](proofs/stress/townhall-magenta-1024.webp),
  [tavern](proofs/stress/tavern-magenta-1024.webp),
  [trade house](proofs/stress/tradehouse-magenta-1024.webp),
  [barracks](proofs/stress/barracks-magenta-1024.webp),
  [stone wall](proofs/stress/stonewall-magenta-1024.webp), and
  [shipyard](proofs/stress/shipyard-magenta-1024.webp)
- [Empty runtime-size backdrop proof, 1024×704](proofs/empty-runtime-1024x704.webp)
- [Unframed representative scene, 1024×704](proofs/scene-runtime-1024x704.webp)

Open these at 100%. The contact sheet is a summary, not a substitute for native-size
inspection.

## What this checkpoint proves

- The harbor is an opaque, building-free 16:11 terrain/coast/road/foundation layer.
- All six constructed subjects are genuine-alpha WebP cutouts with safe transparent
  margins, reviewed semantic masks, clear enclosed gaps, and no detached pale floor
  mattes; the contact shadows are a seventh, separate layer.
- Placement uses the exact existing `SCENE_SLOTS` rectangles from `CityScene.tsx`; no
  runtime coordinates have changed.
- The town hall remains the civic anchor, but a low perimeter element no longer turns the
  city into a fortress first.
- Tavern, trade house, barracks, and shipyard differ in massing and silhouette at the
  375-pixel phone composition and in a current 3× zoom crop.
- The shipyard is a drydock/cradle/pier cutout with a dedicated shore gangway. It spans
  dry sand/limestone and water inside the current lower-right slot; no water is baked into
  it.
- Rebuilding the retained proof files from the retained sources is byte-identical.

## Deliberate boundary

This checkpoint changes only `docs/art/city-harbor-v2/`. It does not replace anything in
`apps/web/public/art/city/`, change `CityScene.tsx`, add a content ID, alter gameplay, or
claim that the remaining buildings and all five faction treatments are finished. Those
remain in #608 after checkpoint approval. This approves visual direction and modular
construction, not final full-batch source sharpness.

The built-in OpenAI image generator supplied source art under the operator's D-049
authorization. It returned a painted checker preview rather than an alpha channel for the
six requested cutouts, even after a targeted background-extraction retry. The retained
cutouts therefore use the repository's established `rembg` IS-Net semantic-mask workflow,
then a documented single-component hardening and soft-edge pass. Explicit reviewed masks
are retained under `masks/`, and saturated magenta/dark-teal proofs expose enclosed checker
or matte failures. See [PROMPTS.md](PROMPTS.md) and [MANIFEST.md](MANIFEST.md) for exact
provenance and limitations.

## Rebuild and validate

Mask regeneration uses the repository's separate `rembg` environment and cached
`isnet-general-use` model. Proof composition needs Pillow, NumPy, and SciPy from the
existing ComfyUI venv. Neither is a runtime dependency.

```bash
NUMBA_DISABLE_JIT=1 ~/aop-ai-tools/venv/bin/python3 \
  docs/art/city-harbor-v2/tools/build_subject_masks.py
~/aop-ai-tools/ComfyUI/venv/bin/python \
  docs/art/city-harbor-v2/tools/compose_checkpoint.py
~/aop-ai-tools/ComfyUI/venv/bin/python \
  docs/art/city-harbor-v2/tools/validate_checkpoint.py
```
