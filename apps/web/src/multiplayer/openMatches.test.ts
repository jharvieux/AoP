import { describe, expect, it } from 'vitest'
import {
  clampOpenMatchLimit,
  decodeOpenMatchCursor,
  encodeOpenMatchCursor,
  OPEN_MATCH_PAGE_MAX,
  selectOpenMatches,
  type OpenMatchCursor,
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

  it('applies the keyset cursor: only matches that sort strictly after the cursor tuple', () => {
    const a = summary({ matchId: 'a', createdAt: '2026-07-05T09:00:00.000Z' })
    const b = summary({ matchId: 'b', createdAt: '2026-07-05T10:00:00.000Z' })
    const boundary = summary({ matchId: 'c', createdAt: '2026-07-05T11:00:00.000Z' })
    const result = selectOpenMatches([a, b, boundary], {
      before: { createdAt: '2026-07-05T11:00:00.000Z', matchId: 'c' },
    })
    expect(result.map((m) => m.matchId)).toEqual(['b', 'a'])
  })

  it('pages through same-`createdAt` matches without skipping or duplicating any (composite cursor)', () => {
    // Regression for the #150 audit blocker: several lobbies created in the same second.
    // A bare-`createdAt` cursor (nextBefore = last row's timestamp, filter `createdAt < before`)
    // would drop EVERY same-second row on page two, so any tie split across a page boundary
    // vanished from every page. The `(createdAt, matchId)` tuple cursor must page cleanly.
    const ts = '2026-07-05T12:00:00.000Z'
    const all = Array.from({ length: 5 }, (_, i) => summary({ matchId: `m${i}`, createdAt: ts }))

    const seen: string[] = []
    let before: OpenMatchCursor | null = null
    for (let guard = 0; guard < 100; guard++) {
      const page = selectOpenMatches(all, { limit: 2, before })
      if (page.length === 0) break
      seen.push(...page.map((m) => m.matchId))
      const last = page[page.length - 1]!
      before = { createdAt: last.createdAt, matchId: last.matchId }
      if (page.length < 2) break // short page ⇒ end of list
    }

    expect(new Set(seen).size).toBe(seen.length) // no duplicates
    expect([...seen].sort()).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']) // every match returned exactly once
  })

  it('round-trips a cursor through encode/decode and rejects malformed input', () => {
    const cursor: OpenMatchCursor = { createdAt: '2026-07-05T12:00:00.000Z', matchId: 'm-42' }
    expect(decodeOpenMatchCursor(encodeOpenMatchCursor(cursor))).toEqual(cursor)
    expect(decodeOpenMatchCursor(null)).toBeNull()
    expect(decodeOpenMatchCursor('no-separator')).toBeNull()
    expect(decodeOpenMatchCursor('|missing-created-at')).toBeNull()
    expect(decodeOpenMatchCursor('missing-match-id|')).toBeNull()
    expect(decodeOpenMatchCursor(123)).toBeNull()
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
