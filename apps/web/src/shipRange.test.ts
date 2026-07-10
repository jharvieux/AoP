import { describe, expect, it } from 'vitest'
import type { GameMap, Tile } from '@aop/engine'
import { classifyRangeOverlay, type RangeOverlayInput } from './shipRange'

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

function baseInput(overrides: Partial<RangeOverlayInput> = {}): RangeOverlayInput {
  return {
    map: squareMap(12),
    from: { x: 0, y: 0 },
    movementPoints: 3,
    hasTroops: false,
    enemies: [],
    enemyCities: [],
    encounters: [],
    ...overrides,
  }
}

describe('classifyRangeOverlay', () => {
  it('MP=0 shades nothing reachable', () => {
    const { green } = classifyRangeOverlay(baseInput({ movementPoints: 0 }))
    expect(green).toEqual([])
  })

  it('green is every reachable water tile within movement, and only those', () => {
    const { green } = classifyRangeOverlay(baseInput({ movementPoints: 2 }))
    // Chebyshev distance <= 2 on an open square map, minus the origin.
    expect(green).toContain('2,2')
    expect(green).toContain('0,2')
    expect(green).not.toContain('0,0') // origin excluded
    expect(green).not.toContain('3,3') // distance 3, out of range
  })

  it('reds a reachable enemy (adjacent hex reachable with a point to spare) — matching the attack gate', () => {
    // Enemy at (4,0): the nearest approach hex (3,0) costs 3, +1 for the attack
    // = 4, so it needs MP >= 4 to be engageable this turn.
    const enemy = { x: 4, y: 0 }
    const engageable = classifyRangeOverlay(baseInput({ movementPoints: 4, enemies: [enemy] }))
    expect(engageable.red).toContain('4,0')
    // The enemy's own tile is never also shaded green (a ship doesn't move onto it).
    expect(engageable.green).not.toContain('4,0')

    const outOfReach = classifyRangeOverlay(baseInput({ movementPoints: 3, enemies: [enemy] }))
    expect(outOfReach.red).toEqual([])
  })

  it('yellows a reachable encounter and leaves an unreachable one unshaded', () => {
    const near = { x: 3, y: 0 } // approach (2,0) cost 2, +1 = 3 <= 3 MP
    const far = { x: 9, y: 0 }
    const { yellow } = classifyRangeOverlay(
      baseInput({ movementPoints: 3, encounters: [near, far] }),
    )
    expect(yellow).toEqual(['3,0'])
  })

  it('reds an enemy city only when troops are aboard', () => {
    const city = { x: 3, y: 0 }
    const noTroops = classifyRangeOverlay(
      baseInput({ movementPoints: 3, hasTroops: false, enemyCities: [city] }),
    )
    expect(noTroops.red).toEqual([])
    const withTroops = classifyRangeOverlay(
      baseInput({ movementPoints: 3, hasTroops: true, enemyCities: [city] }),
    )
    expect(withTroops.red).toContain('3,0')
  })

  it('produces byte-identical output across runs (determinism)', () => {
    const a = classifyRangeOverlay(baseInput({ movementPoints: 2 }))
    const b = classifyRangeOverlay(baseInput({ movementPoints: 2 }))
    expect(a).toEqual(b)
  })
})
