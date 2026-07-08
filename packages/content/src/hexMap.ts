/**
 * Square→hex map bridge (#348, Phase 2).
 *
 * Reinterprets a square-grid world map as a hex-grid one for engine testing:
 * the same row-major tiles become pointy-top hexes addressed odd-r
 * (`x` = col, `y` = row), and stamping `topology: 'hex'` switches every
 * engine adjacency/distance/pathfinding consumer to 6-neighbor hex semantics.
 *
 * Terrain and coordinates are preserved verbatim — only their interpretation
 * changes. Because a hex tile has 6 neighbors where a square tile had 8,
 * water connectivity can differ (diagonal-only straits close), so converted
 * maps must be re-validated (engine `validateMapDefinition`) before play.
 * Square-grid maps themselves are untouched; canonical content stays square
 * until the Phase 3 migration.
 *
 * Typed structurally against the engine's `GameMap`/`MapDefinition` shape —
 * @aop/content cannot depend on @aop/engine (the dependency points the other
 * way), the same injection pattern as the tuning data in this package.
 */

/** Structural mirror of the engine's `GameMap` (plus authored-map extras). */
export interface SquareMapLike {
  width: number
  height: number
  /** Row-major, length `width * height`. */
  tiles: { type: 'deep' | 'shallows' | 'land' | 'port'; island: number }[]
  startPositions: { x: number; y: number }[]
  topology?: 'square' | 'hex'
  encounters?: { kind: string; position: { x: number; y: number } }[]
  resourceNodes?: { kind: string; position: { x: number; y: number }; ownerSeat?: number }[]
}

/**
 * An independent copy of `map` reinterpreted as a hex grid. Pure and
 * deterministic — a plain data transform, no RNG, no engine imports.
 */
export function squareMapToHexMap<T extends SquareMapLike>(map: T): T {
  const copy = {
    ...map,
    tiles: map.tiles.map((t) => ({ ...t })),
    startPositions: map.startPositions.map((c) => ({ ...c })),
    topology: 'hex' as const,
  }
  if (map.encounters) {
    copy.encounters = map.encounters.map((e) => ({ ...e, position: { ...e.position } }))
  }
  if (map.resourceNodes) {
    copy.resourceNodes = map.resourceNodes.map((n) => ({ ...n, position: { ...n.position } }))
  }
  return copy
}
