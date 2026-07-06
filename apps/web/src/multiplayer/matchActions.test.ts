import { describe, expect, it } from 'vitest'
import type { PlayerView, ViewCaptain, ViewCity } from '@aop/engine'
import {
  captainFromView,
  cityFromView,
  interpretTileClick,
  matchAction,
  ownCaptains,
} from './matchActions'
import { boardFromPlayerView } from './playerViewBoard'

/** A 4x4 all-water explored map; viewer seat-0 with one captain at (0,0). */
function view(over: Partial<PlayerView> = {}): PlayerView {
  const tiles: PlayerView['tiles'] = []
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      tiles.push({ coord: { x, y }, type: 'shallows', island: -1, visible: true })
    }
  }
  return {
    viewerId: 'seat-0',
    round: 1,
    currentPlayerIndex: 0,
    status: 'active',
    winnerId: null,
    rules: { setup: {} as PlayerView['rules']['setup'], mapSize: 'small' },
    mapWidth: 4,
    mapHeight: 4,
    tiles,
    players: [
      {
        id: 'seat-0',
        name: 'Anne',
        faction: 'pirates',
        isAI: false,
        eliminated: false,
        reputation: 0,
      },
      {
        id: 'seat-1',
        name: 'Bart',
        faction: 'british',
        isAI: false,
        eliminated: false,
        reputation: 0,
      },
    ],
    cities: [
      {
        id: 'city-own',
        ownerId: 'seat-0',
        name: 'Nassau',
        position: { x: 2, y: 2 },
        buildings: ['dock'],
        garrison: { swashbuckler: 2 },
        unitAvailability: { swashbuckler: 4 },
        builtThisRound: false,
      },
      // Enemy city: shell only — no interior fields, exactly as playerView emits it.
      { id: 'city-enemy', ownerId: 'seat-1', name: 'Kingston', position: { x: 3, y: 0 } },
    ],
    captains: [
      {
        id: 'cap-own',
        ownerId: 'seat-0',
        name: 'Anne',
        position: { x: 0, y: 0 },
        shipClassId: 'sloop',
        troops: [{ unitId: 'swashbuckler', count: 6 }],
        movementPoints: 2,
        maxMovementPoints: 3,
        xp: 10,
        skills: ['navigator'],
        shipUpgrades: { hull: 1 },
      },
      // Enemy hull in vision: identity only, no manifest.
      {
        id: 'cap-near',
        ownerId: 'seat-1',
        name: 'Bart',
        position: { x: 1, y: 1 },
        shipClassId: 'sloop',
      },
      {
        id: 'cap-far',
        ownerId: 'seat-1',
        name: 'Bart II',
        position: { x: 3, y: 3 },
        shipClassId: 'sloop',
      },
    ],
    encounters: [{ id: 'enc-0', kind: 'merchant', position: { x: 0, y: 1 }, active: true }],
    alliances: { allies: [], outgoingProposals: [], incomingProposals: [] },
    rngState: null,
    ...over,
  }
}

const mapOf = (v: PlayerView) => boardFromPlayerView(v).map

describe('interpretTileClick (#261: the PlayerView analog of GameScreen tile handling)', () => {
  it('selects an own captain wherever it is tapped, selection or not', () => {
    const v = view()
    expect(interpretTileClick(v, mapOf(v), null, 0, 0)).toEqual({
      kind: 'selectCaptain',
      captainId: 'cap-own',
    })
    expect(interpretTileClick(v, mapOf(v), 'cap-own', 0, 0)).toEqual({
      kind: 'selectCaptain',
      captainId: 'cap-own',
    })
  })

  it('opens an own city tapped with no captain selected', () => {
    const v = view()
    expect(interpretTileClick(v, mapOf(v), null, 2, 2)).toEqual({
      kind: 'openCity',
      cityId: 'city-own',
    })
  })

  it('never opens an enemy city (its interior is fog-hidden by design)', () => {
    const v = view()
    expect(interpretTileClick(v, mapOf(v), null, 3, 0)).toBeNull()
  })

  it('does nothing on an empty tile with no selection', () => {
    const v = view()
    expect(interpretTileClick(v, mapOf(v), null, 1, 0)).toBeNull()
  })

  it('lines up an attack on an adjacent enemy with movement left', () => {
    const v = view()
    expect(interpretTileClick(v, mapOf(v), 'cap-own', 1, 1)).toEqual({
      kind: 'attack',
      targetCaptainId: 'cap-near',
    })
  })

  it('does not line up an attack on a non-adjacent enemy', () => {
    const v = view()
    expect(interpretTileClick(v, mapOf(v), 'cap-own', 3, 3)).toBeNull()
  })

  it('does not attack with zero movement points', () => {
    const v = view()
    v.captains[0]!.movementPoints = 0
    expect(interpretTileClick(v, mapOf(v), 'cap-own', 1, 1)).toBeNull()
  })

  it('offers an adjacent active encounter', () => {
    const v = view()
    expect(interpretTileClick(v, mapOf(v), 'cap-own', 0, 1)).toEqual({
      kind: 'encounter',
      encounterId: 'enc-0',
    })
  })

  it('ignores an inactive encounter tile (falls through to a move)', () => {
    const v = view()
    v.encounters[0]!.active = false
    expect(interpretTileClick(v, mapOf(v), 'cap-own', 0, 1)).toEqual({
      kind: 'move',
      to: { x: 0, y: 1 },
    })
  })

  it('moves to an empty tile within remaining movement', () => {
    const v = view()
    expect(interpretTileClick(v, mapOf(v), 'cap-own', 2, 0)).toEqual({
      kind: 'move',
      to: { x: 2, y: 0 },
    })
  })

  it('refuses a move beyond remaining movement', () => {
    const v = view()
    // (3,2) is 3 diagonal-ish steps from (0,0); the captain has 2 points.
    expect(interpretTileClick(v, mapOf(v), 'cap-own', 3, 2)).toBeNull()
  })

  it('ignores a selection id that is not an own captain (stale/forged selection)', () => {
    const v = view()
    expect(interpretTileClick(v, mapOf(v), 'cap-near', 1, 0)).toBeNull()
  })
})

