import { describe, expect, it } from 'vitest'
import {
  chatRetentionCutoff,
  snapshotKeepSet,
  snapshotsToDelete,
  DEFAULT_CHAT_RETENTION_DAYS,
  DEFAULT_ROUNDS_PER_SNAPSHOT,
  type SnapshotMeta,
} from '@aop/shared'
import {
  applyAction,
  createGame,
  currentPlayer,
  nextAiAction,
  replay,
  type Action,
  type ContentCatalog,
  type GameConfig,
  type GameState,
} from '../src'
import { AI_TUNING, COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

/**
 * Snapshot compaction policy (#143), the `@aop/shared` half of the compact-snapshots
 * Edge Function. Lives in the engine suite because its load-bearing property —
 * "reconstruction is byte-identical before and after compaction" — is exactly the
 * snapshot-resume determinism proven in #142 (snapshotResume.test.ts): dropping an
 * intermediate snapshot is safe *because* replaying the tail from any earlier
 * surviving snapshot reproduces the identical state.
 */

// --- Pure keep-set policy ----------------------------------------------------

const meta = (seq: number, round: number): SnapshotMeta => ({ seq, round })

describe('snapshotKeepSet (#143)', () => {
  it('keeps genesis, the two newest, and one per N rounds', () => {
    // Snapshots at seq 0..12, one per round; N = 5 => round buckets {0-4},{5-9},{10-12}.
    const snaps = Array.from({ length: 13 }, (_, i) => meta(i, i))
    const keep = snapshotKeepSet(snaps, 5)
    expect(keep.has(0)).toBe(true) // genesis
    expect(keep.has(12)).toBe(true) // newest
    expect(keep.has(11)).toBe(true) // second newest
    // Bucket representatives: earliest seq whose round falls in each bucket.
    expect(keep.has(0)).toBe(true) // bucket 0 (rounds 0-4) -> seq 0
    expect(keep.has(5)).toBe(true) // bucket 1 (rounds 5-9) -> seq 5
    expect(keep.has(10)).toBe(true) // bucket 2 (rounds 10-12) -> seq 10
    // Everything else is droppable.
    expect(keep.has(6)).toBe(false)
    expect(keep.has(9)).toBe(false)
  })

  it('never drops the newest snapshot, for any set', () => {
    const cases: SnapshotMeta[][] = [
      [],
      [meta(0, 0)],
      [meta(0, 0), meta(3, 1)],
      Array.from({ length: 40 }, (_, i) => meta(i * 2, Math.floor(i / 2))),
      [meta(0, 0), meta(7, 2), meta(19, 9), meta(20, 9), meta(50, 40)],
    ]
    for (const snaps of cases) {
      if (snaps.length === 0) {
        expect(snapshotKeepSet(snaps).size).toBe(0)
        continue
      }
      const newest = Math.max(...snaps.map((s) => s.seq))
      expect(snapshotKeepSet(snaps).has(newest)).toBe(true)
      // And it is never scheduled for deletion, even with guardSeq at the head.
      expect(snapshotsToDelete(snaps, newest)).not.toContain(newest)
    }
  })

  it('is idempotent: re-running deletes nothing more', () => {
    const snaps = Array.from({ length: 30 }, (_, i) => meta(i, i))
    const guardSeq = 29
    const drop = new Set(snapshotsToDelete(snaps, guardSeq))
    const survivors = snaps.filter((s) => !drop.has(s.seq))
    expect(snapshotsToDelete(survivors, guardSeq)).toEqual([])
    // The survivors are exactly the keep-set.
    expect(new Set(survivors.map((s) => s.seq))).toEqual(snapshotKeepSet(snaps))
  })

  it('never deletes a snapshot above the guard seq (concurrent submit-action safety)', () => {
    const snaps = Array.from({ length: 20 }, (_, i) => meta(i, i))
    // A submit-action inserted seqs 18,19 after we read the head at 17.
    const drop = snapshotsToDelete(snaps, 17)
    expect(Math.max(...drop)).toBeLessThanOrEqual(17)
    expect(drop).not.toContain(18)
    expect(drop).not.toContain(19)
  })

  // --- Finished-match retention (#226) --------------------------------------

  it("mode 'finished' keeps only genesis and the final snapshot, dropping everything between", () => {
    const snaps = Array.from({ length: 25 }, (_, i) => meta(i, i))
    const keep = snapshotKeepSet(snaps, DEFAULT_ROUNDS_PER_SNAPSHOT, 'finished')
    expect(keep).toEqual(new Set([0, 24]))
    const drop = snapshotsToDelete(snaps, 24, DEFAULT_ROUNDS_PER_SNAPSHOT, 'finished')
    expect(drop).toEqual(Array.from({ length: 23 }, (_, i) => i + 1))
  })

  it("mode 'finished' collapses genesis and final into one entry for a single-snapshot match", () => {
    const keep = snapshotKeepSet([meta(0, 1)], DEFAULT_ROUNDS_PER_SNAPSHOT, 'finished')
    expect(keep).toEqual(new Set([0]))
  })

  it("mode 'finished' never deletes the final snapshot, even respecting a stale guardSeq", () => {
    const snaps = Array.from({ length: 10 }, (_, i) => meta(i, i))
    const drop = snapshotsToDelete(snaps, 9, DEFAULT_ROUNDS_PER_SNAPSHOT, 'finished')
    expect(drop).not.toContain(0)
    expect(drop).not.toContain(9)
  })

  it("defaults to 'active' mode when unspecified (backward compatible call sites)", () => {
    const snaps = Array.from({ length: 13 }, (_, i) => meta(i, i))
    expect(snapshotKeepSet(snaps, 5)).toEqual(snapshotKeepSet(snaps, 5, 'active'))
  })
})

// --- Chat retention cutoff (#226) -------------------------------------------

describe('chatRetentionCutoff (#226)', () => {
  it('subtracts the retention window from "now"', () => {
    const now = new Date('2026-07-05T00:00:00.000Z')
    const cutoff = chatRetentionCutoff(now, 30)
    expect(cutoff.toISOString()).toBe('2026-06-05T00:00:00.000Z')
  })

  it('defaults to DEFAULT_CHAT_RETENTION_DAYS when unspecified', () => {
    const now = new Date('2026-07-05T00:00:00.000Z')
    expect(chatRetentionCutoff(now).getTime()).toBe(
      chatRetentionCutoff(now, DEFAULT_CHAT_RETENTION_DAYS).getTime(),
    )
  })

  it('a match finished the day before the cutoff is eligible; the day after is not', () => {
    const now = new Date('2026-07-05T00:00:00.000Z')
    const cutoff = chatRetentionCutoff(now, 30)
    const finishedJustBefore = new Date(cutoff.getTime() - 1)
    const finishedJustAfter = new Date(cutoff.getTime() + 1)
    expect(finishedJustBefore.getTime() < cutoff.getTime()).toBe(true)
    expect(finishedJustAfter.getTime() < cutoff.getTime()).toBe(false)
  })
})

// --- Byte-identical reconstruction across a real match -----------------------

const CATALOG: ContentCatalog = {
  buildings: {
    townhall: { produces: { gold: 100 }, cost: {} },
    barracks: { produces: {}, cost: { gold: 150 }, requires: 'townhall', unlocksTier: 1 },
    shipyard: { produces: {}, cost: { gold: 300 }, requires: 'townhall' },
  },
  units: {
    deckhand: {
      factionId: 'pirates',
      tier: 1,
      goldCost: 25,
      weeklyGrowth: 8,
      attack: 1,
      defense: 3,
      health: 400,
    },
    sailor: {
      factionId: 'british',
      tier: 1,
      goldCost: 30,
      weeklyGrowth: 8,
      attack: 1,
      defense: 3,
      health: 400,
    },
  },
  ships: { sloop: { hull: 40, cannons: 6, speed: 6, crewCapacity: 6, upgrades: {} } },
  skills: {},
  captainXpThresholds: [0, 150, 400, 800, 1400],
  resourceNodes: {
    gold: { yield: { gold: 50 } },
    timber: { yield: { timber: 3 } },
    iron: { yield: { iron: 2 } },
    rum: { yield: { rum: 2 } },
  },
}

function matchConfig(seed: number): GameConfig {
  const stat = { attack: 1, defense: 3, health: 400 }
  return {
    seed,
    mapSize: 'small',
    setup: { ...GAME_SETUP, startingBuildings: ['townhall', 'barracks', 'shipyard'] },
    combatStats: {
      units: [
        { id: 'deckhand', ...stat },
        { id: 'sailor', ...stat },
      ],
      ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 6 }],
      combat: COMBAT_TUNING,
      tactics: TACTICS_TUNING,
    },
    content: CATALOG,
    aiTuning: AI_TUNING,
    players: [
      {
        id: 'p1',
        name: 'One',
        faction: 'pirates',
        isAI: true,
        startingTroops: [{ unitId: 'deckhand', count: 6 }],
      },
      {
        id: 'p2',
        name: 'Two',
        faction: 'british',
        isAI: true,
        startingTroops: [{ unitId: 'sailor', count: 6 }],
      },
    ],
  }
}

