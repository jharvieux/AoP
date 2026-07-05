/**
 * Quick-match queue policy (#153): the pure seat-assignment logic and the
 * dependency-injected drain orchestration, shared by the drain Edge Function
 * (`supabase/functions/drain-matchmaking`, which supplies the real database
 * effects) and its vitest suite (which supplies fakes to exercise the
 * concurrency property). Kept in `@aop/shared` so there is one definition of the
 * quick-match grouping rules, and free of runtime dependencies
 * (docs/MULTIPLAYER.md §2 engine/shared constraint).
 *
 * The race-critical step — claiming a group of waiters out of the queue — is a
 * Postgres primitive (`claim_matchmaking_group`, SELECT ... FOR UPDATE SKIP
 * LOCKED + delete-in-transaction). This module deliberately holds NO queue state
 * of its own beyond a single claim's result, so no code path can read-then-group
 * the queue outside that atomic claim — the mistake the issue warns against.
 */

import type { FactionId, MapSize } from './index'

/** A waiter claimed out of `matchmaking_queue`, as the drain sees them. */
export interface QueueEntry {
  userId: string
  /** The waiter's optional faction preference (honored on seating if free). */
  faction: string | null
}

/** A grouping bucket: waiters are only ever matched with others wanting the same
 * match size and map (the two compatibility criteria of this v1). */
export interface QuickMatchBucket {
  matchSize: number
  mapSize: MapSize
}

/** A seat in a freshly formed quick match: FIFO seat index + a deduped faction. */
export interface QuickMatchSeat {
  seat: number
  userId: string
  faction: FactionId
}

/**
 * Assign seats and dedup factions for a claimed group. Seats are 0..n-1 in
 * claim (FIFO) order; each waiter keeps its preferred faction when that faction
 * is still free, otherwise it takes the first unused faction from `factionPool`
 * — the same first-free rule the lobby uses (`firstFreeFaction`). Pure: the
 * drain passes `FACTION_IDS` as the pool.
 */
export function assignQuickMatchSeats(
  entries: readonly QueueEntry[],
  factionPool: readonly FactionId[],
): QuickMatchSeat[] {
  const taken = new Set<FactionId>()
  const firstFree = (): FactionId => {
    const free = factionPool.find((f) => !taken.has(f))
    if (!free) throw new Error('No factions remain for the quick-match group')
    return free
  }
  return entries.map((entry, seat) => {
    const preferred = entry.faction as FactionId | null
    const faction =
      preferred && factionPool.includes(preferred) && !taken.has(preferred)
        ? preferred
        : firstFree()
    taken.add(faction)
    return { seat, userId: entry.userId, faction }
  })
}

/** A match the drain created this run. */
export interface DrainedMatch {
  matchId: string
  userIds: string[]
}

export interface DrainSummary {
  matchesCreated: number
  playersMatched: number
  matches: DrainedMatch[]
}

/** The side effects the drain needs, injected so the orchestration stays pure
 * and testable (the Edge Function wires the real database ones). */
export interface DrainDeps {
  /** Buckets that currently have at least one waiter. A stale result is safe: an
   * already-emptied bucket just yields a null claim below. */
  listBuckets: () => Promise<QuickMatchBucket[]>
  /** Atomically claim one full group for `bucket` (the FOR UPDATE SKIP LOCKED
   * primitive), or null when fewer than `matchSize` waiters remain. This is the
   * ONLY place the queue is read-and-mutated; its atomicity is what makes
   * overlapping drains safe. */
  claimGroup: (bucket: QuickMatchBucket) => Promise<QueueEntry[] | null>
  /** Create + start a match for an already-claimed group; returns the match id. */
  createMatch: (bucket: QuickMatchBucket, group: QueueEntry[]) => Promise<string>
}

/** Cap on groups formed per bucket per invocation: a safety valve so a single
 * drain run can't spin unboundedly on a huge queue; the next scheduled run picks
 * up any remainder. */
const MAX_GROUPS_PER_BUCKET = 100

/**
 * Drain the quick-match queue: for each bucket, repeatedly claim a full group
 * and start a match for it until no full group remains. Concurrency-safety rests
 * entirely on `claimGroup` being atomic — this loop never re-groups waiters
 * itself, so two overlapping drains simply claim disjoint groups (or one gets a
 * null claim and moves on). Idempotent when the queue is empty: every claim
 * returns null and nothing is created.
 */
export async function drainQueue(deps: DrainDeps): Promise<DrainSummary> {
  const matches: DrainedMatch[] = []
  const buckets = await deps.listBuckets()
  for (const bucket of buckets) {
    for (let i = 0; i < MAX_GROUPS_PER_BUCKET; i++) {
      const group = await deps.claimGroup(bucket)
      if (!group || group.length === 0) break
      const matchId = await deps.createMatch(bucket, group)
      matches.push({ matchId, userIds: group.map((e) => e.userId) })
    }
  }
  return {
    matchesCreated: matches.length,
    playersMatched: matches.reduce((sum, m) => sum + m.userIds.length, 0),
    matches,
  }
}
