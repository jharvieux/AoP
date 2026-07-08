import { describe, expect, it } from 'vitest'
import { hexDistance, type Captain, type GameMap } from '@aop/engine'
import type { Coord } from '@aop/shared'
import { findViewerCaptainAtCity } from './GameScreen'

/**
 * #385: `viewerCaptainAtCity` gates recruit/load-troops/unload-troops/
 * standing-order actions. It used to compare with `chebyshevDistance`, which
 * on hex maps treats some hex-distance-2 tiles as adjacent (the same bug
 * #370 fixed for the attack/encounter gates). `findViewerCaptainAtCity` is
 * the extracted pure predicate so this is unit-testable without rendering
 * the screen.
 */
describe('findViewerCaptainAtCity on a hex map (#385: mapDistance, not chebyshevDistance)', () => {
  const hexMap: GameMap = {
    width: 5,
    height: 5,
    tiles: Array.from({ length: 25 }, () => ({ type: 'shallows' as const, island: -1 })),
    startPositions: [],
    topology: 'hex',
  }

  function captainAt(position: Coord): Captain {
    return {
      id: 'cap-own',
      ownerId: 'seat-0',
      name: 'Anne',
      position,
      shipClassId: 'sloop',
      movementPoints: 2,
      maxMovementPoints: 3,
      troops: [{ unitId: 'swashbuckler', count: 6 }],
      xp: 0,
      skills: [],
      shipUpgrades: {},
      captured: false,
    }
  }

  // City sits at (2,2) — an even row. Its six true hex neighbors are
  // (3,2)/(2,1)/(1,1)/(1,2)/(1,3)/(2,3). (3,1) and (3,3) are Chebyshev-1 but
  // hex-distance-2: exactly the divergence #385 fixes.
  const cityPosition: Coord = { x: 2, y: 2 }

  it('does not treat a Chebyshev-adjacent, hex-distance-2 captain as docked', () => {
    for (const position of [
      { x: 3, y: 1 },
      { x: 3, y: 3 },
    ]) {
      expect(hexDistance({ col: 2, row: 2 }, { col: position.x, row: position.y })).toBe(2)
      expect(
        findViewerCaptainAtCity([captainAt(position)], hexMap, 'seat-0', cityPosition),
      ).toBeUndefined()
    }
  })

  it('treats every true hex neighbor as docked', () => {
    const neighbors: Coord[] = [
      { x: 3, y: 2 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 3 },
    ]
    for (const position of neighbors) {
      expect(hexDistance({ col: 2, row: 2 }, { col: position.x, row: position.y })).toBe(1)
      const found = findViewerCaptainAtCity([captainAt(position)], hexMap, 'seat-0', cityPosition)
      expect(found?.id).toBe('cap-own')
    }
  })
})
