import type { Coord } from '@aop/shared'
import { chebyshevDistance } from '@aop/shared'
import type { EncounterKind } from './content'
import { inBounds, isWaterTile, neighbors8, tileAt, tileIndex, type GameMap } from './map'

/**
 * An author-placed encounter (#41 map editor). When a `MapDefinition` carries
 * these, `createGame` seeds `GameState.encounters` from this fixed list
 * instead of scattering encounters via the seeded RNG (`spawnEncounters`) —
 * still deterministic (no RNG draw at all), so authored placements replay
 * identically without disturbing the RNG stream generated maps rely on.
 */
export interface EncounterPlacement {
  kind: EncounterKind
  position: Coord
}

const VALID_ENCOUNTER_KINDS: ReadonlySet<string> = new Set<EncounterKind>([
  'merchant',
  'natives',
  'settlers',
])

/**
 * Authored maps (#62): a hand-built map is wire-compatible with a generated
 * one — same `width`/`height`/`tiles`/`startPositions` shape as {@link GameMap}
 * — so `createGame` (see game.ts) can accept either without GameState caring
 * where the map came from. "Definition" names the authoring intent; nothing
 * about the runtime representation changes, which keeps replays, saves, and
 * multiplayer authority indifferent to the map's origin.
 *
 * `encounters` is optional and editor-only in origin: omit it (or leave it
 * empty) and `createGame` falls back to the normal seeded encounter scatter.
 */
export interface MapDefinition extends GameMap {
  encounters?: EncounterPlacement[]
}

/**
 * Snapshot any map (generated or authored) as a standalone, editable
 * definition. Powers the "generate random, then sculpt" editor flow (#41):
 * capture a seeded `generateMap()` output, then hand-edit the copy.
 */
export function mapToDefinition(map: GameMap): MapDefinition {
  return {
    width: map.width,
    height: map.height,
    tiles: map.tiles.map((t) => ({ ...t })),
    startPositions: map.startPositions.map((c) => ({ ...c })),
  }
}

/**
 * Content-driven bounds an authored map must satisfy. Values live in
 * @aop/content (see MAP_VALIDATION_LIMITS there), never hardcoded here —
 * this interface is the shape @aop/content's data structurally satisfies,
 * same injection pattern as {@link CombatStatsData} in combat.ts.
 */
export interface MapValidationLimits {
  minSize: number
  maxSize: number
  minPlayers: number
  maxPlayers: number
  /** Minimum Chebyshev distance required between any two start positions. */
  minStartDistance: number
  /** Max allowed ratio between the largest and smallest home island's land area. */
  maxHomeIslandAreaRatio: number
}

export interface MapValidationError {
  code: string
  message: string
}

export interface MapValidationResult {
  valid: boolean
  errors: MapValidationError[]
}

/**
 * Pure validation for an authored map. Used by the editor UI (to highlight
 * problems as the author works) and, later, server-side by the sharing
 * service (#63) — so it returns structured errors rather than a boolean, and
 * never throws on malformed input.
 */
