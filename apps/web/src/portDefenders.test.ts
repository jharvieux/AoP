import { describe, expect, it } from 'vitest'
import type { GameMap } from '@aop/engine'
import { portDefenderCount } from './portDefenders'

/** An all-deep-water square map, `size` x `size` — distance is all that matters here. */
function squareMap(size: number): GameMap {
  const tiles = Array.from({ length: size * size }, () => ({ type: 'deep' as const, island: -1 }))
  return { width: size, height: size, tiles, startPositions: [] }
}

const CITY = { ownerId: 'p1', position: { x: 5, y: 5 } }

describe('portDefenderCount', () => {
  it('counts a docked own captain', () => {
    const captains = [{ id: 'c1', ownerId: 'p1', position: { x: 5, y: 6 }, captured: false }]
    expect(portDefenderCount(captains, [], squareMap(12), CITY)).toBe(1)
  })

  it('excludes captains beyond distance 1', () => {
    const captains = [{ id: 'c1', ownerId: 'p1', position: { x: 8, y: 8 }, captured: false }]
    expect(portDefenderCount(captains, [], squareMap(12), CITY)).toBe(0)
  })

  it('excludes an enemy captain even if docked', () => {
    const captains = [{ id: 'c1', ownerId: 'p2', position: { x: 5, y: 5 }, captured: false }]
    expect(portDefenderCount(captains, [], squareMap(12), CITY)).toBe(0)
  })

  it('excludes a captured or shipless captain', () => {
    const captains = [
      { id: 'c1', ownerId: 'p1', position: { x: 5, y: 5 }, captured: true },
      {
        id: 'c2',
        ownerId: 'p1',
        position: { x: 5, y: 5 },
        captured: false,
        shipLost: true as const,
      },
    ]
    expect(portDefenderCount(captains, [], squareMap(12), CITY)).toBe(0)
  })

  it('excludes a captain ashore leading a landing party', () => {
    const captains = [{ id: 'c1', ownerId: 'p1', position: { x: 5, y: 5 }, captured: false }]
    expect(portDefenderCount(captains, [{ captainId: 'c1' }], squareMap(12), CITY)).toBe(0)
  })

  it('counts multiple own captains within range', () => {
    const captains = [
      { id: 'c1', ownerId: 'p1', position: { x: 5, y: 5 }, captured: false },
      { id: 'c2', ownerId: 'p1', position: { x: 4, y: 4 }, captured: false },
    ]
    expect(portDefenderCount(captains, [], squareMap(12), CITY)).toBe(2)
  })
})
