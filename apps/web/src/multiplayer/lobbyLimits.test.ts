import { describe, expect, it } from 'vitest'
import { LOBBY_TTL_MS, MAX_OPEN_LOBBIES_PER_CREATOR, openLobbyLimitReached } from '@aop/shared'

// #230: create-match had no per-user rate limit and lobbies never expired, so one
// scripted account could create unbounded public lobbies. openLobbyLimitReached is
// the pure decision create-match's open-lobby count check makes; the actual query
// (and expire-lobbies' TTL sweep) needs a live Supabase stack to exercise, which the
// #217/#220/#227/#229 migrations in this batch were already verified against locally.
describe('openLobbyLimitReached (#230)', () => {
  it('allows a creator under the cap', () => {
    expect(openLobbyLimitReached(0)).toBe(false)
    expect(openLobbyLimitReached(MAX_OPEN_LOBBIES_PER_CREATOR - 1)).toBe(false)
  })

  it('throttles at and above the cap', () => {
    expect(openLobbyLimitReached(MAX_OPEN_LOBBIES_PER_CREATOR)).toBe(true)
    expect(openLobbyLimitReached(MAX_OPEN_LOBBIES_PER_CREATOR + 1)).toBe(true)
  })

  it('TTL is a positive, hour-aligned duration', () => {
    expect(LOBBY_TTL_MS).toBeGreaterThan(0)
    expect(LOBBY_TTL_MS % (60 * 60 * 1000)).toBe(0)
  })
})
