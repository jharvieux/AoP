import { describe, expect, it } from 'vitest'
import type { GameMap, Tile } from '@aop/engine'
import { findLandPath, tileIndex } from '@aop/engine'
import { partyBlockedSet } from './partyMarch'

function squareMap(size: number): GameMap {
  const tiles: Tile[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) tiles.push({ type: 'land', island: 0 })
  }
  return { width: size, height: size, tiles, startPositions: [] }
}

describe('partyBlockedSet (#482)', () => {
  const map = squareMap(12)
  const party = (id: string, x: number, y: number) => ({ id, position: { x, y } })

  it('blocks every other party tile — own or enemy — but never the party itself', () => {
    const blocked = partyBlockedSet(
      map,
      [party('me', 0, 0), party('friend', 1, 0), party('foe', 2, 5)],
      'me',
    )
    expect(blocked).toEqual(new Set([tileIndex(map, 1, 0), tileIndex(map, 2, 5)]))
  })

  it('feeds findLandPath the same impassability the engine enforces', () => {
    // A full column of other parties at x=1 walls off the west side entirely.
    const wall = Array.from({ length: 12 }, (_, y) => party(`w${y}`, 1, y))
    const blocked = partyBlockedSet(map, [party('me', 0, 0), ...wall], 'me')
    expect(findLandPath(map, { x: 0, y: 0 }, { x: 5, y: 0 }, blocked)).toBeNull()
    expect(findLandPath(map, { x: 0, y: 0 }, { x: 5, y: 0 })).not.toBeNull()
  })
})
