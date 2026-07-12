import { describe, expect, it } from 'vitest'
import type { GameMap, Tile } from '@aop/engine'
import { tileIndex } from '@aop/engine'
import { planPartyMarch } from './partyMarch'

function squareMap(size: number, overrides: Record<string, Tile['type']> = {}): GameMap {
  const tiles: Tile[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const type = overrides[`${x},${y}`] ?? 'land'
      tiles.push({ type, island: 0 })
    }
  }
  return { width: size, height: size, tiles, startPositions: [] }
}

describe('planPartyMarch', () => {
  const map = squareMap(12)

  it('returns the full destination when it fits this turn', () => {
    const plan = planPartyMarch(map, { x: 0, y: 0 }, { x: 2, y: 0 }, 3)
    expect(plan).toEqual({ to: { x: 2, y: 0 }, remainingSteps: 0 })
  })

  it('truncates to as far as this turn reaches when the destination is out of range', () => {
    const plan = planPartyMarch(map, { x: 0, y: 0 }, { x: 5, y: 0 }, 2)
    expect(plan).toEqual({ to: { x: 2, y: 0 }, remainingSteps: 3 })
  })

  it('re-planning from the truncated tile continues toward the same destination', () => {
    const first = planPartyMarch(map, { x: 0, y: 0 }, { x: 5, y: 0 }, 2)!
    const second = planPartyMarch(map, first.to, { x: 5, y: 0 }, 2)
    expect(second).toEqual({ to: { x: 4, y: 0 }, remainingSteps: 1 })
    const third = planPartyMarch(map, second!.to, { x: 5, y: 0 }, 2)
    expect(third).toEqual({ to: { x: 5, y: 0 }, remainingSteps: 0 })
  })

  it('returns null with no movement left', () => {
    expect(planPartyMarch(map, { x: 0, y: 0 }, { x: 5, y: 0 }, 0)).toBeNull()
  })

  it('returns null for an unreachable destination (walled off by other parties)', () => {
    // A full column of other parties at x=1 walls off the west side entirely —
    // diagonal movement can't slip past a blocked tile the way it could a
    // single one, so (5,0) is genuinely unreachable from (0,0).
    const blocked = new Set<number>()
    for (let y = 0; y < 12; y++) blocked.add(tileIndex(map, 1, y))
    expect(planPartyMarch(map, { x: 0, y: 0 }, { x: 5, y: 0 }, 3, blocked)).toBeNull()
  })

  it('returns null when already standing on the destination', () => {
    expect(planPartyMarch(map, { x: 3, y: 3 }, { x: 3, y: 3 }, 4)).toBeNull()
  })
})
