import { describe, expect, it } from 'vitest'
import {
  buildLeaderboard,
  clampLeaderboardLimit,
  LEADERBOARD_PAGE_MAX,
  type LeaderboardCandidate,
} from './leaderboard'

/**
 * Leaderboards (#154), the `@aop/shared` pure ranking/pagination module.
 * Pure, I/O-free module with no coupling to the game engine itself.
 */

const candidate = (
  userId: string,
  rating: number,
  matchesPlayed = 0,
  displayName?: string,
): LeaderboardCandidate => ({
  userId,
  displayName: displayName ?? userId,
  rating,
  matchesPlayed,
})

describe('clampLeaderboardLimit', () => {
  it('defaults to the page max when unspecified', () => {
    expect(clampLeaderboardLimit(undefined)).toBe(LEADERBOARD_PAGE_MAX)
  })

  it('caps oversized requests at the page max', () => {
    expect(clampLeaderboardLimit(1000)).toBe(LEADERBOARD_PAGE_MAX)
  })

  it('floors zero and negatives up to 1 (never an empty page for a positive intent)', () => {
    expect(clampLeaderboardLimit(0)).toBe(1)
    expect(clampLeaderboardLimit(-5)).toBe(1)
  })

  it('floors fractional requests and rejects NaN/Infinity', () => {
    expect(clampLeaderboardLimit(3.9)).toBe(3)
    expect(clampLeaderboardLimit(Number.NaN)).toBe(LEADERBOARD_PAGE_MAX)
    expect(clampLeaderboardLimit(Number.POSITIVE_INFINITY)).toBe(LEADERBOARD_PAGE_MAX)
  })
})

describe('buildLeaderboard (#154)', () => {
  it('orders highest rating first', () => {
    const result = buildLeaderboard([
      candidate('a', 1400),
      candidate('b', 1600),
      candidate('c', 1500),
    ])
    expect(result.map((r) => r.userId)).toEqual(['b', 'c', 'a'])
  })

  it('assigns 1-based rank in sorted order', () => {
    const result = buildLeaderboard([
      candidate('a', 1400),
      candidate('b', 1600),
      candidate('c', 1500),
    ])
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3])
  })

  it('breaks a rating tie by userId ascending, deterministically', () => {
    const result = buildLeaderboard([candidate('zed', 1500), candidate('amy', 1500)])
    expect(result.map((r) => r.userId)).toEqual(['amy', 'zed'])
  })

  it('reports true rank, not a page-relative position, once paged', () => {
    const candidates = [candidate('a', 1000), candidate('b', 900), candidate('c', 800)]
    const page = buildLeaderboard(candidates, 2)
    expect(page.map((r) => ({ userId: r.userId, rank: r.rank }))).toEqual([
      { userId: 'a', rank: 1 },
      { userId: 'b', rank: 2 },
    ])
  })

  it('clamps to the page max by default', () => {
    const candidates = Array.from({ length: LEADERBOARD_PAGE_MAX + 20 }, (_, i) =>
      candidate(`p${i}`, 3000 - i),
    )
    const result = buildLeaderboard(candidates)
    expect(result).toHaveLength(LEADERBOARD_PAGE_MAX)
    expect(result[0]!.userId).toBe('p0')
    expect(result[LEADERBOARD_PAGE_MAX - 1]!.rank).toBe(LEADERBOARD_PAGE_MAX)
  })

  it('does not mutate the input candidate array', () => {
    const candidates = [candidate('a', 1400), candidate('b', 1600)]
    const snapshot = candidates.map((c) => ({ ...c }))
    buildLeaderboard(candidates)
    expect(candidates).toEqual(snapshot)
  })

  it('carries displayName and matchesPlayed through untouched', () => {
    const result = buildLeaderboard([candidate('a', 1500, 42, 'Captain Amy')])
    expect(result[0]).toEqual({
      userId: 'a',
      displayName: 'Captain Amy',
      rating: 1500,
      matchesPlayed: 42,
      rank: 1,
    })
  })

  it('returns an empty leaderboard for no candidates', () => {
    expect(buildLeaderboard([])).toEqual([])
  })
})
