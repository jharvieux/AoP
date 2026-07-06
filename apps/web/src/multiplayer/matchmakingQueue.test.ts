import { describe, expect, it } from 'vitest'
import {
  assignQuickMatchSeats,
  drainQueue,
  FACTION_IDS,
  type DrainDeps,
  type QueueEntry,
  type QuickMatchBucket,
} from '@aop/shared'

/**
 * Quick-match queue policy (#153), the `@aop/shared` half of the drain-matchmaking Edge
 * Function. The load-bearing property is concurrency safety: two overlapping drain runs must
 * never double-match a waiter into two matches. That safety lives in the atomic claim
 * (`claim_matchmaking_group`, SELECT ... FOR UPDATE SKIP LOCKED + delete-in-transaction);
 * `drainQueue` is safe iff it relies solely on that claim and never re-groups the queue
 * itself. The concurrency test below models the atomic claim with a synchronous splice (JS is
 * single-threaded, so a claim with no `await` in its critical section is exactly as atomic as
 * SKIP-LOCKED-plus-delete) and runs two drains concurrently to prove no waiter is
 * double-matched.
 */

// --- assignQuickMatchSeats: seat order + faction dedup -----------------------

const entry = (userId: string, faction: string | null = null): QueueEntry => ({ userId, faction })

describe('assignQuickMatchSeats (#153)', () => {
  it('assigns seats 0..n-1 in claim (FIFO) order', () => {
    const seats = assignQuickMatchSeats([entry('u0'), entry('u1'), entry('u2')], FACTION_IDS)
    expect(seats.map((s) => s.seat)).toEqual([0, 1, 2])
    expect(seats.map((s) => s.userId)).toEqual(['u0', 'u1', 'u2'])
  })

  it('gives every seat a distinct faction from the pool', () => {
    const seats = assignQuickMatchSeats([entry('u0'), entry('u1'), entry('u2')], FACTION_IDS)
    const factions = seats.map((s) => s.faction)
    expect(new Set(factions).size).toBe(3)
    for (const f of factions) expect(FACTION_IDS).toContain(f)
  })

  it('honors a free faction preference and reassigns a conflicting one', () => {
    // Both waiters want 'pirates'; the first keeps it, the second is bumped to first-free.
    const seats = assignQuickMatchSeats(
      [entry('u0', 'pirates'), entry('u1', 'pirates')],
      FACTION_IDS,
    )
    expect(seats[0]!.faction).toBe('pirates')
    expect(seats[1]!.faction).not.toBe('pirates')
    expect(new Set(seats.map((s) => s.faction)).size).toBe(2)
  })

  it('ignores an unknown faction preference and falls back to first-free', () => {
    const seats = assignQuickMatchSeats([entry('u0', 'klingon')], FACTION_IDS)
    expect(FACTION_IDS).toContain(seats[0]!.faction)
  })
})

// --- An in-memory queue whose claim models FOR UPDATE SKIP LOCKED ------------

interface Waiter extends QueueEntry {
  matchSize: number
  mapSize: 'small' | 'medium' | 'large'
  queuedAt: number
}

/** A shared queue with an atomic claim: the filter+splice runs synchronously (no `await`
 * inside), so two concurrent drains can never claim overlapping rows — the SKIP-LOCKED
 * guarantee, faithfully modeled in single-threaded JS. */
function sharedQueue(waiters: Waiter[]) {
  const queue = [...waiters]
  return {
    listBuckets(): QuickMatchBucket[] {
      const seen = new Set<string>()
      const buckets: QuickMatchBucket[] = []
      for (const w of queue) {
        const key = `${w.matchSize}:${w.mapSize}`
        if (seen.has(key)) continue
        seen.add(key)
        buckets.push({ matchSize: w.matchSize, mapSize: w.mapSize })
      }
      return buckets
    },
    claim(bucket: QuickMatchBucket): QueueEntry[] | null {
      const candidates = queue
        .filter((w) => w.matchSize === bucket.matchSize && w.mapSize === bucket.mapSize)
        .sort((a, b) => a.queuedAt - b.queuedAt)
        .slice(0, bucket.matchSize)
      if (candidates.length < bucket.matchSize) return null
      for (const c of candidates) queue.splice(queue.indexOf(c), 1)
      return candidates.map((c) => ({ userId: c.userId, faction: c.faction }))
    },
    remaining: () => queue,
  }
}

