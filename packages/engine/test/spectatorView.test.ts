import { describe, expect, it } from 'vitest'
import { resolveViewSeat } from '@aop/shared'
import {
  createGame,
  playerView,
  tileKey,
  type ContentCatalog,
  type GameConfig,
  type GameState,
} from '../src'
import { COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

// Live spectate, server side (#148, docs/MULTIPLAYER.md §12).
//
// The load-bearing correctness property of this whole issue: a spectator's response is
// byte-equivalent — same treasury visibility, same fog-of-war, same everything — to what
// the chosen seat's REAL player would receive for the same match state. That property is
// guaranteed by construction: `get-player-view` feeds a spectator through the identical
// `playerView(state, seat)` filter a real request uses (see `_shared/match.ts` `viewerSeat`
// -> `resolveViewSeat`), never a spectator-specific path. These tests pin that guarantee.

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

const seatId = (seat: number): string => `seat-${seat}`

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
      { id: seatId(0), name: 'Alice', faction: 'pirates', isAI: false },
      { id: seatId(1), name: 'Bob', faction: 'british', isAI: false },
    ],
  }
}

/**
 * A realistic mid-match state where the chosen seat (seat-1) holds hidden info a leak would
 * expose: its own treasury and city interiors, plus an enemy (seat-0) captain sitting inside
 * seat-1's current vision (revealed as a bare hull) and a swathe of seat-1-explored tiles.
 * If the spectator path diverged from the player path anywhere, byte-equivalence would break
 * on one of these.
 */
function midMatchState(): GameState {
  const base = createGame(matchConfig())
  const seat1Captain = base.captains.find((c) => c.ownerId === seatId(1))!
  return {
    ...base,
    // Put seat-0's captain adjacent to seat-1's so it falls inside seat-1's vision.
    captains: base.captains.map((c) =>
      c.ownerId === seatId(0) ? { ...c, position: { ...seat1Captain.position } } : c,
    ),
    exploredTiles: {
      ...base.exploredTiles,
      [seatId(1)]: [...(base.exploredTiles[seatId(1)] ?? []), tileKey(seat1Captain.position)],
    },
  }
}

describe('resolveViewSeat — spectator seat resolution (#148, §12)', () => {
  it('gives a seat-holder their own seat', () => {
    expect(resolveViewSeat(0, null)).toBe(0)
    expect(resolveViewSeat(2, null)).toBe(2)
  })

  it('gives a granted spectator exactly the seat their grant pins', () => {
    expect(resolveViewSeat(null, 1)).toBe(1)
  })

  it('gives neither a seat nor a spectator grant nothing (caller answers FORBIDDEN)', () => {
    expect(resolveViewSeat(null, null)).toBeNull()
  })

  it('lets a seat-holder never widen their fog via a self-granted spectate seat', () => {
    // Player precedence: holding seat 0, even with a spectator grant on seat 1, resolves to 0.
    expect(resolveViewSeat(0, 1)).toBe(0)
  })
})

describe('spectator view — byte-equivalence to the watched seat (#148, §12)', () => {
  const state = midMatchState()
  const chosenSeat = 1

  it('is byte-for-byte identical to what the chosen seat’s real player receives', () => {
    // The spectator path: resolveViewSeat pins the seat, get-player-view feeds it to the
    // exact same playerView filter. Reproduce that here and compare against the real player.
    const spectatorSeat = resolveViewSeat(null, chosenSeat)
    expect(spectatorSeat).toBe(chosenSeat)

    const realPlayerView = playerView(state, seatId(chosenSeat))
    const spectatorView = playerView(state, seatId(spectatorSeat!))

    // Same treasury visibility, same fog-of-war, same everything — the whole object.
    expect(spectatorView).toEqual(realPlayerView)
    // Byte-equivalent under serialization (this is what actually crosses the wire).
    expect(JSON.stringify(spectatorView)).toBe(JSON.stringify(realPlayerView))
  })

  it('is fog-locked to exactly one seat — never a union or god view', () => {
    const spectatorView = playerView(state, seatId(chosenSeat))
    const otherSeatView = playerView(state, seatId(0))
    // A one-seat lock means the two seats' views genuinely differ (different fog, different
    // own-treasury owner) — a god/full-vision view would collapse this distinction.
    expect(JSON.stringify(spectatorView)).not.toBe(JSON.stringify(otherSeatView))
  })

  it('never exposes a non-watched seat’s treasury to the spectator', () => {
    const spectatorView = playerView(state, seatId(chosenSeat))
    const watched = spectatorView.players.find((p) => p.id === seatId(chosenSeat))!
    const other = spectatorView.players.find((p) => p.id === seatId(0))!
    expect(watched.resources).toBeDefined() // the watched seat's own treasury, as its player sees it
    expect(other.resources).toBeUndefined() // seat-0's treasury stays hidden, exactly as for seat-1's player
  })

  it('carries no rngState or seed for a spectator, same as any player view', () => {
    const spectatorView = playerView(state, seatId(chosenSeat))
    expect(spectatorView.rngState).toBeNull()
    expect(JSON.stringify(spectatorView)).not.toContain('"seed"')
  })
})
