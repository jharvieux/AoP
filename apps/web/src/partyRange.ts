import { mapDistance, mapNeighbors, tileAt, tileIndex, type GameMap } from '@aop/engine'
import type { Coord } from '@aop/shared'

/**
 * The movement-range highlight for a selected landing party (#476), the land
 * twin of a ship's {@link classifyRangeOverlay} (#371). Same three-color
 * contract:
 *
 * - `green` — land this party can actually march onto this turn (empty, and
 *   not another party's tile — parties block each other exactly like
 *   `moveParty` enforces).
 * - `red` — a visible enemy party or an explored enemy city already adjacent,
 *   with a movement point free to spend on the attack/assault itself. Parties
 *   have no naval-style "approach" combo (#376's ship-only convenience) — the
 *   tap handler only fires on an *already*-adjacent target, so shading
 *   anything a march-then-attack tap couldn't actually reach would be a lie.
 * - `yellow` — a visible active land encounter already adjacent (same
 *   adjacency-only rule as red), or a capturable land site this party can
 *   reach with a point left over to spend on `captureSite` itself.
 *
 * Arrays, not `Set`s, for the same reasons as the ship overlay: JSON-comparable
 * in tests, stable as a prop, each sorted for deterministic output.
 */
export interface PartyRangeOverlay {
  green: string[]
  red: string[]
  yellow: string[]
}

const key = (c: Coord): string => `${c.x},${c.y}`

export interface PartyRangeOverlayInput {
  map: GameMap
  /** The selected party's tile. */
  from: Coord
  movementPoints: number
  /** Every other party's position (own or enemy) — impassable, mirrors `moveParty`'s block set. */
  otherParties: Coord[]
  /** Positions of enemy parties currently in vision. */
  enemies: Coord[]
  /** Positions of enemy cities on explored tiles. */
  enemyCities: Coord[]
  /** Positions of active land encounters currently in vision. */
  encounters: Coord[]
  /** Positions of land sites this party could still capture (visible, not already held by it owner). */
  capturableSites: Coord[]
}

/** BFS land-tile distances from `from`, capped at `movementPoints` steps, over passable (non-blocked, land) tiles. */
function landDistances(
  map: GameMap,
  from: Coord,
  movementPoints: number,
  blocked: ReadonlySet<number>,
): Map<number, number> {
  const startIdx = tileIndex(map, from.x, from.y)
  const dist = new Map<number, number>([[startIdx, 0]])
  if (movementPoints <= 0) return dist
  const queue: Coord[] = [from]
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!
    const d = dist.get(tileIndex(map, cur.x, cur.y))!
    if (d === movementPoints) continue // depth cap: nothing past here is in range
    for (const n of mapNeighbors(map, cur)) {
      if (tileAt(map, n)?.type !== 'land') continue
      const nIdx = tileIndex(map, n.x, n.y)
      if (blocked.has(nIdx) || dist.has(nIdx)) continue
      dist.set(nIdx, d + 1)
      queue.push(n)
    }
  }
  return dist
}

export function classifyPartyRangeOverlay(input: PartyRangeOverlayInput): PartyRangeOverlay {
  const red = new Set<string>()
  const yellow = new Set<string>()

  for (const pos of input.enemies) {
    if (input.movementPoints >= 1 && mapDistance(input.map, input.from, pos) <= 1) {
      red.add(key(pos))
    }
  }
  for (const pos of input.enemyCities) {
    if (input.movementPoints >= 1 && mapDistance(input.map, input.from, pos) <= 1) {
      red.add(key(pos))
    }
  }
  for (const pos of input.encounters) {
    if (input.movementPoints >= 1 && mapDistance(input.map, input.from, pos) <= 1) {
      yellow.add(key(pos))
    }
  }

  const blocked = new Set(input.otherParties.map((c) => tileIndex(input.map, c.x, c.y)))
  const dist = landDistances(input.map, input.from, input.movementPoints, blocked)

  for (const pos of input.capturableSites) {
    const d = dist.get(tileIndex(input.map, pos.x, pos.y))
    // +1: a movement point must remain after arriving to spend on captureSite itself.
    if (d !== undefined && d + 1 <= input.movementPoints) yellow.add(key(pos))
  }

  const startKey = key(input.from)
  const green: string[] = []
  for (const [idx, d] of dist) {
    if (d === 0) continue // origin excluded, matching the ship overlay
    const tile: Coord = { x: idx % input.map.width, y: Math.floor(idx / input.map.width) }
    const k = key(tile)
    if (k === startKey || yellow.has(k)) continue
    green.push(k)
  }
  green.sort()

  return {
    green,
    red: [...red].sort(),
    yellow: [...yellow].sort(),
  }
}
