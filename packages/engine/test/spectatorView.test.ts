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
// the watched seat's REAL player would receive for the same match state.
//
// To prove that non-vacuously we model the actual production resolution and drive two
// genuinely DISTINCT caller identities through it: a real seat-holder (a `match_players`
// row) and a *different* user who holds only a spectator grant (a `match_spectators` row).
// Each identity is resolved by the same pure `resolveViewSeat` (`@aop/shared`) that
// `get-player-view` uses, and each resolved seat is fed into the same `playerView` filter —
// then we assert byte-identity between the spectator's view and the seat-holder's. A leak or
// a spectator-specific branch would break it. (The pre-rewrite test resolved a single literal
// seat and compared `playerView` against itself with identical arguments, so it could never
// fail; see the #148 follow-up.)
//
// What still needs a live Supabase stack: the two DB reads inside `viewerSeat`
// (`supabase/functions/_shared/match.ts`) that turn an `auth.uid()` into its seat / grant
// rows. That wrapper also can't be imported here (it uses Deno `.ts` module specifiers), so
// we mirror its composition below — the same approach `snapshotResume`/`snapshotCompaction`
// take with `reconstructState`: two per-user lookups over constructed rows, then the real
// `resolveViewSeat`. An end-to-end integration test against a running stack (real Postgres
// rows + RLS) would close the remaining gap around the reads themselves.

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

// In-memory stand-ins for the two rows `viewerSeat` reads per caller
// (`supabase/functions/_shared/match.ts`): a seat in `match_players` and/or a pinned
// `viewing_seat` in `match_spectators`, both keyed by the caller's `auth.uid()`.
interface MatchPlayerRow {
  userId: string
  seat: number
}
interface MatchSpectatorRow {
  userId: string
  viewingSeat: number
}

/**
 * Mirrors `viewerSeat` (`supabase/functions/_shared/match.ts`): look up the caller's seat and
 * spectator grant, then defer the actual decision to the real `resolveViewSeat`. Returns
 * `null` exactly where `viewerSeat` throws FORBIDDEN. Only the two DB reads are stubbed here;
 * the resolution under test is production's own pure function, driven by distinct identities.
 */
function resolveViewerSeat(
  userId: string,
  players: readonly MatchPlayerRow[],
  spectators: readonly MatchSpectatorRow[],
): number | null {
  const player = players.find((p) => p.userId === userId) ?? null
  const spectator = spectators.find((s) => s.userId === userId) ?? null
  return resolveViewSeat(player?.seat ?? null, spectator?.viewingSeat ?? null)
}

describe('spectator view — byte-equivalence to the watched seat (#148, §12)', () => {
  const state = midMatchState()

  // Four distinct caller identities, exactly as the two match tables would hold them.
  const HOLDER = 'uid-seat1-holder' // holds seat 1 in match_players
  const SPECTATOR = 'uid-spectator' // ONLY a spectator grant, pinned to seat 1
  const WATCHER0 = 'uid-watcher0' // a spectator grant pinned to seat 0
  const DUAL = 'uid-dual' // holds seat 0 AND self-granted a spectate on seat 1
  const STRANGER = 'uid-stranger' // in neither table

  const players: MatchPlayerRow[] = [
    { userId: HOLDER, seat: 1 },
    { userId: DUAL, seat: 0 },
  ]
  const spectators: MatchSpectatorRow[] = [
    { userId: SPECTATOR, viewingSeat: 1 },
    { userId: WATCHER0, viewingSeat: 0 },
    { userId: DUAL, viewingSeat: 1 },
  ]

  // The production response for a caller: numeric seat -> `seatPlayerId` -> `playerView`,
  // exactly as `get-player-view` builds it. Throws where `viewerSeat` would answer FORBIDDEN.
  const viewFor = (userId: string): ReturnType<typeof playerView> => {
    const seat = resolveViewerSeat(userId, players, spectators)
    if (seat === null) throw new Error(`expected ${userId} to resolve to a seat`)
    return playerView(state, seatId(seat))
  }

  it('gives a spectator byte-for-byte what the watched seat’s real player receives', () => {
    // HOLDER (a match_players row) and SPECTATOR (a match_spectators row) are different users
    // whose seats are resolved independently through the real resolveViewSeat — this is not a
    // tautology: nothing forces the two seats equal except the production resolution itself.
    const holderSeat = resolveViewerSeat(HOLDER, players, spectators)
    const spectatorSeat = resolveViewerSeat(SPECTATOR, players, spectators)
    expect(holderSeat).toBe(1)
    expect(spectatorSeat).toBe(holderSeat)

    const realPlayerView = playerView(state, seatId(holderSeat!))
    const spectatorView = playerView(state, seatId(spectatorSeat!))

    // Same treasury visibility, same fog-of-war, same everything — the whole object.
    expect(spectatorView).toEqual(realPlayerView)
    // Byte-equivalent under serialization (this is what actually crosses the wire).
    expect(JSON.stringify(spectatorView)).toBe(JSON.stringify(realPlayerView))
  })

  it('is fog-locked to the granted seat — a seat-0 spectator never sees seat-1’s view', () => {
    // SPECTATOR watches seat 1, WATCHER0 watches seat 0. Their views must genuinely differ —
    // a union / god view would collapse the distinction — and each must equal exactly its own
    // watched seat's real player view.
    const seat1View = viewFor(SPECTATOR)
    const seat0View = viewFor(WATCHER0)
    expect(JSON.stringify(seat1View)).not.toBe(JSON.stringify(seat0View))
    expect(JSON.stringify(seat1View)).toBe(JSON.stringify(playerView(state, seatId(1))))
    expect(JSON.stringify(seat0View)).toBe(JSON.stringify(playerView(state, seatId(0))))
  })

  it('never widens a seat-holder’s fog via a self-granted spectate seat', () => {
    // DUAL holds seat 0 but also granted itself a spectate on seat 1. Player precedence must
    // pin it to its own seat 0 — never the enemy seat 1 it tried to grant itself.
    const dualView = viewFor(DUAL)
    expect(JSON.stringify(dualView)).toBe(JSON.stringify(playerView(state, seatId(0))))
    expect(JSON.stringify(dualView)).not.toBe(JSON.stringify(playerView(state, seatId(1))))
  })

  it('resolves no seat for a user with neither a seat nor a grant (caller answers FORBIDDEN)', () => {
    expect(resolveViewerSeat(STRANGER, players, spectators)).toBeNull()
  })

  it('never exposes a non-watched seat’s treasury to the spectator', () => {
    const spectatorView = viewFor(SPECTATOR)
    const watched = spectatorView.players.find((p) => p.id === seatId(1))!
    const other = spectatorView.players.find((p) => p.id === seatId(0))!
    expect(watched.resources).toBeDefined() // the watched seat's own treasury, as its player sees it
    expect(other.resources).toBeUndefined() // seat-0's treasury stays hidden, exactly as for seat-1's player
  })

  it('carries no rngState or seed for a spectator, same as any player view', () => {
    const spectatorView = viewFor(SPECTATOR)
    expect(spectatorView.rngState).toBeNull()
    expect(JSON.stringify(spectatorView)).not.toContain('"seed"')
  })
})
