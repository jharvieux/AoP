import { describe, expect, it } from 'vitest'
import {
  applyAction,
  canonicalPair,
  createGame,
  playerView,
  tileKey,
  type AllianceState,
  type ContentCatalog,
  type GameConfig,
  type GameState,
} from '../src'
import { COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

/**
 * Leak-audit suite for shared vision (#137) — the anti-cheat boundary for the
 * whole alliance feature (docs/MULTIPLAYER.md §7). Allied seats share tiles and
 * unit positions ONLY; treasuries, city interiors, captain manifests/orders/XP,
 * and rngState must stay stripped, and live vision must drop the instant an
 * alliance ends.
 */

const CATALOG: ContentCatalog = {
  buildings: {
    townhall: { produces: { gold: 100 }, cost: {} },
    barracks: { produces: {}, cost: { gold: 150 }, requires: 'townhall', unlocksTier: 1 },
  },
  units: {
    deckhand: {
      factionId: 'pirates',
      tier: 1,
      goldCost: 25,
      weeklyGrowth: 8,
      attack: 2,
      defense: 1,
      health: 6,
    },
  },
  ships: { sloop: { hull: 40, cannons: 6, speed: 5, crewCapacity: 4, upgrades: {} } },
  skills: {},
  captainXpThresholds: [0, 150, 400],
}

function matchConfig(playerCount = 2): GameConfig {
  const factions = ['pirates', 'british', 'spanish'] as const
  return {
    seed: 7,
    mapSize: 'small',
    setup: { ...GAME_SETUP, startingBuildings: ['townhall', 'barracks'] },
    combatStats: {
      units: [{ id: 'deckhand', attack: 2, defense: 1, health: 6 }],
      ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }],
      combat: COMBAT_TUNING,
      tactics: TACTICS_TUNING,
    },
    content: CATALOG,
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `seat-${i}`,
      name: `Seat ${i}`,
      faction: factions[i % factions.length]!,
      isAI: false,
    })),
  }
}

/** Force an alliance graph onto a fresh state (playerView is a pure function of it). */
function withAlliances(state: GameState, alliances: AllianceState): GameState {
  return { ...state, alliances }
}

function allied(state: GameState, a: string, b: string): GameState {
  return withAlliances(state, { pairs: [canonicalPair(a, b)], proposals: [] })
}

function capOf(state: GameState, ownerId: string) {
  return state.captains.find((c) => c.ownerId === ownerId)!
}

describe('shared vision union (#137)', () => {
  it('unions an ally’s current vision into the viewer’s tiles', () => {
    const state = createGame(matchConfig())
    const solo = playerView(state, 'seat-0')
    const view = playerView(allied(state, 'seat-0', 'seat-1'), 'seat-0')
    // The ally sits on a distant home island, so its sightlines are new tiles.
    expect(view.tiles.length).toBeGreaterThan(solo.tiles.length)
    const allyCap = capOf(state, 'seat-1')
    const shared = view.tiles.find((t) => tileKey(t.coord) === tileKey(allyCap.position))
    expect(shared).toBeDefined()
    expect(shared!.visible).toBe(true)
  })

  it('reveals an enemy sitting in an ally’s vision (but outside the viewer’s own)', () => {
    // seat-2 is an enemy; place it on seat-1's captain tile so only the ally sees it.
    const base = createGame(matchConfig(3))
    const allyCap = capOf(base, 'seat-1')
    const state: GameState = {
      ...base,
      captains: base.captains.map((c) =>
        c.ownerId === 'seat-2' ? { ...c, position: { ...allyCap.position } } : c,
      ),
    }
    const solo = playerView(state, 'seat-0')
    expect(solo.captains.some((c) => c.ownerId === 'seat-2')).toBe(false)
    const view = playerView(allied(state, 'seat-0', 'seat-1'), 'seat-0')
    const seen = view.captains.find((c) => c.ownerId === 'seat-2')
    expect(seen).toBeDefined()
    // Bare hull only — an enemy seen through an ally leaks no more than one seen directly.
    expect(seen!.troops).toBeUndefined()
    expect(seen!.xp).toBeUndefined()
  })
})

