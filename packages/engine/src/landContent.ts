/**
 * Deterministic placement of land content (#466/#467) — resource sites, land
 * random encounters, and inland unaffiliated settlements — across island
 * `land` tiles at match creation.
 *
 * Placement draws from a land-content RNG stream *derived from* the match seed
 * but kept SEPARATE from the live `GameState.rngState`. This is deliberate: the
 * live stream drives combat and sea-encounter rolls at play time, and feeding
 * land placement through it would shift every subsequent roll, silently
 * perturbing existing matches (and the conquest-sim battery) even though the AI
 * ignores land content entirely (#475). A separate stream keeps land placement
 * a pure function of the seed while leaving the live stream byte-identical to a
 * pre-#466 match of the same seed.
 *
 * The three placers run in a fixed order — sites, then land encounters, then
 * inland settlements — each skipping tiles the earlier ones claimed, so the
 * whole board is a deterministic function of the seed.
 */

import type { Coord } from '@aop/shared'
import type {
  InlandSettlementLike,
  LandEncounterCatalogLike,
  LandEncounterKind,
  LandSiteCatalogLike,
  LandSiteKind,
} from './content'
import { mapDistance, mapNeighbors, tileAt, tileIndex, type GameMap } from './map'
import { nextInt, seedRng, type RngState } from './rng'
import type { LandEncounterState, LandSiteState } from './types'

/** A land-content RNG stream, distinct from the match's live combat/encounter stream. */
export function seedForLandContent(seed: number): RngState {
  return seedRng((seed >>> 0) ^ 0x1a2b3c4d)
}

/** Every `land` tile (ports excluded) at least `minStartDistance` from each start, in scan order. */
function landTiles(
  map: GameMap,
  startPositions: readonly Coord[],
  minStartDistance: number,
  occupied: ReadonlySet<number>,
): Coord[] {
  const out: Coord[] = []
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const idx = tileIndex(map, x, y)
      if (occupied.has(idx)) continue
      if (map.tiles[idx]!.type !== 'land') continue
      const coord = { x, y }
      if (startPositions.every((s) => mapDistance(map, s, coord) >= minStartDistance)) {
        out.push(coord)
      }
    }
  }
  return out
}

/**
 * Interior land tiles: a `land` tile whose every map-neighbour is also `land`.
 * That is exactly "≥ 2 tiles from any water" (a distance-1 water tile would be
 * a neighbour), which both guarantees an inland settlement is unreachable by a
 * water-bound captain (no sea assault) and, on a solid disc island, that a
 * party can still march to it overland.
 */
function interiorLandTiles(
  map: GameMap,
  startPositions: readonly Coord[],
  minStartDistance: number,
  occupied: ReadonlySet<number>,
): Coord[] {
  return landTiles(map, startPositions, minStartDistance, occupied).filter((coord) =>
    mapNeighbors(map, coord).every((n) => tileAt(map, n)?.type === 'land'),
  )
}

/** In-place seeded Fisher–Yates; returns the advanced RNG. Same idiom as spawnEncounters. */
function shuffle(candidates: Coord[], rng: RngState): RngState {
  let state = rng
  for (let i = candidates.length - 1; i > 0; i--) {
    let j: number
    ;[state, j] = nextInt(state, 0, i)
    const tmp = candidates[i]!
    candidates[i] = candidates[j]!
    candidates[j] = tmp
  }
  return state
}

/** Pick a key from `weights` (sorted for determinism) by its relative weight. */
function weightedPick<K extends string>(
  weights: ReadonlyArray<readonly [K, number]>,
  rng: RngState,
): [RngState, K] {
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  const [next, r] = nextInt(rng, 0, total - 1)
  let roll = r
  for (const [key, w] of weights) {
    if (roll < w) return [next, key]
    roll -= w
  }
  return [next, weights[weights.length - 1]![0]]
}

/** Scatter land resource sites (#466) on `land` tiles, weighted by kind. */
export function spawnLandSites(
  map: GameMap,
  catalog: LandSiteCatalogLike,
  rng: RngState,
  startPositions: readonly Coord[],
  occupied: ReadonlySet<number>,
): { sites: LandSiteState[]; rng: RngState } {
  const candidates = landTiles(map, startPositions, catalog.minStartDistance, occupied)
  const total = totalLandTiles(map)
  const count = Math.min(Math.floor(total * catalog.spawnDensity), candidates.length)
  let state = shuffle(candidates, rng)

  const weights = (Object.entries(catalog.sites) as Array<[LandSiteKind, { weight: number }]>)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, def]) => [k, def.weight] as const)

  const sites: LandSiteState[] = []
  for (let i = 0; i < count; i++) {
    let kind: LandSiteKind
    ;[state, kind] = weightedPick(weights, state)
    sites.push({ id: `site-${i}`, kind, position: { ...candidates[i]! }, active: true })
  }
  return { sites, rng: state }
}

const LAND_ENCOUNTER_KINDS: readonly LandEncounterKind[] = ['banditCamp', 'hermit', 'nativeVillage']

/** Scatter land random encounters (#466) on `land` tiles, uniform over kinds. */
export function spawnLandEncounters(
  map: GameMap,
  catalog: LandEncounterCatalogLike,
  rng: RngState,
  startPositions: readonly Coord[],
  occupied: ReadonlySet<number>,
): { encounters: LandEncounterState[]; rng: RngState } {
  const candidates = landTiles(map, startPositions, catalog.minStartDistance, occupied)
  const total = totalLandTiles(map)
  const count = Math.min(Math.floor(total * catalog.spawnDensity), candidates.length)
  let state = shuffle(candidates, rng)

  const encounters: LandEncounterState[] = []
  for (let i = 0; i < count; i++) {
    let k: number
    ;[state, k] = nextInt(state, 0, LAND_ENCOUNTER_KINDS.length - 1)
    encounters.push({
      id: `lenc-${i}`,
      kind: LAND_ENCOUNTER_KINDS[k]!,
      position: { ...candidates[i]! },
      active: true,
      respawnRound: null,
    })
  }
  return { encounters, rng: state }
}

/** Interior tiles chosen for inland settlements (#467) — cities the caller then builds. */
export function seedInlandSettlements(
  map: GameMap,
  tuning: InlandSettlementLike,
  rng: RngState,
  startPositions: readonly Coord[],
  occupied: ReadonlySet<number>,
): { positions: Coord[]; rng: RngState } {
  const candidates = interiorLandTiles(map, startPositions, tuning.minStartDistance, occupied)
  const count = Math.min(Math.floor(candidates.length * tuning.density), candidates.length)
  const state = shuffle(candidates, rng)
  return { positions: candidates.slice(0, count).map((c) => ({ ...c })), rng: state }
}

function totalLandTiles(map: GameMap): number {
  let n = 0
  for (const tile of map.tiles) if (tile.type === 'land') n++
  return n
}
