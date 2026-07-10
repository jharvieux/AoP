# Map polish: terrain variation washes on land

_Part of the "commercial-quality map" pass (4 of 5). Extends #392's shallows-wash idea
to land; related to #299 autotiling._

## Problem

Land interiors are one tile-art PNG (plus small dark speckles), so every island reads
as the same uniform green. There's no forest/clearing/highland variation — the biggest
"same-y" tell against commercial maps.

## Proposed change

Reuse the `wash` pattern (soft overlapping discs that merge into organic regions, no
cell seams) over land cells, inside `landGroup` so the coastline mask clips it:

- **Forest wash**: cells where `tileHash(x, y) > 0.55` (aligning with the existing
  speckle threshold) get a darker-green disc pair (e.g. `0x2f5426` at alpha ~0.25,
  radii `TILE*0.9` / `TILE*0.55`).
- **Clearing wash**: cells where `tileHash(x, y) < 0.2` get a lighter warm-green disc
  at low alpha.
- Deterministic per tile, no per-frame work — drawn in the same dirty-redraw pass as
  the existing land speckles.

Optional follow-up (separate issue if pursued): dedicated forest/clearing art variants
via the `tileAutotileId` convention so theme packs can override them.

## Acceptance criteria

- [ ] Adjacent same-hash cells merge into organic patches (no visible cell boundaries).
- [ ] Washes are clipped by the coastline mask (never bleed into water).
- [ ] Deterministic; engine seeded RNG untouched.
- [ ] Map editor rendering either gains the same treatment or is explicitly excluded.

## Affected code

- `apps/web/src/MapCanvas.tsx` (land branch of the tile loop; `landDetail` layer)