describe('captainFromView / cityFromView (own-detail widening)', () => {
  it('widens an own captain, defaulting only what a view never carries', () => {
    const own = view().captains[0]!
    expect(captainFromView(own)).toEqual({
      id: 'cap-own',
      ownerId: 'seat-0',
      name: 'Anne',
      position: { x: 0, y: 0 },
      shipClassId: 'sloop',
      movementPoints: 2,
      maxMovementPoints: 3,
      troops: [{ unitId: 'swashbuckler', count: 6 }],
      xp: 10,
      skills: ['navigator'],
      shipUpgrades: { hull: 1 },
      standingOrders: [],
      boardOrders: [],
    })
  })

  it('carries a disclosed own captain’s standing/board orders through (#285)', () => {
    const own: ViewCaptain = {
      ...view().captains[0]!,
      standingOrders: [{ when: 'always', tactic: 'evade' }],
      boardOrders: [{ when: 'always', doctrine: 'holdLine' }],
    }
    expect(captainFromView(own)).toMatchObject({
      standingOrders: [{ when: 'always', tactic: 'evade' }],
      boardOrders: [{ when: 'always', doctrine: 'holdLine' }],
    })
  })

  it('refuses to dress an enemy hull up as a full Captain', () => {
    const enemy: ViewCaptain = view().captains[1]!
    expect(captainFromView(enemy)).toBeNull()
  })

  it('widens an own city and refuses an enemy shell', () => {
    const [own, enemy] = view().cities as [ViewCity, ViewCity]
    expect(cityFromView(own)?.garrison).toEqual({ swashbuckler: 2 })
    expect(cityFromView(enemy)).toBeNull()
  })

  it('ownCaptains returns only the viewer seat rows', () => {
    expect(ownCaptains(view()).map((c) => c.id)).toEqual(['cap-own'])
  })
})

describe('matchAction builders (playerId always the viewer seat)', () => {
  const v = view()

  it('stamps the viewer id on every action', () => {
    expect(matchAction.endTurn(v)).toEqual({ type: 'endTurn', playerId: 'seat-0' })
    expect(matchAction.move(v, 'cap-own', { x: 1, y: 0 })).toEqual({
      type: 'moveCaptain',
      playerId: 'seat-0',
      captainId: 'cap-own',
      to: { x: 1, y: 0 },
    })
    expect(matchAction.proposeAlliance(v, 'seat-1')).toEqual({
      type: 'proposeAlliance',
      playerId: 'seat-0',
      targetId: 'seat-1',
    })
  })

  it('recruits and transfers one unit at a time (matching GameScreen)', () => {
    expect(matchAction.recruit(v, 'city-own', 'swashbuckler')).toMatchObject({ count: 1 })
    expect(
      matchAction.transferTroops(v, 'city-own', 'cap-own', 'toShip', 'swashbuckler'),
    ).toMatchObject({ direction: 'toShip', count: 1 })
  })

  it('attaches attackerOrders/boardCommands to attackCaptain only when given (#285)', () => {
    expect(matchAction.attack(v, 'cap-own', 'cap-near')).toEqual({
      type: 'attackCaptain',
      playerId: 'seat-0',
      captainId: 'cap-own',
      targetCaptainId: 'cap-near',
    })
    expect(
      matchAction.attack(v, 'cap-own', 'cap-near', ['board'], [{ stackId: 0, targetId: 1 }]),
    ).toEqual({
      type: 'attackCaptain',
      playerId: 'seat-0',
      captainId: 'cap-own',
      targetCaptainId: 'cap-near',
      attackerOrders: ['board'],
      boardCommands: [{ stackId: 0, targetId: 1 }],
    })
  })

  it('attaches boardOrders to setStandingOrders only when given', () => {
    expect(matchAction.setStandingOrders(v, 'cap-own', [])).not.toHaveProperty('boardOrders')
    expect(
      matchAction.setStandingOrders(v, 'cap-own', [], [{ when: 'always', doctrine: 'holdLine' }]),
    ).toMatchObject({ boardOrders: [{ when: 'always', doctrine: 'holdLine' }] })
  })
})
