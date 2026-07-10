# Map polish: slow caustic layer for water depth

_Part of the "commercial-quality map" pass (5 of 5). Builds on #392's glints and the
#298 ambient ticker._

## Problem

Open water is a flat fill with sparse glint streaks. It lacks the large-scale, slowly
moving light pattern ("caustics") that makes commercial game oceans read as deep and
alive.

## Proposed change

A second, larger-scale ambient layer alongside `glintSprites`:

- New `SpritePool`-backed container between `knownSea` and `landGroup`.
- Sparse deterministic subset of explored water cells (reuse `tileHash`, density ~0.05,
  disjoint from the glint subset) each get a big soft blob: `Texture.WHITE`, size
  ~`TILE*2.5`, tint near-white, alpha peak ~0.05, `blendMode: 'soft-light'`.
- Put one `BlurFilter` on the whole container (cheap, one filter pass) rather than
  per-sprite blur.
- The #298 ambient tick drifts each sprite slowly (a few px over ~20s, direction from
  `tileHash`) and oscillates alpha on a much longer period than the existing glints —
  cheap property writes, no Graphics rebuild.
- Cull to `visibleCellBounds` like everything else; pool drops off-screen sprites.

## Acceptance criteria

- [ ] Water visibly "moves" at rest without any interaction.
- [ ] Deterministic placement (same tile ⇒ same blob), animation phase may be
      wall-clock based.
- [ ] Frame time within the #27 perf budget on mobile (verify with the filter on).
- [ ] Fog dimming still reads correctly over caustic water.

## Affected code

- `apps/web/src/MapCanvas.tsx` (new layer + pool; ambient tick extension)
- `apps/web/src/usePixiApp.ts` / ticker wiring only if the ambient tick needs a
  second cadence