export function validateMapDefinition(
  def: MapDefinition,
  limits: MapValidationLimits,
): MapValidationResult {
  const errors: MapValidationError[] = []

  if (def.width < limits.minSize || def.width > limits.maxSize) {
    errors.push({
      code: 'width-out-of-bounds',
      message: `width ${def.width} must be between ${limits.minSize} and ${limits.maxSize}`,
    })
  }
  if (def.height < limits.minSize || def.height > limits.maxSize) {
    errors.push({
      code: 'height-out-of-bounds',
      message: `height ${def.height} must be between ${limits.minSize} and ${limits.maxSize}`,
    })
  }
  if (def.tiles.length !== def.width * def.height) {
    errors.push({
      code: 'tile-count-mismatch',
      message: `expected ${def.width * def.height} tiles for a ${def.width}x${def.height} map, got ${def.tiles.length}`,
    })
    // The mismatch makes every tile lookup below unsafe (wrong stride) — bail out.
    return { valid: false, errors }
  }

  const playerCount = def.startPositions.length
  if (playerCount < limits.minPlayers || playerCount > limits.maxPlayers) {
    errors.push({
      code: 'player-count-out-of-bounds',
      message: `map has ${playerCount} start positions, must be between ${limits.minPlayers} and ${limits.maxPlayers}`,
    })
  }

  const seen = new Set<string>()
  def.startPositions.forEach((s, i) => {
    const key = `${s.x},${s.y}`
    if (seen.has(key)) {
      errors.push({
        code: 'duplicate-start-position',
        message: `start position ${i} (${key}) duplicates another player's start`,
      })
    }
    seen.add(key)

    if (!inBounds(def, s.x, s.y)) {
      errors.push({
        code: 'start-out-of-bounds',
        message: `start position ${i} (${key}) is outside the map`,
      })
      return
    }
    if (!isWaterTile(tileAt(def, s))) {
      errors.push({
        code: 'start-not-water',
        message: `start position ${i} (${key}) is not a water tile`,
      })
      return
    }
    const nextToPort = neighbors8(def, s).some((n) => tileAt(def, n)?.type === 'port')
    if (!nextToPort) {
      errors.push({
        code: 'start-not-coastal',
        message: `start position ${i} (${key}) is not adjacent to a port`,
      })
    }
  })

  for (let i = 0; i < def.startPositions.length; i++) {
    for (let j = i + 1; j < def.startPositions.length; j++) {
      const d = chebyshevDistance(def.startPositions[i]!, def.startPositions[j]!)
      if (d < limits.minStartDistance) {
        errors.push({
          code: 'starts-too-close',
          message: `start positions ${i} and ${j} are ${d} tiles apart, minimum is ${limits.minStartDistance}`,
        })
      }
    }
  }

  // Fairness: by convention (matching generateMap) home island `island` ids
  // 0..N-1 correspond to start-position index. Compare their land areas.
  const homeIslandAreas = def.startPositions
    .map(
      (_, i) =>
        def.tiles.filter((t) => t.island === i && t.type !== 'deep' && t.type !== 'shallows')
          .length,
    )
    .filter((area) => area > 0)
  if (homeIslandAreas.length > 1) {
    const maxArea = Math.max(...homeIslandAreas)
    const minArea = Math.min(...homeIslandAreas)
    if (maxArea / minArea > limits.maxHomeIslandAreaRatio) {
      errors.push({
        code: 'home-island-imbalance',
        message: `home island land areas range from ${minArea} to ${maxArea} tiles, exceeding the allowed ${limits.maxHomeIslandAreaRatio}x ratio`,
      })
    }
  }

  // Connectivity: every start position must be reachable by sea from every other.
  const allStartsAreWater = def.startPositions.every((s) => isWaterTile(tileAt(def, s)))
  if (allStartsAreWater && def.startPositions.length > 1) {
    const reachable = floodFillWater(def, def.startPositions[0]!)
    def.startPositions.forEach((s, i) => {
      if (i > 0 && !reachable.has(tileIndex(def, s.x, s.y))) {
        errors.push({
          code: 'start-unreachable',
          message: `start position ${i} is not reachable by sea from start position 0`,
        })
      }
    })
  }

  // Author-placed encounters (#41): must be a known kind, in bounds, and on
  // navigable water — the same constraint spawnEncounters enforces for
  // procedural placements. This is an untrusted-input boundary (map codes can
  // be hand-edited or corrupted before import), so an unrecognized `kind`
  // must fail loud here rather than reach the reducer's content lookup.
  def.encounters?.forEach((enc, i) => {
    if (!VALID_ENCOUNTER_KINDS.has(enc.kind)) {
      errors.push({
        code: 'encounter-invalid-kind',
        message: `encounter ${i} has unrecognized kind "${String(enc.kind)}"`,
      })
      return
    }
    if (!inBounds(def, enc.position.x, enc.position.y)) {
      errors.push({
        code: 'encounter-out-of-bounds',
        message: `encounter ${i} (${enc.position.x},${enc.position.y}) is outside the map`,
      })
      return
    }
    if (!isWaterTile(tileAt(def, enc.position))) {
      errors.push({
        code: 'encounter-not-water',
        message: `encounter ${i} (${enc.position.x},${enc.position.y}) is not a water tile`,
      })
    }
  })

  return { valid: errors.length === 0, errors }
}

/** All water tiles reachable from `start` by 8-directional sea travel. */
function floodFillWater(map: GameMap, start: Coord): Set<number> {
  const visited = new Set<number>()
  if (!isWaterTile(tileAt(map, start))) return visited
  const queue: Coord[] = [start]
  visited.add(tileIndex(map, start.x, start.y))
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const n of neighbors8(map, current)) {
      const idx = tileIndex(map, n.x, n.y)
      if (visited.has(idx) || !isWaterTile(tileAt(map, n))) continue
      visited.add(idx)
      queue.push(n)
    }
  }
  return visited
}
