import { describe, expect, it } from 'vitest'
import { resolveLateJoin } from '@aop/shared'

/**
 * The join-match / start-match race decision table (#221). `join-match` checks
 * `status = 'lobby'` and inserts the seat in two round-trips; `start-match` can
 * freeze the GameState config in between, leaving a DB seat the game does not
 * know about. After the insert the joiner re-reads the status (and, when the
 * lobby closed, the frozen seq-0 snapshot's player count); this pure rule
 * decides whether the seat survived the freeze or must be evicted. The eviction
 * side is load-bearing: a kept-but-unfrozen seat wedges its holder in a match
 * where submitAction always answers NOT_YOUR_TURN.
 */
describe('resolveLateJoin (#221)', () => {
  it('keeps the seat while the match is still a lobby', () => {
    expect(resolveLateJoin('lobby', 3, 0)).toBe('seated')
  })

  it('keeps the seat when the freeze included it (seat < frozen player count)', () => {
    // 4 players frozen into the GameState; seat 3 is the last of them.
    expect(resolveLateJoin('active', 3, 4)).toBe('seated')
    expect(resolveLateJoin('active', 0, 2)).toBe('seated')
  })

  it('evicts a seat the freeze does not know about (seat >= frozen player count)', () => {
    // The lobby froze 2 players; the racing joiner landed at seat 2.
    expect(resolveLateJoin('active', 2, 2)).toBe('evicted')
    expect(resolveLateJoin('active', 5, 4)).toBe('evicted')
  })

  it('evicts on any non-lobby status, not just active', () => {
    expect(resolveLateJoin('finished', 2, 2)).toBe('evicted')
    expect(resolveLateJoin('missing', 0, 0)).toBe('evicted')
  })
})
