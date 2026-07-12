import { describe, expect, it } from 'vitest'
import type { GameMap, Tile } from '@aop/engine'
import { classifyPartyRangeOverlay, type PartyRangeOverlayInput } from './partyRange'

/** An all-land square map, `size` x `size`, with overrides (e.g. a port tile) dropped in. */
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

function baseInput(overrides: Partial<PartyRangeOverlayInput> = {}): PartyRangeOverlayInput {
  return {
    map: squareMap(12),
    from: { x: 0, y: 0 },
    movementPoints: 3,
    otherParties: [],
    enemies: [],
    enemyCities: [],
    encounters: [],
    capturableSites: [],
    ...overrides,
  }
}

describe('classifyPartyRangeOverlay', () => {
  it('MP=0 shades nothing reachable', () => {
    const { green } = classifyPartyRangeOverlay(baseInput({ movementPoints: 0 }))
    expect(green).toEqual([])
  })

  it('green is every reachable land tile within movement, and only those', () => {
    const { green } = classifyPartyRangeOverlay(baseInput({ movementPoints: 2 }))
    expect(green).toContain('2,2')
    expect(green).toContain('0,2')
    expect(green).not.toContain('0,0') // origin excluded
    expect(green).not.toContain('3,3') // Chebyshev distance 3, out of range
  })

  it('other parties block movement through their tile, just like moveParty', () => {
    // A full column of other parties at x=1 walls off the west side entirely —
    // diagonal movement can't slip past a single blocked tile the way it could
    // slip past one, so nothing at x>=1 is reachable from (0,0).
    const wall = Array.from({ length: 12 }, (_, y) => ({ x: 1, y }))
    const { green } = classifyPartyRangeOverlay(
      baseInput({ movementPoints: 3, otherParties: wall }),
    )
    expect(green).not.toContain('1,0')
    expect(green).not.toContain('2,0')
    expect(green).toContain('0,1') // still free to move within column 0
  })

  it('reds an adjacent enemy party with a point to spare, not a distant one', () => {
    // Every enemy party is also in `otherParties` (all parties block movement,
    // regardless of owner — matches `moveParty`'s own blocked set).
    const adjacent = { x: 1, y: 0 }
    const engageable = classifyPartyRangeOverlay(
      baseInput({ movementPoints: 1, enemies: [adjacent], otherParties: [adjacent] }),
    )
    expect(engageable.red).toContain('1,0')
    // An enemy party's own tile is blocked, so it's never also shaded green.
    expect(engageable.green).not.toContain('1,0')

    const distant = { x: 4, y: 0 }
    const notEngageable = classifyPartyRangeOverlay(
      baseInput({ movementPoints: 4, enemies: [distant] }),
    )
    expect(notEngageable.red).toEqual([])
  })

  it('reds an enemy city only when adjacent, regardless of movement points left over', () => {
    const port = { x: 1, y: 0 }
    const map = squareMap(12, { '1,0': 'port' })
    const noMovement = classifyPartyRangeOverlay(
      baseInput({ map, movementPoints: 0, enemyCities: [port] }),
    )
    expect(noMovement.red).toEqual([])
    const withMovement = classifyPartyRangeOverlay(
      baseInput({ map, movementPoints: 1, enemyCities: [port] }),
    )
    expect(withMovement.red).toContain('1,0')
  })

  it('yellows an adjacent encounter and leaves a distant one unshaded', () => {
    const near = { x: 1, y: 0 }
    const far = { x: 9, y: 0 }
    const { yellow } = classifyPartyRangeOverlay(
      baseInput({ movementPoints: 3, encounters: [near, far] }),
    )
    expect(yellow).toEqual(['1,0'])
  })

  it('yellows a capturable site reachable with a point left over for the capture itself', () => {
    const near = { x: 2, y: 0 } // reachable in 2 with 1 MP to spare at MP=3
    const far = { x: 3, y: 0 } // reachable in 3, but then no point left to capture
    const { yellow, green } = classifyPartyRangeOverlay(
      baseInput({ movementPoints: 3, capturableSites: [near, far] }),
    )
    expect(yellow).toEqual(['2,0'])
    // A merely-walkable-but-not-yet-capturable site still shades green, not red/unshaded.
    expect(green).toContain('3,0')
  })

  it('produces byte-identical output across runs (determinism)', () => {
    const a = classifyPartyRangeOverlay(baseInput({ movementPoints: 2 }))
    const b = classifyPartyRangeOverlay(baseInput({ movementPoints: 2 }))
    expect(a).toEqual(b)
  })
})
