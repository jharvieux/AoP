# Map polish: screen-space vignette for map-edge falloff

_Follow-up to #347/#394 rendering polish. Part of the "commercial-quality map" pass (1 of 5)._

## Problem

The uncharted falloff (`UNCHARTED_SHADE` + `knownSea` halo strokes) only darkens around
the explored-region boundary in world space. At typical zoom the viewport edge itself has
no depth cue, so the map reads as a flat plane that just stops — there's no sense of
"the world recedes into darkness" at the frame.

## Proposed change

Add a screen-fixed vignette layer in `MapCanvas.tsx`:

- One `Graphics` added to `pixiApp.stage` **above** `world` (so it never pans/zooms).
- Fake the radial gradient with 4–6 concentric inset `stroke()` rings of increasing
  alpha toward the viewport edge — same layered-stroke trick `knownSea`'s halo already
  uses (Pixi `Graphics` has no native gradients).
- Color: `FOG_COLOR` (or `shadeColor(deepPacked, UNCHARTED_SHADE)`), peak alpha ~0.5 at
  the very edge, 0 by ~15% inset.
- Redraw only on renderer resize, not per frame.

## Acceptance criteria

- [ ] Vignette is fixed to the screen; panning/zooming does not move it.
- [ ] No per-frame Graphics rebuild (resize-only).
- [ ] Fog of war, minimap, and map editor rendering unchanged.
- [ ] Works for both square and hex topologies (it's topology-agnostic by construction).

## Affected code

- `apps/web/src/MapCanvas.tsx` (layer setup in the Pixi effect; resize handling)