const tick = () => Promise.resolve()

/** Drain deps against a shared queue; every effect yields (`await tick()`) *before* the
 * atomic step so two concurrent drains genuinely interleave. `created` accumulates the
 * matches formed across all drains sharing it. */
function deps(
  q: ReturnType<typeof sharedQueue>,
  created: { matchId: string; userIds: string[] }[],
): DrainDeps {
  return {
    listBuckets: async () => {
      await tick()
      return q.listBuckets()
    },
    claimGroup: async (bucket) => {
      await tick()
      return q.claim(bucket)
    },
    createMatch: async (_bucket, group) => {
      await tick()
      const matchId = `m${created.length}`
      created.push({ matchId, userIds: group.map((e) => e.userId) })
      return matchId
    },
  }
}

// --- drainQueue: normal-path grouping ---------------------------------------

describe('drainQueue normal-path grouping (#153)', () => {
  it('forms full FIFO groups and leaves an incomplete remainder queued', async () => {
    // 5 waiters wanting a 2-player small match => 2 full groups, 1 remainder.
    const q = sharedQueue([
      { userId: 'u0', faction: null, matchSize: 2, mapSize: 'small', queuedAt: 0 },
      { userId: 'u1', faction: null, matchSize: 2, mapSize: 'small', queuedAt: 1 },
      { userId: 'u2', faction: null, matchSize: 2, mapSize: 'small', queuedAt: 2 },
      { userId: 'u3', faction: null, matchSize: 2, mapSize: 'small', queuedAt: 3 },
      { userId: 'u4', faction: null, matchSize: 2, mapSize: 'small', queuedAt: 4 },
    ])
    const created: { matchId: string; userIds: string[] }[] = []
    const summary = await drainQueue(deps(q, created))

    expect(summary.matchesCreated).toBe(2)
    expect(summary.playersMatched).toBe(4)
    // FIFO: oldest four are matched, u4 stays queued.
    expect(created[0]!.userIds).toEqual(['u0', 'u1'])
    expect(created[1]!.userIds).toEqual(['u2', 'u3'])
    expect(q.remaining().map((w) => w.userId)).toEqual(['u4'])
  })

  it('groups each (matchSize, mapSize) bucket independently', async () => {
    const q = sharedQueue([
      { userId: 'a0', faction: null, matchSize: 2, mapSize: 'small', queuedAt: 0 },
      { userId: 'a1', faction: null, matchSize: 2, mapSize: 'small', queuedAt: 1 },
      { userId: 'b0', faction: null, matchSize: 3, mapSize: 'large', queuedAt: 2 },
      { userId: 'b1', faction: null, matchSize: 3, mapSize: 'large', queuedAt: 3 },
    ])
    const created: { matchId: string; userIds: string[] }[] = []
    const summary = await drainQueue(deps(q, created))

    // The 2-small bucket forms a match; the 3-large bucket is short one player.
    expect(summary.matchesCreated).toBe(1)
    expect(created[0]!.userIds).toEqual(['a0', 'a1'])
    expect(
      q
        .remaining()
        .map((w) => w.userId)
        .sort(),
    ).toEqual(['b0', 'b1'])
  })

  it('creates nothing and mutates nothing when no bucket has a full group', async () => {
    const q = sharedQueue([
      { userId: 'lonely', faction: null, matchSize: 4, mapSize: 'small', queuedAt: 0 },
    ])
    const created: { matchId: string; userIds: string[] }[] = []
    const summary = await drainQueue(deps(q, created))

    expect(summary).toMatchObject({ matchesCreated: 0, playersMatched: 0 })
    expect(q.remaining()).toHaveLength(1)
  })
})

// --- drainQueue: the concurrency-safety property ----------------------------

