# Hex-grid conversion evaluation (#348)

_Design scope document for evaluating a future conversion from the current square grid
to a hex grid on the world map. Status: **evaluation pending — decision deferred until
after rendering polish (#347) is complete.**_

## Problem context

Issue #347 observed that the world map appeared "blocky" to the operator. Investigation
determined this was a rendering issue with the square grid (coastline aliasing, tile
variation, fog gradients) — not an inherent limitation of the square grid topology itself.
D-026 resolved that a hex conversion should be deferred as a separate evaluation (#348)
until the square-grid rendering is polished.

## Why hex?

**Potential advantages**:
- Six-directional movement feels more "natural" in strategy games (though HoMM-style square
  grids are also common).
- Reduced diagonal bias in distance metrics (hex grids have true 6 equidistant neighbors;
  square grids have 8, making diagonals "cheaper").
- Shorter sightlines under the same reveal radius (useful for fog balancing).

## Why not (yet)?

**Impact scope** if actually implemented:
- Engine: adjacency/pathfinding rebuild, all AI search, standing-order distance checks
- Replay contract: action coordinates are serialized in every `GameState`; replay tests
  must cover all existing matches
- Content: map definition format, resource positioning, starting placement, encounter
  spawning
- UI: canvas rendering, input handling, coordinate conversion, minimap
- Multiplayer: coordinate packing in action logs, network payload size implications

**Not to be done speculatively**: this is a "explore after rendering is solid" task, not
a "ship this with tactical combat" task.

## Evaluation scope

Before committing to a hex implementation, the team should:

1. **Polish the square grid** (#347) — evaluate whether rendering fixes eliminate the
   "blocky" perception. If perception improves, hex conversion loses its primary driver.
2. **Quantify the cost** — map out the specific engine, replay-test, and content changes
   needed. Estimate effort.
3. **Decide on timing** — if proceeding, make it a major refactor in its own phase (e.g.
   after Phase 2 multiplayer is stable), not a surprise mid-phase.
4. **Prototype if proceeding** — e.g., implement on a branch against a disposable test map,
   to validate feasibility before touching the canonical engine.

## Decision criteria

Ship hex if and only if:
- Operator judges the square-grid rendering (#347) insufficient after completion.
- The effort estimate fits a future roadmap milestone.
- The replay/content changes are acceptable (e.g., one-time migration for existing saved
  games, no live-map breaking).

Otherwise, the square grid remains canonical indefinitely (it's a fine choice; the
perceived blockiness was a rendering problem, not a topology problem).

## Related issues

- #347 (world-map rendering polish) — must complete before this evaluation is meaningful
- #299 (tiling/autotiling) — relevant to rendering approach
- #349/#350/#351/#352/#355 (prior sweep batches, already merged)