/** An in-memory stand-in for the `match_snapshots` + `match_actions` tables. */
interface SnapshotStore {
  snapshots: Map<number, GameState>
  actions: Action[] // actions[i] has seq i+1
}

/**
 * The server's snapshot cadence: seq 0 (genesis) plus one snapshot on every turn
 * advance (§5.6). Returns the full store and the head seq.
 */
function buildStore(
  config: GameConfig,
  maxActions: number,
): { store: SnapshotStore; head: number } {
  const snapshots = new Map<number, GameState>()
  const actions: Action[] = []
  let state = createGame(config)
  snapshots.set(0, state)
  while (state.status === 'active' && actions.length < maxActions) {
    const before = state
    const action = nextAiAction(state, currentPlayer(state).id)
    state = applyAction(state, action)
    actions.push(action)
    const seq = actions.length
    const advanced =
      before.currentPlayerIndex !== state.currentPlayerIndex || state.status !== 'active'
    if (advanced) snapshots.set(seq, state)
  }
  return { store: { snapshots, actions }, head: actions.length }
}

/**
 * Mirrors `reconstructState` (supabase/functions/_shared/match.ts): newest
 * snapshot at or below `upToSeq`, then replay the action tail. Serializes each
 * stored snapshot through JSON first, exactly as a jsonb read would.
 */
