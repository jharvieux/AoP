import { describe, expect, it } from 'vitest'
import {
  applyRatingUpdate,
  expectedScore,
  DEFAULT_RATING,
  DEFAULT_K_FACTOR,
  type PlayerRating,
} from '@aop/shared'

/**
 * Ratings foundation (#151), the `@aop/shared` pure rating-math module. Lives in the
 * engine suite for the same reason `snapshotCompaction.test.ts` does: it is a pure,
 * I/O-free `@aop/shared` module with no vitest setup of its own, and the engine
 * package already has one wired up. This module has no coupling to the game engine
 * itself — it is not exercised against `GameState` anywhere in this file.
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
    const result = applyRatingUpdate({ a, b }, 'draw')
    expect(result.a.rating).toBe(1500)
    expect(result.b.rating).toBe(1500)
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
