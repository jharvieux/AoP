# Largest-map presentation trace

## Method

Both the baseline and post-change traces generated seed 611 at `xlarge`, five players, for square
and odd-r hex topology. Each map was generated twice and serialized to prove repeatability. All
9,216 cells were marked explored to exercise worst-case presentation rather than the much smaller
round-1 visible area. Twenty baseline and 24 post-change warm-process samples used the same
`paintedWorld` loop tracing and representative phone/desktop viewports.

The post-change trace walked panning camera positions in all three bands. It counted the exact pure
presentation branches that feed Pixi: visible cell visits, terrain selections, decal sprites, and
ambient glint/caustic/port sprites. Timing includes coastline/exploration tracing plus deterministic
terrain selection, but excludes GPU submission and entity drawing. Values are local wall-clock
observations, not device guarantees.

## Determinism

| Topology | Map checksum, first/repeat | Terrain-selection checksum, first/repeat |
| -------- | -------------------------- | ---------------------------------------- |
| Square   | `24ac26e4` / `24ac26e4`    | `7cffc665` / `7cffc665`                  |
| Hex      | `850f93a6` / `850f93a6`    | `faf50b11` / `faf50b11`                  |

The terrain checksum includes every non-water coordinate's base, decal, sparse/rich eligibility,
shore state, port overlay, and known-water facing. The repeated checksums were identical.
These post-repair checksums bind the coordinate-hashed irregular base selection; the map checksums
remain unchanged from the pre-repair trace.

## Overview work reduction

Before this change, a fully fitted 96×96 map visited every visible cell and populated the existing
ambient/detail layers. The seeded square scene carried 1,313 ambient sprites and 3,597 terrain-detail
primitives; hex carried 1,293 ambient sprites and 3,767 detail primitives. Overview now paints the
already traced land silhouette and coast loops directly:

| Worst-case fitted overview | Per-cell terrain visits |                 Terrain/decal sprites | Ambient sprites |
| -------------------------- | ----------------------: | ------------------------------------: | --------------: |
| Previous square            |                   9,216 | 2,059 bases + 3,597 detail primitives |           1,313 |
| New square                 |                       0 |                                     0 |               0 |
| Previous hex               |                   9,216 | 2,160 bases + 3,767 detail primitives |           1,293 |
| New hex                    |                       0 |                                     0 |               0 |

Fog and the 25 traced coast loops remain because they carry visibility and landmass truth. Overview
does not merely cover the detailed scene: its sprite pools end empty, and the ambient tick iterates
zero terrain/water sprites.

## Panning samples

| Topology / viewport / band | Screen px per tile | Example visible-bound cells | Median ms | p95 ms |
| -------------------------- | -----------------: | --------------------------: | --------: | -----: |
| Square phone overview      |              4.063 |           6,912 (0 visited) |     3.721 |  3.958 |
| Square phone tactical      |                 32 |                         527 |     3.831 |  4.004 |
| Square phone detail        |                 64 |                         187 |     3.731 |  3.856 |
| Square desktop overview    |              9.375 |           8,832 (0 visited) |     3.670 |  3.992 |
| Square desktop tactical    |                 32 |                       1,518 |     3.985 |  4.172 |
| Square desktop detail      |                 64 |                         486 |     3.718 |  3.880 |
| Hex phone overview         |              4.041 |           7,008 (0 visited) |    15.578 | 17.483 |
| Hex phone tactical         |                 32 |                         648 |    15.791 | 16.129 |
| Hex phone detail           |                 64 |                         240 |    15.700 | 15.818 |
| Hex desktop overview       |             10.788 |           8,372 (0 visited) |    15.635 | 15.758 |
| Hex desktop tactical       |                 32 |                       1,786 |    16.073 | 16.302 |
| Hex desktop detail         |                 64 |                         616 |    15.886 | 16.722 |

The baseline painted-geometry-only medians/p95s were 3.220/3.498 ms for square and
18.844/21.217 ms for hex. Similar overview CPU time is expected because loop tracing is preserved;
the material saving is the eliminated 9,216-cell Pixi reconstruction and empty ambient update set.

## Browser smoke limitation

The retained pre-repair browser session successfully exercised the phone's largest map across all
three bands with 22 pan drags, 12 zoom actions, and two recenters, and logged no warning or error.
The repair environment exposed no browser backend and could not recapture changed pixels, so
`RUNTIME-CAPTURES.md` marks that evidence stale and the asset checker rejects its digest. The earlier
browser backend did not expose Performance Timeline entries, so this evidence deliberately does not
claim browser FPS or frame-time percentiles. A supervisor may add a device/DevTools trace without
changing the runtime candidate; the checked-in draw-work and CPU trace remains the fail-loud
evidence available here.
