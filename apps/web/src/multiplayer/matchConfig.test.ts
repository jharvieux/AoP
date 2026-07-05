import { describe, expect, it } from 'vitest'
import { buildMatchConfig, type SeatConfig } from './matchConfig'

const SEATS: SeatConfig[] = [
  { seat: 0, faction: 'pirates', isAI: false, displayName: 'Captain Ahab' },
  { seat: 1, faction: 'british', isAI: true, displayName: 'AI 1' },
]

describe('buildMatchConfig', () => {
  it('assigns seat-N ids in seat order, matching the server (seat identity, not user id)', () => {
    const config = buildMatchConfig(42, 'small', SEATS)
    expect(config.players.map((p) => p.id)).toEqual(['seat-0', 'seat-1'])
    expect(config.players[0]).toMatchObject({
      faction: 'pirates',
      isAI: false,
      name: 'Captain Ahab',
    })
    expect(config.players[1]).toMatchObject({ faction: 'british', isAI: true, name: 'AI 1' })
  })

  it('carries the seed and mapSize through unchanged', () => {
    const config = buildMatchConfig(1234, 'large', SEATS)
    expect(config.seed).toBe(1234)
    expect(config.mapSize).toBe('large')
  })

  it('gives every seat starting troops of six of their faction tier-1 unit', () => {
    const config = buildMatchConfig(1, 'small', SEATS)
    for (const player of config.players) {
      expect(player.startingTroops).toHaveLength(1)
      expect(player.startingTroops![0]!.count).toBe(6)
    }
  })

  it('is deterministic: identical inputs produce an identical config', () => {
    const a = buildMatchConfig(7, 'medium', SEATS)
    const b = buildMatchConfig(7, 'medium', SEATS)
    expect(a).toEqual(b)
  })
})
