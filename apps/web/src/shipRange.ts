import { reachableTiles, type GameMap } from '@aop/engine'
import type { Coord } from '@aop/shared'
import { findApproachPath } from './approach'

/**
 * The movement-range highlight for a selected ship (#371), as three sets of
 * `"x,y"` tile keys the renderer shades:
 *
 * - `green` — reachable water this turn that is empty or friendly (somewhere the
 *   ship can actually sail to).
 * - `red` — a visible enemy captain, or an enemy city the ship can *actually
 *   attack this turn* (city also needs troops aboard, mirroring the assault gate).
 * - `yellow` — a visible neutral encounter the ship can reach and interact with
 *   this turn.
 *
 * Arrays, not `Set`s, so the whole thing is JSON-comparable in tests and stable
 * to pass as a prop; each is sorted for deterministic output.
 */
export interface RangeOverlay {
  green: string[]
  red: string[]
  yellow: string[]
}

const key = (c: Coord): string => `${c.x},${c.y}`

export interface RangeOverlayInput {
  map: GameMap
  /** The selected captain's tile. */
  from: Coord
  movementPoints: number
  /** Whether the selected captain carries troops — gates whether cities are engageable. */
  hasTroops: boolean
  /** Positions of enemy captains currently in vision (fog already applied by the caller). */
  enemies: Coord[]
  /** Positions of enemy cities on explored tiles. */
  enemyCities: Coord[]
  /** Positions of active encounters currently in vision. */
  encounters: Coord[]
}

/**
 * Can the ship reach an adjacent hex of `targetPos` with a movement point left
 * to spend on the attack/interact itself? This is exactly the rule the
 * confirm-attack flow uses (`approachCost + 1 <= movementPoints`, via the same
 * `findApproachPath`), so a red/yellow tile is never one the engine would then
 * reject — no shading a target the player can't actually act on.
 */
function engageableThisTurn(input: RangeOverlayInput, targetPos: Coord): boolean {
  const approach = findApproachPath(input.map, input.from, targetPos)
  if (!approach) return false
  return approach.length - 1 + 1 <= input.movementPoints
}

export function classifyRangeOverlay(input: RangeOverlayInput): RangeOverlay {
  const red = new Set<string>()
  const yellow = new Set<string>()

  for (const pos of input.enemies) {
    if (engageableThisTurn(input, pos)) red.add(key(pos))
  }
  for (const pos of input.enemyCities) {
    if (input.hasTroops && engageableThisTurn(input, pos)) red.add(key(pos))
  }
  for (const pos of input.encounters) {
    if (engageableThisTurn(input, pos)) yellow.add(key(pos))
  }

  // Green is reachable water minus any tile occupied by a target — a ship never
  // "moves onto" an enemy/encounter/city, so those read only as their own color.
  const occupied = new Set<string>([
    ...input.enemies.map(key),
    ...input.enemyCities.map(key),
    ...input.encounters.map(key),
  ])
  const green: string[] = []
  for (const tile of reachableTiles(input.map, input.from, input.movementPoints)) {
    const k = key(tile)
    if (!occupied.has(k)) green.push(k)
  }

  return {
    green,
    red: [...red].sort(),
    yellow: [...yellow].sort(),
  }
}
