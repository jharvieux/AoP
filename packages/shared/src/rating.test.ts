import { describe, expect, it } from 'vitest'
import {
  applyRatingUpdate,
  computeMatchRatingUpdates,
  expectedScore,
  DEFAULT_RATING,
  DEFAULT_K_FACTOR,
  type PlayerRating,
  type RatedSeat,
} from './rating'

/**
 * Ratings foundation (#151), the `@aop/shared` pure rating-math module.
 * Pure, I/O-free module with no coupling to the game engine itself.
 */

const rating = (r: number, matchesPlayed = 0): PlayerRating => ({ rating: r, matchesPlayed })

describe('expectedScore (#151)', () => {
  it('is 0.5 for equal ratings', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5)
  })

  it('is symmetric: expectedScore(x, y) === 1 - expectedScore(y, x)', () => {
    expect(expectedScore(1600, 1400)).toBeCloseTo(1 - expectedScore(1400, 1600))
  })

  it('favors the higher-rated player', () => {
    expect(expectedScore(1800, 1200)).toBeGreaterThan(0.5)
    expect(expectedScore(1200, 1800)).toBeLessThan(0.5)
  })

  it('saturates towards but never reaches 0 or 1 for extreme differences', () => {
    const veryLow = expectedScore(400, 3000)
    const veryHigh = expectedScore(3000, 400)
    expect(veryLow).toBeGreaterThan(0)
    expect(veryHigh).toBeLessThan(1)
    expect(veryLow + veryHigh).toBeCloseTo(1)
  })
})

describe('applyRatingUpdate (#151)', () => {
  it('is pure: does not mutate its inputs', () => {
    const a = rating(1500, 3)
    const b = rating(1500, 5)
    const snapshotA = { ...a }
    const snapshotB = { ...b }
    applyRatingUpdate({ a, b }, 'a_win')
    expect(a).toEqual(snapshotA)
    expect(b).toEqual(snapshotB)
  })

  it('is deterministic: same inputs always produce the same output', () => {
    const a = rating(1520, 2)
    const b = rating(1480, 7)
    const first = applyRatingUpdate({ a, b }, 'b_win')
    const second = applyRatingUpdate({ a, b }, 'b_win')
    expect(second).toEqual(first)
  })

  it('equal ratings: winner gains exactly half the K-factor, loser loses the same', () => {
    const a = rating(1500)
    const b = rating(1500)
    const result = applyRatingUpdate({ a, b }, 'a_win')
    expect(result.a.rating).toBe(1500 + DEFAULT_K_FACTOR / 2)
    expect(result.b.rating).toBe(1500 - DEFAULT_K_FACTOR / 2)
  })

  it('equal ratings: a draw changes nothing', () => {
    const a = rating(1500)
    const b = rating(1500)
    const result = applyRatingUpdate({ a, b }, 'a_win')
    expect(result.a.rating).toBe(1500 + DEFAULT_K_FACTOR / 2)
    expect(result.b.rating).toBe(1500 - DEFAULT_K_FACTOR / 2)
  })

  it('a draw between unequal ratings pulls both towards each other', () => {
    const a = rating(1600)
    const b = rating(1400)
    const result = applyRatingUpdate({ a, b }, 'draw')
    expect(result.a.rating).toBeLessThan(1600) // favorite "underperformed" by drawing
    expect(result.b.rating).toBeGreaterThan(1400) // underdog "overperformed" by drawing
  })

  it('is zero-sum: the winner gains exactly what the loser loses (up to rounding)', () => {
    const a = rating(1550)
    const b = rating(1430)
    const result = applyRatingUpdate({ a, b }, 'b_win')
    const gainB = result.b.rating - b.rating
    const lossA = a.rating - result.a.rating
    expect(gainB).toBe(lossA)
  })

  it('increments matchesPlayed for both players, including on a draw', () => {
    const a = rating(1500, 4)
    const b = rating(1500, 9)
    for (const outcome of ['a_win', 'b_win', 'draw'] as const) {
      const result = applyRatingUpdate({ a, b }, outcome)
      expect(result.a.matchesPlayed).toBe(5)
      expect(result.b.matchesPlayed).toBe(10)
    }
  })

  it('handles first-time players with no rating history (default rating, zero matches)', () => {
    const a = rating(DEFAULT_RATING, 0)
    const b = rating(DEFAULT_RATING, 0)
    const result = applyRatingUpdate({ a, b }, 'a_win')
    expect(result.a.matchesPlayed).toBe(1)
    expect(result.b.matchesPlayed).toBe(1)
    expect(result.a.rating).toBeGreaterThan(DEFAULT_RATING)
    expect(result.b.rating).toBeLessThan(DEFAULT_RATING)
  })

  it('a heavy favorite winning barely moves either rating', () => {
    const a = rating(2400)
    const b = rating(1200)
    const result = applyRatingUpdate({ a, b }, 'a_win')
    expect(result.a.rating - a.rating).toBeLessThanOrEqual(1)
    expect(result.a.rating).toBeGreaterThanOrEqual(a.rating)
  })

  it('a heavy underdog winning gains close to the full K-factor', () => {
    const a = rating(2400)
    const b = rating(1200)
    const result = applyRatingUpdate({ a, b }, 'b_win')
    expect(result.b.rating - b.rating).toBeGreaterThanOrEqual(DEFAULT_K_FACTOR - 1)
  })

  it('respects a custom K-factor', () => {
    const a = rating(1500)
    const b = rating(1500)
    const result = applyRatingUpdate({ a, b }, 'a_win', 16)
    expect(result.a.rating).toBe(1500 + 8)
    expect(result.b.rating).toBe(1500 - 8)
  })
})

