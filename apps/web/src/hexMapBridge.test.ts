import { squareMapToHexMap } from '@aop/content'
import { generateMap, mapDistance, mapNeighbors, mapTopology, type GameMap } from '@aop/engine'
import { describe, expect, it } from 'vitest'

/**
 * Integration test for the square→hex content bridge (#348, Phase 2). Lives in
 * the web package because the engine never imports @aop/content — callers
 * marry the two, exactly as hexProto.test.ts does for the Phase 1 prototype.
 */

function generated(): GameMap {
  return generateMap(7, 'small', 2, 2, 0.4)
}

describe('squareMapToHexMap', () => {
  it('preserves terrain and starts verbatim while stamping hex topology', () => {
    const square = generated()
    const hex = squareMapToHexMap(square)
    expect(hex.topology).toBe('hex')
    expect(hex.tiles).toEqual(square.tiles)
    expect(hex.startPositions).toEqual(square.startPositions)
    // The source square map is untouched — no topology leaks back.
    expect('topology' in square).toBe(false)
  })

  it('returns an independent copy (mutations never leak back)', () => {
    const square = generated()
    const hex = squareMapToHexMap(square)
    hex.tiles[0]!.type = 'land'
    hex.startPositions[0]!.x += 1
    expect(square.tiles[0]!.type).not.toBe('land')
    expect(square.startPositions[0]!.x).toBe(hex.startPositions[0]!.x - 1)
  })

  it('the converted map answers engine queries with hex semantics', () => {
    const hex: GameMap = squareMapToHexMap(generated())
    expect(mapTopology(hex)).toBe('hex')
    expect(mapNeighbors(hex, { x: 10, y: 10 })).toHaveLength(6)
    // The south-east square diagonal of an even row is two hex steps.
    expect(mapDistance(hex, { x: 10, y: 10 }, { x: 11, y: 11 })).toBe(2)
  })
})
