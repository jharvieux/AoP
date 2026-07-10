# Map polish: per-segment alpha jitter on coastline strokes

_Part of the "commercial-quality map" pass (3 of 5). Builds on #393's coast treatment._

## Problem

`coast` draws the surf/sand/shoreline as three whole-loop strokes with uniform
width/alpha, so the beach ring reads as a mechanical outline ("pasted-on"), not surf.
Real coastlines have foam that breathes unevenly along the shore.

## Proposed change

In the `coast` drawing block of `MapCanvas.tsx`:

- Instead of stroking each smoothed loop once, stroke it in short runs (e.g. 4–8 points
  per run, overlapping by one point so there are no gaps).
- Multiply each run's alpha by `0.7 + tileHash(round(px), round(py)) * 0.6` using the
  run's first point (rounded to ints) as the hash input — reuses the existing
  deterministic `tileHash`, so two paints of the same coastline agree and no engine
  RNG is touched.
- Apply the jitter to the wide surf band (`SURF_COLOR`) and sand rim (`SAND_COLOR`);
  keep the 1.5px `SHORE_COLOR` hairline uniform so the silhouette stays crisp.

## Acceptance criteria

- [ ] Coast alpha variation is deterministic (same map + exploration ⇒ same pixels).
- [ ] No seams/gaps where stroke runs meet.
- [ ] Geometry cache behavior unchanged (`paintedGeometry` still keyed the same way).
- [ ] Frame time within budget while panning (strokes still only rebuilt on dirty).

## Affected code

- `apps/web/src/MapCanvas.tsx` (coast stroke block)
- `apps/web/src/paintedWorld.ts` (only if a helper for splitting loops into runs fits
  better there — keep it pure/unit-testable like the rest of that module)