function reconstruct(store: SnapshotStore, upToSeq: number): GameState {
  let baseSeq = -1
  for (const seq of store.snapshots.keys()) {
    if (seq <= upToSeq && seq > baseSeq) baseSeq = seq
  }
  if (baseSeq < 0) throw new Error(`no snapshot at or below seq ${upToSeq}`)
  const base = JSON.parse(JSON.stringify(store.snapshots.get(baseSeq)!)) as GameState
  const tail = store.actions.slice(baseSeq, upToSeq)
  return replay(base, tail)
}

function metasOf(store: SnapshotStore): SnapshotMeta[] {
  return [...store.snapshots.entries()].map(([seq, state]) => ({ seq, round: state.round }))
}

describe('compaction preserves reconstruction (#143)', () => {
  it('reconstructs byte-identically at every seq before and after compaction', () => {
    const { store, head } = buildStore(matchConfig(1), 240)
    // Enough turn advances for compaction to actually drop rows.
    expect(store.snapshots.size).toBeGreaterThan(10)
    const newestSnap = Math.max(...store.snapshots.keys())

    const before = new Map<number, string>()
    for (let seq = 0; seq <= head; seq++) before.set(seq, JSON.stringify(reconstruct(store, seq)))

    const drop = snapshotsToDelete(metasOf(store), head, DEFAULT_ROUNDS_PER_SNAPSHOT)
    expect(drop.length).toBeGreaterThan(0) // compaction had work to do
    for (const seq of drop) store.snapshots.delete(seq)

    // The genesis and the newest snapshot must both survive.
    expect(store.snapshots.has(0)).toBe(true)
    expect(store.snapshots.has(newestSnap)).toBe(true)

    // Every seq still reconstructs to the identical state.
    for (let seq = 0; seq <= head; seq++) {
      expect(JSON.stringify(reconstruct(store, seq))).toBe(before.get(seq))
    }
  })

  it('never deletes the snapshot the head reconstructs from', () => {
    const { store, head } = buildStore(matchConfig(2), 200)
    const newestSnap = Math.max(...store.snapshots.keys())
    const drop = new Set(snapshotsToDelete(metasOf(store), head))
    expect(drop.has(newestSnap)).toBe(false)
    for (const seq of drop) store.snapshots.delete(seq)
    // Reconstruction at the head still works and matches a full-log replay.
    const fromStore = JSON.stringify(reconstruct(store, head))
    const fullReplay = JSON.stringify(replay(store.snapshots.get(0)!, store.actions.slice(0, head)))
    expect(fromStore).toBe(fullReplay)
  })
})
