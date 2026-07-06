import { describe, expect, it } from 'vitest'
import {
  URGENT_COUNTDOWN_SECONDS,
  detectTurnTransition,
  formatCountdown,
  isViewerTurn,
  turnCountdown,
  type TurnViewLike,
} from './turnTimer'

const NOW = Date.parse('2026-07-06T12:00:00.000Z')

const iso = (offsetSeconds: number) => new Date(NOW + offsetSeconds * 1000).toISOString()

describe('turnCountdown', () => {
  it('returns null for an untimed match', () => {
    expect(turnCountdown(null, NOW)).toBeNull()
  })

  it('returns null for a malformed deadline rather than rendering garbage', () => {
    expect(turnCountdown('not-a-timestamp', NOW)).toBeNull()
  })

  it('counts whole seconds down to a future deadline', () => {
    expect(turnCountdown(iso(90), NOW)).toEqual({
      remainingSeconds: 90,
      expired: false,
      urgent: false,
    })
  })

  it('floors partial seconds (never shows more time than actually remains)', () => {
    const deadline = new Date(NOW + 90 * 1000 + 999).toISOString()
    expect(turnCountdown(deadline, NOW)?.remainingSeconds).toBe(90)
  })

  it('flags urgency at the threshold boundary', () => {
    expect(turnCountdown(iso(URGENT_COUNTDOWN_SECONDS), NOW)?.urgent).toBe(true)
    expect(turnCountdown(iso(URGENT_COUNTDOWN_SECONDS + 1), NOW)?.urgent).toBe(false)
  })

  it('clamps a passed deadline to zero and marks it expired (auto-skip imminent)', () => {
    expect(turnCountdown(iso(-30), NOW)).toEqual({
      remainingSeconds: 0,
      expired: true,
      urgent: true,
    })
  })

  it('treats the exact deadline instant as expired', () => {
    expect(turnCountdown(iso(0), NOW)?.expired).toBe(true)
  })
})

describe('formatCountdown', () => {
  it('formats sub-hour clocks as m:ss', () => {
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(59)).toBe('0:59')
    expect(formatCountdown(60)).toBe('1:00')
    expect(formatCountdown(3599)).toBe('59:59')
  })

  it('formats hour-plus async clocks as Nh MMm', () => {
    expect(formatCountdown(3600)).toBe('1h 00m')
    expect(formatCountdown(3600 * 5 + 60 * 5)).toBe('5h 05m')
  })

  it('never renders negative time', () => {
    expect(formatCountdown(-42)).toBe('0:00')
  })
})

const view = (overrides: Partial<TurnViewLike> = {}): TurnViewLike => ({
  viewerId: 'seat-1',
  currentPlayerIndex: 0,
  players: [{ id: 'seat-0' }, { id: 'seat-1' }, { id: 'seat-2' }],
  status: 'active',
  ...overrides,
})

describe('isViewerTurn', () => {
  it('is true only when the current player is the viewer in an active match', () => {
    expect(isViewerTurn(view({ currentPlayerIndex: 1 }))).toBe(true)
    expect(isViewerTurn(view({ currentPlayerIndex: 0 }))).toBe(false)
    expect(isViewerTurn(view({ currentPlayerIndex: 1, status: 'finished' }))).toBe(false)
  })

  it('is false for an out-of-range currentPlayerIndex', () => {
    expect(isViewerTurn(view({ currentPlayerIndex: 99 }))).toBe(false)
  })
})

describe('detectTurnTransition', () => {
  it("fires 'your-turn' when the turn advances onto the viewer", () => {
    expect(
      detectTurnTransition(view({ currentPlayerIndex: 0 }), view({ currentPlayerIndex: 1 })),
    ).toBe('your-turn')
  })

  it("fires 'your-turn' on the first fetch of a match already waiting on the viewer", () => {
    expect(detectTurnTransition(null, view({ currentPlayerIndex: 1 }))).toBe('your-turn')
  })

  it("fires 'turn-passed' when the viewer's turn ends", () => {
    expect(
      detectTurnTransition(view({ currentPlayerIndex: 1 }), view({ currentPlayerIndex: 2 })),
    ).toBe('turn-passed')
  })

  it('stays quiet while the turn moves between other seats', () => {
    expect(
      detectTurnTransition(view({ currentPlayerIndex: 0 }), view({ currentPlayerIndex: 2 })),
    ).toBe(null)
  })

  it('stays quiet on a refetch that does not change whose turn it is', () => {
    expect(
      detectTurnTransition(view({ currentPlayerIndex: 1 }), view({ currentPlayerIndex: 1 })),
    ).toBe(null)
  })

  it("does not fire 'your-turn' when the match finished on the viewer's index", () => {
    expect(
      detectTurnTransition(
        view({ currentPlayerIndex: 0 }),
        view({ currentPlayerIndex: 1, status: 'finished' }),
      ),
    ).toBe(null)
  })
})
