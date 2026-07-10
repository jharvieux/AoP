# Map polish: single light-direction overlay

_Part of the "commercial-quality map" pass (2 of 5). Pairs with the vignette issue._

## Problem

Nothing in the current draw pass encodes a light direction — tiles, coast strokes, and
sprites are all flat-shaded. Commercial strategy maps (Civ-style) read as lit from one
consistent place, which is most of what makes them feel "rendered" rather than "filled".

## Proposed change

- One `Sprite` using `Texture.WHITE`, sized to the viewport, fixed to `pixiApp.stage`
  above `world` (below the vignette).
- Tint warm (`0xfff8e0`-ish), alpha ~0.06, `blendMode: 'soft-light'`.
- Anchor the bright corner top-left (screen space) — either by positioning an oversized
  sprite so its center sits off the top-left corner, or by two overlapping sprites
  (bright top-left, subtle dark bottom-right).
- Resize-only updates, no per-frame work.

## Acceptance criteria

- [ ] A consistent top-left light read across water, land, and sprites.
- [ ] Effect is subtle: toggling it off should be noticeable in A/B, not in isolation.
- [ ] No measurable frame-time regression (it's one static sprite).

## Affected code

- `apps/web/src/MapCanvas.tsx` (layer setup in the Pixi effect)
