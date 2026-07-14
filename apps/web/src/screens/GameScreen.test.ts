import { describe, expect, it } from 'vitest'
import { hexDistance, type Captain, type GameMap } from '@aop/engine'
import type { Coord } from '@aop/shared'
import {
  classifySelectedPartyTileTap,
  factionOfOwner,
  factionOfPlayer,
  findViewerCaptainAtCity,
} from './GameScreen'

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

/**
 * #476: a tap on the already-selected party's own tile used to hit the
 * own-party match in handleTileClick first and unconditionally re-select,
 * which made capturing the site underfoot (and resolving a co-located land
 * encounter) unreachable from any tap. `classifySelectedPartyTileTap` is the
 * extracted act-vs-reselect decision (the findViewerCaptainAtCity pattern
 * from #385) so that precedence stays unit-testable without rendering.
 */
describe('classifySelectedPartyTileTap (#476: act on own tile, not re-select)', () => {
  const viewerId = 'seat-0'
  const party = { position: { x: 3, y: 4 }, movementPoints: 2 }
  const siteHere = { id: 'site-1', position: { x: 3, y: 4 }, active: true }
  const encounterHere = { id: 'enc-1', position: { x: 3, y: 4 }, active: true }

  it('chooses captureSite for a capturable site underfoot', () => {
    expect(classifySelectedPartyTileTap(party, viewerId, [siteHere], [])).toEqual({
      action: 'captureSite',
      siteId: 'site-1',
    })
  })

  it('chooses resolveEncounter for an unresolved land encounter sharing the tile', () => {
    expect(classifySelectedPartyTileTap(party, viewerId, [], [encounterHere])).toEqual({
      action: 'resolveEncounter',
      encounterId: 'enc-1',
    })
  })

  it('re-selects on an empty own tile (the pre-existing behavior)', () => {
    expect(classifySelectedPartyTileTap(party, viewerId, [], [])).toEqual({ action: 'reselect' })
  })

  it('regression: a capturable site underfoot must never fall through to re-select', () => {
    // Before the fix, every tap on this tile behaved as 'reselect' — exactly
    // the unconditional own-party match this classifier now front-runs.
    const tap = classifySelectedPartyTileTap(party, viewerId, [siteHere], [encounterHere])
    expect(tap.action).not.toBe('reselect')
    // Site wins over a co-located encounter, preserving the tap handler's
    // long-standing site-before-encounter order.
    expect(tap).toEqual({ action: 'captureSite', siteId: 'site-1' })
  })

  it('re-selects when nothing underfoot is actionable: spent party, own claim, inactive, elsewhere', () => {
    const spent = { ...party, movementPoints: 0 }
    expect(classifySelectedPartyTileTap(spent, viewerId, [siteHere], [encounterHere])).toEqual({
      action: 'reselect',
    })
    expect(
      classifySelectedPartyTileTap(party, viewerId, [{ ...siteHere, claimedBy: viewerId }], []),
    ).toEqual({ action: 'reselect' })
    expect(
      classifySelectedPartyTileTap(
        party,
        viewerId,
        [{ ...siteHere, active: false }],
        [{ ...encounterHere, active: false }],
      ),
    ).toEqual({ action: 'reselect' })
    expect(
      classifySelectedPartyTileTap(
        party,
        viewerId,
        [{ ...siteHere, position: { x: 4, y: 4 } }],
        [{ ...encounterHere, position: { x: 4, y: 4 } }],
      ),
    ).toEqual({ action: 'reselect' })
  })

  it('a site claimed by an enemy is still capturable underfoot', () => {
    expect(
      classifySelectedPartyTileTap(party, viewerId, [{ ...siteHere, claimedBy: 'seat-1' }], []),
    ).toEqual({ action: 'captureSite', siteId: 'site-1' })
  })
})

/**
 * #AOP-CLIENT-1: `GameScreen`'s owner-id-to-faction lookup used to be a
 * single `game.players.find((p) => p.id === ownerId)!.faction` shared by
 * every caller. Inland settlements seed `ownerId: 'neutral'`
 * (packages/engine/src/game.ts:198), which never matches a player, so any
 * city-rendering path crashed with "Cannot read properties of undefined
 * (reading 'faction')". The fix splits the lookup by domain instead of
 * defensively `?.`-guarding every call site: `factionOfPlayer` stays strict
 * for captain/party owners (always real players), and `factionOfOwner`
 * layers the one legitimate neutral-sentinel case on top.
 */
describe('factionOfPlayer / factionOfOwner (#AOP-CLIENT-1: neutral-owned cities)', () => {
  const players = [
    { id: 'seat-0', faction: 'pirates' as const },
    { id: 'seat-1', faction: 'british' as const },
  ]

  it('factionOfPlayer resolves a real player id to its faction', () => {
    expect(factionOfPlayer(players, 'seat-0')).toBe('pirates')
    expect(factionOfPlayer(players, 'seat-1')).toBe('british')
  })

  it('factionOfPlayer throws for an unmatched id (fail loud, never neutral)', () => {
    expect(() => factionOfPlayer(players, 'neutral')).toThrow(/no player/i)
    expect(() => factionOfPlayer(players, 'nobody')).toThrow(/no player/i)
  })

  it('factionOfOwner resolves a real player id exactly like factionOfPlayer', () => {
    expect(factionOfOwner(players, 'seat-0')).toBe('pirates')
    expect(factionOfOwner(players, 'seat-1')).toBe('british')
  })

  it('factionOfOwner returns undefined for the neutral sentinel', () => {
    expect(factionOfOwner(players, 'neutral')).toBeUndefined()
  })

  it('factionOfOwner still throws for a genuinely unmatched, non-neutral id', () => {
    expect(() => factionOfOwner(players, 'nobody')).toThrow(/no player/i)
  })
})
