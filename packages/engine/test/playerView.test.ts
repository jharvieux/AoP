import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createGame,
  playerView,
  tileKey,
  type ContentCatalog,
  type GameConfig,
  type GameState,
} from '../src'
import { COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

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

/** Two players (seat identities, per MULTIPLAYER.md §13) with content + combat wired in. */
function matchConfig(): GameConfig {
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
    players: [
      { id: 'seat-0', name: 'Alice', faction: 'pirates', isAI: false },
      { id: 'seat-1', name: 'Bob', faction: 'british', isAI: false },
    ],
  }
}

function enemyCaptain(state: GameState): GameState['captains'][number] {
  return state.captains.find((c) => c.ownerId === 'seat-1')!
}

function ownCaptain(state: GameState): GameState['captains'][number] {
  return state.captains.find((c) => c.ownerId === 'seat-0')!
}

describe('playerView — anti-cheat boundary (MULTIPLAYER.md §7)', () => {
  it('never carries rngState or the match seed (RNG-prediction guard)', () => {
    const state = createGame(matchConfig())
    const view = playerView(state, 'seat-0')
    expect(view.rngState).toBeNull()
    // The seed is the origin of rngState; the `seed` key must not appear in the view,
    // nor a nested `config` that would carry it.
    expect(JSON.stringify(view)).not.toContain('"seed"')
    expect((view as unknown as { config?: unknown }).config).toBeUndefined()
  })

  it('shows the viewer their own treasury but never an opponent’s', () => {
    const view = playerView(createGame(matchConfig()), 'seat-0')
    const me = view.players.find((p) => p.id === 'seat-0')!
    const them = view.players.find((p) => p.id === 'seat-1')!
    expect(me.resources).toBeDefined()
    expect(me.resources!.gold).toBe(GAME_SETUP.startingGold)
    expect(them.resources).toBeUndefined()
    // Identity is public (known from the lobby), the treasury is not.
    expect(them.name).toBe('Bob')
    expect(them.faction).toBe('british')
  })

  it('exposes own city interiors but strips enemy interiors even once explored', () => {
    const state = createGame(matchConfig())
    const enemyCity = state.cities.find((c) => c.ownerId === 'seat-1')!
    // Force the enemy city's tile into seat-0's explored history.
    const explored: GameState = {
      ...state,
      exploredTiles: {
        ...state.exploredTiles,
        'seat-0': [...(state.exploredTiles['seat-0'] ?? []), tileKey(enemyCity.position)],
      },
    }
    const view = playerView(explored, 'seat-0')

    const mine = view.cities.find((c) => c.ownerId === 'seat-0')!
    expect(mine.buildings).toEqual(['townhall', 'barracks'])
    expect(mine.garrison).toBeDefined()

    const theirs = view.cities.find((c) => c.ownerId === 'seat-1')!
    expect(theirs.position).toEqual(enemyCity.position)
    expect(theirs.buildings).toBeUndefined()
    expect(theirs.garrison).toBeUndefined()
    expect(theirs.unitAvailability).toBeUndefined()
  })

  it('omits an enemy city whose tile the viewer has never explored', () => {
    const view = playerView(createGame(matchConfig()), 'seat-0')
    // seat-1's capital sits on its own home island, far outside seat-0's opening vision.
    expect(view.cities.some((c) => c.ownerId === 'seat-1')).toBe(false)
  })

  it('omits enemy captains outside current vision', () => {
    const view = playerView(createGame(matchConfig()), 'seat-0')
    expect(view.captains.some((c) => c.ownerId === 'seat-1')).toBe(false)
  })

  it('reveals an enemy captain in vision as a bare hull — no manifest, orders, or upgrades', () => {
    const state = createGame(matchConfig())
    const mine = ownCaptain(state)
    // Co-locate the enemy captain with ours so it falls inside current vision,
    // and give it standing orders + upgrades that must not leak.
    const withEnemyInView: GameState = {
      ...state,
      captains: state.captains.map((c) =>
        c.ownerId === 'seat-1'
          ? {
              ...c,
              position: { ...mine.position },
              standingOrders: [{ when: 'always', tactic: 'broadside' }],
              troops: [{ unitId: 'deckhand', count: 3 }],
              shipUpgrades: { hull: 2 },
              xp: 500,
            }
          : c,
      ),
    }
    const view = playerView(withEnemyInView, 'seat-0')
    const seen = view.captains.find((c) => c.ownerId === 'seat-1')
    expect(seen).toBeDefined()
    expect(seen!.shipClassId).toBe('sloop')
    expect(seen!.troops).toBeUndefined()
    expect(seen!.movementPoints).toBeUndefined()
    expect(seen!.shipUpgrades).toBeUndefined()
    expect(seen!.xp).toBeUndefined()
    // Standing orders are the interactive-attack secret — must never appear anywhere.
    expect(JSON.stringify(view)).not.toContain('standingOrders')
    expect(JSON.stringify(view)).not.toContain('broadside')
  })

  it('discloses captured status for an enemy captain in vision, unlike the rest of its manifest (#309)', () => {
    const state = createGame(matchConfig())
    const mine = ownCaptain(state)
    const withCapturedEnemyInView: GameState = {
      ...state,
      captains: state.captains.map((c) =>
        c.ownerId === 'seat-1'
          ? {
              ...c,
              position: { ...mine.position },
              captured: true,
              capturedBy: 'seat-0',
              captivityReturnRound: state.round + 5,
              troops: [],
            }
          : c,
      ),
    }
    const view = playerView(withCapturedEnemyInView, 'seat-0')
    const seen = view.captains.find((c) => c.ownerId === 'seat-1')!
    expect(seen.captured).toBe(true)
    expect(seen.capturedBy).toBe('seat-0')
    expect(seen.captivityReturnRound).toBe(state.round + 5)
    // Still no troops/orders/XP — captured status is the one disclosure exception.
    expect(seen.troops).toBeUndefined()
  })

  it('exposes the viewer’s own captain in full', () => {
    const view = playerView(createGame(matchConfig()), 'seat-0')
    const mine = view.captains.find((c) => c.ownerId === 'seat-0')!
    expect(mine.movementPoints).toBe(GAME_SETUP.startingCaptainMovement)
    expect(mine.troops).toBeDefined()
    expect(mine.shipUpgrades).toBeDefined()
  })

  it('reveals a winner’s prize ship to the loser as a bare hull, not a manifest (#374)', () => {
    // A decisive battle seat-0 wins: seat-1 is captured and its hull becomes
    // seat-0's prize, spawned on the captured captain's tile. A captive lights
    // nothing for its owner (#522), so the duel is staged on seat-1's doorstep,
    // where its capital's vision covers the prize tile. The prize must read as
    // a plain enemy hull from seat-1's seat, never its own manifest.
    const config: GameConfig = {
      ...matchConfig(),
      players: matchConfig().players.map((p) => ({
        ...p,
        startingTroops:
          p.id === 'seat-0'
            ? [{ unitId: 'deckhand', count: 8 }]
            : [{ unitId: 'deckhand', count: 1 }],
      })),
    }
    const base = createGame(config)
    const attacker = ownCaptain(base)
    const defender = enemyCaptain(base)
    const dx = defender.position.x > 0 ? -1 : 1
    const stageTile = { x: defender.position.x + dx, y: defender.position.y }
    const adjacent: GameState = {
      ...base,
      captains: base.captains.map((c) =>
        c.id === attacker.id ? { ...c, position: stageTile } : c,
      ),
    }
    const next = applyAction(adjacent, {
      type: 'attackCaptain',
      playerId: 'seat-0',
      captainId: attacker.id,
      targetCaptainId: defender.id,
    })
    const prize = next.captains.find((c) => c.id.startsWith('prize-'))!
    expect(prize.ownerId).toBe('seat-0')

    // Winner sees its own prize in full; loser sees only a bare hull.
    const winnerView = playerView(next, 'seat-0')
    expect(winnerView.captains.find((c) => c.id === prize.id)!.troops).toBeDefined()

    const loserView = playerView(next, 'seat-1')
    const seenPrize = loserView.captains.find((c) => c.id === prize.id)!
    expect(seenPrize).toBeDefined()
    expect(seenPrize.ownerId).toBe('seat-0')
    expect(seenPrize.troops).toBeUndefined()
    expect(seenPrize.shipUpgrades).toBeUndefined()
    expect(seenPrize.xp).toBeUndefined()
  })

  it('discloses the viewer’s own captain standing/board orders (#285)', () => {
    const state = createGame(matchConfig())
    const mine = ownCaptain(state)
    const withOrders: GameState = {
      ...state,
      captains: state.captains.map((c) =>
        c.id === mine.id
          ? {
              ...c,
              standingOrders: [{ when: 'always', tactic: 'broadside' }],
              boardOrders: [{ when: 'outnumbered', doctrine: 'holdLine' }],
            }
          : c,
      ),
    }
    const view = playerView(withOrders, 'seat-0')
    const seen = view.captains.find((c) => c.id === mine.id)!
    expect(seen.standingOrders).toEqual([{ when: 'always', tactic: 'broadside' }])
    expect(seen.boardOrders).toEqual([{ when: 'outnumbered', doctrine: 'holdLine' }])
  })

  it('discloses the viewer’s own sail order but never an enemy’s (#372)', () => {
    const state = createGame(matchConfig())
    const mine = ownCaptain(state)
    const order = {
      destination: { x: 9, y: 9 },
      knownContactIds: [],
      interrupted: true,
    }
    const withSailOrders: GameState = {
      ...state,
      captains: state.captains.map((c) =>
        c.id === mine.id
          ? { ...c, sailOrder: order }
          : c.ownerId === 'seat-1'
            ? // Enemy captain co-located into vision, also carrying a sail order.
              { ...c, position: { ...mine.position }, sailOrder: { ...order, interrupted: false } }
            : c,
      ),
    }
    const view = playerView(withSailOrders, 'seat-0')
    expect(view.captains.find((c) => c.id === mine.id)!.sailOrder).toEqual(order)
    const enemy = view.captains.find((c) => c.ownerId === 'seat-1')!
    expect(enemy.sailOrder).toBeUndefined()
    // The enemy's queued course must not leak anywhere in the serialized view.
    expect(JSON.stringify(view.captains.filter((c) => c.ownerId === 'seat-1'))).not.toContain(
      'sailOrder',
    )
  })

  it('emits only explored tiles, flagging which are currently visible', () => {
    const state = createGame(matchConfig())
    const view = playerView(state, 'seat-0')
    expect(view.tiles.length).toBeGreaterThan(0)
    expect(view.tiles.length).toBeLessThan(state.map.width * state.map.height)
    expect(view.tiles.some((t) => t.visible)).toBe(true)
    // Every visible tile the selector reports must actually be explored (superset invariant).
    const exploredKeys = new Set(view.tiles.map((t) => tileKey(t.coord)))
    for (const t of view.tiles) if (t.visible) expect(exploredKeys.has(tileKey(t.coord))).toBe(true)
  })

  it('a captured own captain lights no tiles in the fog view (#522)', () => {
    const state = createGame(matchConfig())
    const mine = ownCaptain(state)
    // The enemy spawn is reliably outside seat-0's vision and exploration
    // (the encounter test below leans on the same fact).
    const farSpot = { ...enemyCaptain(state).position }
    const relocate = (captured: boolean): GameState => ({
      ...state,
      captains: state.captains.map((c) =>
        c.id === mine.id
          ? {
              ...c,
              position: farSpot,
              captured,
              ...(captured
                ? {
                    capturedBy: 'seat-1',
                    troops: [],
                    movementPoints: 0,
                    captivityReturnRound: state.round + 3,
                  }
                : undefined),
            }
          : c,
      ),
    })
    // Guard: a free captain standing there DOES light the tile into the view.
    const litView = playerView(relocate(false), 'seat-0')
    expect(litView.tiles.some((t) => t.visible && tileKey(t.coord) === tileKey(farSpot))).toBe(true)
    // Captured on the same spot: no live vision, and the never-explored site
    // stays fully fogged — absent from the emitted tiles entirely.
    const foggedView = playerView(relocate(true), 'seat-0')
    expect(foggedView.tiles.some((t) => tileKey(t.coord) === tileKey(farSpot))).toBe(false)
  })

  it('shows an encounter only while it sits in current vision', () => {
    const state = createGame(matchConfig())
    const mine = ownCaptain(state)
    const withEncounter: GameState = {
      ...state,
      encounters: [
        {
          id: 'enc-far',
          kind: 'merchant',
          position: enemyCaptain(state).position,
          active: true,
          respawnRound: null,
        },
        {
          id: 'enc-near',
          kind: 'merchant',
          position: { ...mine.position },
          active: true,
          respawnRound: null,
        },
      ],
    }
    const view = playerView(withEncounter, 'seat-0')
    expect(view.encounters.map((e) => e.id)).toEqual(['enc-near'])
  })

  it('is a pure function — filtering does not mutate the source state', () => {
    const state = createGame(matchConfig())
    const before = JSON.stringify(state)
    playerView(state, 'seat-0')
    expect(JSON.stringify(state)).toBe(before)
  })

  it('reconstruction + filtering round-trips: view reflects moves the engine applied', () => {
    let state = createGame(matchConfig())
    const mine = ownCaptain(state)
    // A tile one step from our start; movement of 1 is always affordable on water.
    const before = playerView(state, 'seat-0')
    const startTile = before.captains.find((c) => c.id === mine.id)!.position
    state = applyAction(state, { type: 'endTurn', playerId: 'seat-0' })
    // After seat-0 ends turn it is seat-1's move; the view still renders for seat-0.
    const after = playerView(state, 'seat-0')
    expect(after.currentPlayerIndex).toBe(1)
    expect(after.captains.find((c) => c.id === mine.id)!.position).toEqual(startTile)
  })

  it('carries the map topology so a hex match reconstructs as hex, not square (#379)', () => {
    const base = createGame(matchConfig())
    const hexState: GameState = { ...base, map: { ...base.map, topology: 'hex' } }
    expect(playerView(hexState, 'seat-0').topology).toBe('hex')
  })

  it('omits topology for a square map, so old snapshots default to square (#379)', () => {
    // The default generated map is square (no topology field); the view must not
    // invent one, so `boardFromPlayerView`'s absent → square default holds.
    const view = playerView(createGame(matchConfig()), 'seat-0')
    expect(view.topology).toBeUndefined()
  })
})