describe('drainQueue concurrency safety (#153)', () => {
  it('never double-matches a waiter when two drains run concurrently', async () => {
    // 8 waiters => 4 full 2-player groups. Two overlapping drains race to form them.
    const waiters: Waiter[] = Array.from({ length: 8 }, (_, i) => ({
      userId: `u${i}`,
      faction: null,
      matchSize: 2,
      mapSize: 'small' as const,
      queuedAt: i,
    }))
    const q = sharedQueue(waiters)
    const created: { matchId: string; userIds: string[] }[] = []

    // Two drains sharing one queue and one `created` sink — the overlapping-invocation case.
    await Promise.all([drainQueue(deps(q, created)), drainQueue(deps(q, created))])

    const matchedUsers = created.flatMap((m) => m.userIds)
    // No waiter appears in two matches, and everyone groupable got matched exactly once.
    expect(new Set(matchedUsers).size).toBe(matchedUsers.length)
    expect(matchedUsers.length).toBe(8)
    expect(new Set(matchedUsers)).toEqual(new Set(waiters.map((w) => w.userId)))
    expect(q.remaining()).toHaveLength(0)
    // Every formed match is a clean pair.
    for (const m of created) expect(m.userIds).toHaveLength(2)
  })

  it('restores a claimed group and drains other buckets when createMatch fails (#219)', async () => {
    // Two buckets. The 2-small bucket's createMatch blows up (the faction-exhaustion
    // shape); the 3-large bucket must still drain, and the failed group must be
    // handed back to restoreGroup instead of being silently stranded.
    const q = sharedQueue([
      { userId: 'f0', faction: null, matchSize: 2, mapSize: 'small', queuedAt: 0 },
      { userId: 'f1', faction: null, matchSize: 2, mapSize: 'small', queuedAt: 1 },
      { userId: 'g0', faction: null, matchSize: 3, mapSize: 'large', queuedAt: 2 },
      { userId: 'g1', faction: null, matchSize: 3, mapSize: 'large', queuedAt: 3 },
      { userId: 'g2', faction: null, matchSize: 3, mapSize: 'large', queuedAt: 4 },
    ])
    const created: { matchId: string; userIds: string[] }[] = []
    const restored: { bucket: QuickMatchBucket; userIds: string[]; cause: unknown }[] = []
    const base = deps(q, created)
    const summary = await drainQueue({
      ...base,
      createMatch: async (bucket, group) => {
        if (bucket.matchSize === 2) throw new Error('boom')
        return base.createMatch(bucket, group)
      },
      restoreGroup: async (bucket, group, cause) => {
        restored.push({ bucket, userIds: group.map((e) => e.userId), cause })
      },
    })

    expect(summary.groupsFailed).toBe(1)
    expect(summary.matchesCreated).toBe(1)
    expect(created[0]!.userIds).toEqual(['g0', 'g1', 'g2'])
    expect(restored).toHaveLength(1)
    expect(restored[0]!.userIds).toEqual(['f0', 'f1'])
    expect(restored[0]!.bucket.matchSize).toBe(2)
    expect((restored[0]!.cause as Error).message).toBe('boom')
  })

  it('propagates a createMatch failure unchanged when no restoreGroup is provided', async () => {
    const q = sharedQueue([
      { userId: 'u0', faction: null, matchSize: 2, mapSize: 'small', queuedAt: 0 },
      { userId: 'u1', faction: null, matchSize: 2, mapSize: 'small', queuedAt: 1 },
    ])
    const base = deps(q, [])
    await expect(
      drainQueue({
        ...base,
        createMatch: async () => {
          throw new Error('boom')
        },
      }),
    ).rejects.toThrow('boom')
  })

  it('leaves the odd waiter queued (not partially matched) under concurrent drains', async () => {
    const waiters: Waiter[] = Array.from({ length: 7 }, (_, i) => ({
      userId: `u${i}`,
      faction: null,
      matchSize: 2,
      mapSize: 'small' as const,
      queuedAt: i,
    }))
    const q = sharedQueue(waiters)
    const created: { matchId: string; userIds: string[] }[] = []

    await Promise.all([drainQueue(deps(q, created)), drainQueue(deps(q, created))])

    const matchedUsers = created.flatMap((m) => m.userIds)
    expect(new Set(matchedUsers).size).toBe(matchedUsers.length) // no double-match
    expect(matchedUsers.length).toBe(6) // 3 pairs
    expect(q.remaining()).toHaveLength(1) // exactly one waiter left, never a partial group
  })
})
