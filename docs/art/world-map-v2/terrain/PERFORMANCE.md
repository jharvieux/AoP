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
| Square   | `24ac26e4` / `24ac26e4`    | `07f57e8e` / `07f57e8e`                  |
| Hex      | `850f93a6` / `850f93a6`    | `52a076ac` / `52a076ac`                  |

The terrain checksum includes every non-water coordinate's base, decal, sparse/rich eligibility,
shore state, port overlay, and known-water facing. The repeated checksums were identical.

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
| Square phone overview      |              4.063 |           6,912 (0 visited) |     3.399 |  3.999 |
| Square phone tactical      |                 32 |                         527 |     3.514 |  3.841 |
| Square phone detail        |                 64 |                         187 |     3.368 |  3.572 |
| Square desktop overview    |              9.375 |           8,832 (0 visited) |     3.306 |  3.459 |
| Square desktop tactical    |                 32 |                       1,518 |     3.768 |  4.210 |
| Square desktop detail      |                 64 |                         486 |     3.447 |  4.233 |
| Hex phone overview         |              4.041 |           7,008 (0 visited) |    19.331 | 20.628 |
| Hex phone tactical         |                 32 |                         648 |    20.015 | 22.995 |
| Hex phone detail           |                 64 |                         240 |    20.773 | 23.767 |
| Hex desktop overview       |             10.788 |           8,372 (0 visited) |    20.383 | 22.496 |
| Hex desktop tactical       |                 32 |                       1,786 |    20.055 | 21.660 |
| Hex desktop detail         |                 64 |                         616 |    20.047 | 22.058 |

The baseline painted-geometry-only medians/p95s were 3.220/3.498 ms for square and
18.844/21.217 ms for hex. Similar overview CPU time is expected because loop tracing is preserved;
the material saving is the eliminated 9,216-cell Pixi reconstruction and empty ambient update set.

## Browser smoke limitation

The in-app browser successfully exercised the phone's largest map across all three bands with 22
pan drags, 12 zoom actions, and two recenters, and logged no warning or error. Its backend did not
expose Performance Timeline entries, so this evidence deliberately does not claim browser FPS or
frame-time percentiles. A supervisor may add a device/DevTools trace without changing the runtime
candidate; the checked-in draw-work and CPU trace remains the fail-loud evidence available here.
