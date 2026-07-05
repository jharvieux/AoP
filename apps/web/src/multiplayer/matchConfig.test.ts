import { describe, expect, it } from 'vitest'
import { createGame } from '@aop/engine'
import { GAME_SETUP } from '@aop/content'
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

  // #177: the host's diplomacy knobs must survive the config rebuild, or an online
  // match would silently ignore them and a client replay would diverge from the
  // server. Overrides given -> those values; omitted -> the content defaults the
  // pre-#177 match ran with.
  it('threads host-configured betrayal knobs into config.setup', () => {
    const config = buildMatchConfig(7, 'small', SEATS, {
      betrayalReputationPenalty: 75,
      betrayalTruceRounds: 0,
    })
    expect(config.setup.betrayalReputationPenalty).toBe(75)
    expect(config.setup.betrayalTruceRounds).toBe(0)
  })

  it('falls back to the content defaults when betrayal knobs are omitted', () => {
    const config = buildMatchConfig(7, 'small', SEATS)
    expect(config.setup.betrayalReputationPenalty).toBe(GAME_SETUP.betrayalReputationPenalty)
    expect(config.setup.betrayalTruceRounds).toBe(GAME_SETUP.betrayalTruceRounds)
  })

  it('leaves the rest of GAME_SETUP untouched while overriding only the two knobs', () => {
    const config = buildMatchConfig(7, 'small', SEATS, { betrayalTruceRounds: 5 })
    expect(config.setup).toEqual({
      ...GAME_SETUP,
      betrayalTruceRounds: 5,
    })
  })

  // #169: the client catalog carries a `resourceNodes` field the server's
  // twin omits (apps/web/src/catalog.ts vs supabase/functions/_shared/catalog.ts).
  // That's currently inert because `buildMatchConfig` never sets
  // `mapDefinition`, and the engine only seeds `GameState.resourceNodes` from
  // `mapDefinition` (packages/engine/src/game.ts) — so a multiplayer-sourced
  // config always starts with zero resource nodes on the board regardless of
  // the catalog divergence. This test pins that inertness so a future change
  // that starts wiring up `mapDefinition` here is forced to also reconcile
  // the two catalogs.
  it('never seeds resource nodes onto the board (mapDefinition is unset for multiplayer)', () => {
    const config = buildMatchConfig(7, 'small', SEATS)
    expect(config.mapDefinition).toBeUndefined()
    const state = createGame(config)
    expect(state.resourceNodes).toEqual([])
  })
})
