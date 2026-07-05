import { describe, expect, it } from 'vitest'
import {
  clampOpenMatchLimit,
  OPEN_MATCH_PAGE_MAX,
  selectOpenMatches,
  type OpenMatchSummary,
} from '@aop/shared'

/** A joinable lobby with sensible defaults; override per test. */
function summary(over: Partial<OpenMatchSummary> = {}): OpenMatchSummary {
  return {
    matchId: over.matchId ?? 'm1',
    mapSize: over.mapSize ?? 'medium',
    maxPlayers: over.maxPlayers ?? 4,
    playerCount: over.playerCount ?? 1,
    turnTimerSeconds: over.turnTimerSeconds ?? 86400,
    createdAt: over.createdAt ?? '2026-07-05T12:00:00.000Z',
  }
}

describe('clampOpenMatchLimit', () => {
  it('defaults to the page max when unspecified', () => {
    expect(clampOpenMatchLimit(undefined)).toBe(OPEN_MATCH_PAGE_MAX)
  })

  it('caps oversized requests at the page max', () => {
    expect(clampOpenMatchLimit(1000)).toBe(OPEN_MATCH_PAGE_MAX)
  })

  it('floors zero and negatives up to 1 (never returns an empty page for a positive intent)', () => {
    expect(clampOpenMatchLimit(0)).toBe(1)
    expect(clampOpenMatchLimit(-5)).toBe(1)
  })

  it('floors fractional requests and rejects NaN/Infinity', () => {
    expect(clampOpenMatchLimit(3.9)).toBe(3)
    expect(clampOpenMatchLimit(Number.NaN)).toBe(OPEN_MATCH_PAGE_MAX)
    expect(clampOpenMatchLimit(Number.POSITIVE_INFINITY)).toBe(OPEN_MATCH_PAGE_MAX)
  })
})

describe('selectOpenMatches', () => {
  it('offers only lobbies with a free seat (full lobbies are hidden)', () => {
    const open = summary({ matchId: 'open', playerCount: 2, maxPlayers: 4 })
    const full = summary({ matchId: 'full', playerCount: 4, maxPlayers: 4 })
    const result = selectOpenMatches([open, full])
    expect(result.map((m) => m.matchId)).toEqual(['open'])
  })

  it('treats an AI-saturated lobby (all seats filled) as full', () => {
    // create-match seats AI as rows too, so playerCount can reach maxPlayers with zero humans.
    const aiFull = summary({ matchId: 'ai', playerCount: 4, maxPlayers: 4 })
    expect(selectOpenMatches([aiFull])).toEqual([])
  })

  it('sorts newest first, tie-broken by matchId descending', () => {
    const older = summary({ matchId: 'a', createdAt: '2026-07-05T10:00:00.000Z' })
    const newer = summary({ matchId: 'b', createdAt: '2026-07-05T11:00:00.000Z' })
    const tieHi = summary({ matchId: 'z', createdAt: '2026-07-05T11:00:00.000Z' })
    const result = selectOpenMatches([older, newer, tieHi])
    expect(result.map((m) => m.matchId)).toEqual(['z', 'b', 'a'])
  })

  it('applies the keyset cursor: only matches strictly before `before`', () => {
    const a = summary({ matchId: 'a', createdAt: '2026-07-05T09:00:00.000Z' })
    const b = summary({ matchId: 'b', createdAt: '2026-07-05T10:00:00.000Z' })
    const boundary = summary({ matchId: 'c', createdAt: '2026-07-05T11:00:00.000Z' })
    const result = selectOpenMatches([a, b, boundary], {
      before: '2026-07-05T11:00:00.000Z',
    })
    expect(result.map((m) => m.matchId)).toEqual(['b', 'a'])
  })

  it('caps the result at the requested (clamped) page size, newest first', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      summary({
        matchId: `m${i}`,
        createdAt: `2026-07-05T12:00:${String(i).padStart(2, '0')}.000Z`,
      }),
    )
    const page = selectOpenMatches(many, { limit: 3 })
    expect(page).toHaveLength(3)
    expect(page.map((m) => m.matchId)).toEqual(['m9', 'm8', 'm7'])
  })

  it('never exceeds OPEN_MATCH_PAGE_MAX even for an over-large limit', () => {
    const many = Array.from({ length: OPEN_MATCH_PAGE_MAX + 20 }, (_, i) =>
      summary({
        matchId: `m${i}`,
        createdAt: `2026-07-05T12:00:00.${String(i).padStart(3, '0')}Z`,
      }),
    )
    expect(selectOpenMatches(many, { limit: 999 })).toHaveLength(OPEN_MATCH_PAGE_MAX)
  })
})