describe('computeMatchRatingUpdates (#152)', () => {
  const seat = (userId: string | null, won = false): RatedSeat => ({ userId, won })
  const ratings = (entries: Record<string, PlayerRating>): Map<string, PlayerRating> =>
    new Map(Object.entries(entries))

  it('two rated seats reduce exactly to applyRatingUpdate(a_win)', () => {
    const current = ratings({ w: rating(1550, 2), l: rating(1430, 7) })
    const result = computeMatchRatingUpdates([seat('w', true), seat('l')], current)
    const pairwise = applyRatingUpdate({ a: current.get('w')!, b: current.get('l')! }, 'a_win')
    expect(result.get('w')).toEqual(pairwise.a)
    expect(result.get('l')).toEqual(pairwise.b)
  })

  it('winner beats every loser and its gain is the sum of the pairwise deltas', () => {
    const current = ratings({
      w: rating(1500),
      x: rating(1500),
      y: rating(1500),
      z: rating(1500),
    })
    const result = computeMatchRatingUpdates(
      [seat('w', true), seat('x'), seat('y'), seat('z')],
      current,
    )
    // Against three equal 1500 opponents, each pairwise win is +K/2, so +48 total.
    expect(result.get('w')!.rating).toBe(1500 + (3 * DEFAULT_K_FACTOR) / 2)
    // Each loser lost one game to an equal-rated winner: -K/2.
    for (const id of ['x', 'y', 'z']) {
      expect(result.get(id)!.rating).toBe(1500 - DEFAULT_K_FACTOR / 2)
    }
  })

  it('increments matchesPlayed by exactly one per rated seat, never per pairwise game', () => {
    const current = ratings({
      w: rating(1500, 10),
      x: rating(1500, 4),
      y: rating(1500, 0),
    })
    const result = computeMatchRatingUpdates([seat('w', true), seat('x'), seat('y')], current)
    expect(result.get('w')!.matchesPlayed).toBe(11)
    expect(result.get('x')!.matchesPlayed).toBe(5)
    expect(result.get('y')!.matchesPlayed).toBe(1)
  })

  it('is independent of the order losers are listed in', () => {
    const current = ratings({ w: rating(1600), x: rating(1400), y: rating(1550) })
    const forward = computeMatchRatingUpdates([seat('w', true), seat('x'), seat('y')], current)
    const reversed = computeMatchRatingUpdates([seat('y'), seat('x'), seat('w', true)], current)
    expect(reversed.get('w')).toEqual(forward.get('w'))
  })

  it('defaults an unrated first-time player to DEFAULT_RATING at zero matches', () => {
    // Only the winner has a stored rating; the loser is brand new.
    const current = ratings({ w: rating(1500, 3) })
    const result = computeMatchRatingUpdates([seat('w', true), seat('newbie')], current)
    expect(result.get('newbie')!.matchesPlayed).toBe(1)
    expect(result.get('newbie')!.rating).toBe(DEFAULT_RATING - DEFAULT_K_FACTOR / 2)
  })

  it('excludes AI seats (userId null) from the calculation entirely', () => {
    const current = ratings({ human: rating(1500) })
    // A human beats two AI seats: no rated opponents, so the rating holds.
    const result = computeMatchRatingUpdates([seat('human', true), seat(null), seat(null)], current)
    expect(result.size).toBe(1)
    expect(result.get('human')).toEqual({ rating: 1500, matchesPlayed: 1 })
  })

  it('when an AI seat wins, no human rating moves but each still counts a match', () => {
    const current = ratings({ a: rating(1500, 2), b: rating(1480, 6) })
    // The winning seat is AI (userId null, won); the two humans both lost.
    const result = computeMatchRatingUpdates([seat(null, true), seat('a'), seat('b')], current)
    expect(result.get('a')).toEqual({ rating: 1500, matchesPlayed: 3 })
    expect(result.get('b')).toEqual({ rating: 1480, matchesPlayed: 7 })
  })

  it('a mutual-elimination draw (no winner) moves no rating but counts the match', () => {
    const current = ratings({ a: rating(1500), b: rating(1600) })
    const result = computeMatchRatingUpdates([seat('a'), seat('b')], current)
    expect(result.get('a')).toEqual({ rating: 1500, matchesPlayed: 1 })
    expect(result.get('b')).toEqual({ rating: 1600, matchesPlayed: 1 })
  })

  it('is zero-sum across a multi-player match (up to per-pair rounding)', () => {
    const current = ratings({ w: rating(1500), x: rating(1500), y: rating(1500) })
    const result = computeMatchRatingUpdates([seat('w', true), seat('x'), seat('y')], current)
    const totalDelta =
      result.get('w')!.rating -
      1500 +
      (result.get('x')!.rating - 1500) +
      (result.get('y')!.rating - 1500)
    expect(totalDelta).toBe(0)
  })

  it('does not mutate the supplied ratings map or its entries', () => {
    const wRating = rating(1500, 1)
    const current = new Map<string, PlayerRating>([['w', wRating]])
    computeMatchRatingUpdates([seat('w', true), seat('l')], current)
    expect(wRating).toEqual({ rating: 1500, matchesPlayed: 1 })
    expect(current.size).toBe(1)
  })
})
