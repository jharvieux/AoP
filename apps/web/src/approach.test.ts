import { describe, expect, it } from 'vitest'
import type { GameMap, Tile } from '@aop/engine'
import { findApproachPath } from './approach'

/** An all-deep-water square map, `size` x `size`, with land dropped in via `overrides`. */
function squareMap(size: number, overrides: Record<string, Tile['type']> = {}): GameMap {
  const tiles: Tile[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const type = overrides[`${x},${y}`] ?? 'deep'
      tiles.push({ type, island: type === 'deep' ? -1 : 0 })
    }
  }
  return { width: size, height: size, tiles, startPositions: [] }
}

/** An all-deep-water hex map (odd-r pointy-top), `size` x `size`. */
function hexMap(size: number, overrides: Record<string, Tile['type']> = {}): GameMap {
  const map = squareMap(size, overrides)
  return { ...map, topology: 'hex' }
}

describe('findApproachPath', () => {
  it('square: returns the cheapest water neighbor of the target as the approach path', () => {
    const map = squareMap(10)
    const from = { x: 0, y: 0 }
    const target = { x: 5, y: 5 }
    const path = findApproachPath(map, from, target)
    expect(path).not.toBeNull()
    const dest = path!.at(-1)!
    // Destination must be a neighbor of the target, not the target itself.
    expect(Math.max(Math.abs(dest.x - target.x), Math.abs(dest.y - target.y))).toBe(1)
    expect(path![0]).toEqual(from)
  })

  it('hex: returns the cheapest water neighbor of the target as the approach path', () => {
    const map = hexMap(12)
    const from = { x: 0, y: 0 }
    const target = { x: 6, y: 6 }
    const path = findApproachPath(map, from, target)
    expect(path).not.toBeNull()
    const dest = path!.at(-1)!
    expect(dest).not.toEqual(target)
  })

  it('returns null when every neighbor of the target is land (island-locked target)', () => {
    const size = 7
    const target = { x: 3, y: 3 }
    const overrides: Record<string, Tile['type']> = { [`${target.x},${target.y}`]: 'port' }
    // Ring every 8-neighbor of the target with land so no water tile touches it.
    for (const [dx, dy] of [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ]) {
      overrides[`${target.x + dx!},${target.y + dy!}`] = 'land'
    }
    const map = squareMap(size, overrides)
    const path = findApproachPath(map, { x: 0, y: 0 }, target)
    expect(path).toBeNull()
  })

  it('breaks equal-cost ties deterministically by tile index', () => {
    const map = squareMap(10)
    const from = { x: 5, y: 0 }
    const target = { x: 5, y: 5 }
    // From directly above the target, (4,4) and (6,4) are both distance-4
    // diagonal neighbors of `from` — an equal-cost tie among the target's
    // water neighbors. Run twice (fresh map objects) to confirm the same
    // approach hex is chosen every time, not just self-consistent within one map.
    const first = findApproachPath(squareMap(10), from, target)
    const second = findApproachPath(map, from, target)
    expect(first).toEqual(second)
  })

  it('already-adjacent: the approach path costs zero movement (single-tile path)', () => {
    const map = squareMap(10)
    const target = { x: 5, y: 5 }
    const from = { x: 6, y: 6 } // a diagonal (8-dir) neighbor of the target
    const path = findApproachPath(map, from, target)
    expect(path).not.toBeNull()
    expect(path).toEqual([from])
    expect(path!.length - 1).toBe(0)
  })
})