describe('shared vision leak boundary (#137) — allies share eyes, never books', () => {
  it('reveals an ally captain as a bare hull: no manifest, orders, XP, or upgrades', () => {
    const base = createGame(matchConfig())
    const state: GameState = {
      ...base,
      captains: base.captains.map((c) =>
        c.ownerId === 'seat-1'
          ? {
              ...c,
              troops: [{ unitId: 'deckhand', count: 5 }],
              standingOrders: [{ when: 'always', tactic: 'broadside' }],
              shipUpgrades: { hull: 3 },
              xp: 999,
            }
          : c,
      ),
    }
    const view = playerView(allied(state, 'seat-0', 'seat-1'), 'seat-0')
    const ally = view.captains.find((c) => c.ownerId === 'seat-1')!
    expect(ally.shipClassId).toBe('sloop')
    expect(ally.troops).toBeUndefined()
    expect(ally.movementPoints).toBeUndefined()
    expect(ally.xp).toBeUndefined()
    expect(ally.shipUpgrades).toBeUndefined()
    expect(JSON.stringify(view)).not.toContain('standingOrders')
    expect(JSON.stringify(view)).not.toContain('broadside')
  })

  it('never discloses an ally’s treasury', () => {
    const state = createGame(matchConfig())
    const view = playerView(allied(state, 'seat-0', 'seat-1'), 'seat-0')
    const ally = view.players.find((p) => p.id === 'seat-1')!
    expect(ally.resources).toBeUndefined()
  })

  it('reveals an ally city as exterior only — interiors stay stripped', () => {
    const state = createGame(matchConfig())
    const view = playerView(allied(state, 'seat-0', 'seat-1'), 'seat-0')
    const allyCity = view.cities.find((c) => c.ownerId === 'seat-1')
    expect(allyCity).toBeDefined()
    expect(allyCity!.buildings).toBeUndefined()
    expect(allyCity!.garrison).toBeUndefined()
    expect(allyCity!.unitAvailability).toBeUndefined()
  })

  it('still carries no rngState through the unioned view', () => {
    const state = createGame(matchConfig())
    const view = playerView(allied(state, 'seat-0', 'seat-1'), 'seat-0')
    expect(view.rngState).toBeNull()
    expect(JSON.stringify(view)).not.toContain('"seed"')
  })

  it('does not leak a third-party alliance between two other seats', () => {
    const state = createGame(matchConfig(3))
    // seat-1 and seat-2 ally; the viewer (seat-0) is party to neither.
    const graph = withAlliances(state, {
      pairs: [canonicalPair('seat-1', 'seat-2')],
      proposals: [],
    })
    const solo = playerView(state, 'seat-0')
    const view = playerView(graph, 'seat-0')
    // The viewer gains no vision and learns nothing of the other pair.
    expect(view.alliances.allies).toEqual([])
    expect(view.tiles.length).toBe(solo.tiles.length)
  })
})

describe('shared vision revocation on break (#137)', () => {
  it('drops live vision through an ex-ally instantly, keeping the viewer’s own memory', () => {
    const state = createGame(matchConfig())
    const solo = playerView(state, 'seat-0')
    const alliedView = playerView(allied(state, 'seat-0', 'seat-1'), 'seat-0')
    expect(alliedView.tiles.length).toBeGreaterThan(solo.tiles.length)

    // Break the alliance (empty graph) and re-view the same underlying state.
    const broken = withAlliances(state, { pairs: [], proposals: [] })
    const brokenView = playerView(broken, 'seat-0')
    // Ally-only tiles and units are gone; the viewer's own sightlines are unchanged.
    expect(brokenView.tiles.length).toBe(solo.tiles.length)
    const allyCap = capOf(state, 'seat-1')
    expect(brokenView.tiles.some((t) => tileKey(t.coord) === tileKey(allyCap.position))).toBe(false)
    expect(brokenView.captains.some((c) => c.ownerId === 'seat-1')).toBe(false)
  })

  it('never persists ally-only tiles into the viewer’s explored memory', () => {
    // While allied, seat-0 acts; the reducer must fold in only its OWN vision, so
    // ally-only tiles are never "remembered" and vanish cleanly on a later break.
    const state = allied(createGame(matchConfig()), 'seat-0', 'seat-1')
    const allyCap = capOf(state, 'seat-1')
    const next = applyAction(state, { type: 'endTurn', playerId: 'seat-0' })
    expect(next.exploredTiles['seat-0']).not.toContain(tileKey(allyCap.position))
  })
})

describe('shared vision — viewer-scoped alliance info (#136/#137)', () => {
  it('surfaces the viewer’s own allies and proposals only', () => {
    const state = createGame(matchConfig(3))
    const graph = withAlliances(state, {
      pairs: [canonicalPair('seat-0', 'seat-1')],
      proposals: [
        { from: 'seat-0', to: 'seat-2' },
        { from: 'seat-2', to: 'seat-0' },
      ],
    })
    const view = playerView(graph, 'seat-0')
    expect(view.alliances.allies).toEqual(['seat-1'])
    expect(view.alliances.outgoingProposals).toEqual(['seat-2'])
    expect(view.alliances.incomingProposals).toEqual(['seat-2'])
  })
})
