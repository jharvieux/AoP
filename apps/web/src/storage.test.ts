import { createGame, RULES_VERSION, type GameConfig, type GameState } from '@aop/engine'
import { describe, expect, it } from 'vitest'
import { assertSaveIsLoadable, SCHEMA_VERSION, type SaveRecord } from './storage'

function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 1,
    mapSize: 'small',
    setup: {
      startingGold: 1000,
      startingCaptainMovement: 5,
      partyMovementPoints: 3,
      startingShipClass: 'sloop',
      homeIslandRadius: 2,
      homeIslandRingRadiusFactor: 0.4,
      startingBuildings: ['townhall'],
      cityVisionRadius: 3,
      captainVisionRadius: 2,
      combatWinXp: 40,
      startingReputation: 100,
      betrayalReputationPenalty: 40,
      allianceReputationMin: 30,
      betrayalTruceRounds: 2,
      recruitCaptainBaseCost: 400,
      recruitCaptainCostGrowth: 1.5,
      recruitCaptainStartingCrew: 3,
      captainCaptivityRounds: 5,
      ransomBaseCost: 200,
      ransomXpMultiplier: 2,
    },
    players: [
      { id: 'p1', name: 'P1', faction: 'pirates', isAI: false, startingTroops: [] },
      { id: 'p2', name: 'P2', faction: 'british', isAI: true, startingTroops: [] },
    ],
    ...overrides,
  }
}

function record(overrides: Partial<SaveRecord> = {}): SaveRecord {
  return {
    slotId: 'slot-1',
    schemaVersion: SCHEMA_VERSION,
    config: config({ rulesVersion: RULES_VERSION }),
    actions: [],
    round: 1,
    savedAt: Date.now(),
    ...overrides,
  }
}

function snapshot(): GameState {
  return createGame(config({ rulesVersion: RULES_VERSION }))
}

describe('assertSaveIsLoadable (#539)', () => {
  it('accepts a save stamped with the current RULES_VERSION', () => {
    expect(() => assertSaveIsLoadable(record())).not.toThrow()
  })

  it('rejects an older-RULES_VERSION save with NO snapshot, with a friendly message', () => {
    const stale = record({ config: config({ rulesVersion: RULES_VERSION - 1 }) })
    expect(() => assertSaveIsLoadable(stale)).toThrow(
      /earlier version of the game.*can't be resumed/,
    )
  })

  it('accepts an older-RULES_VERSION save WHEN it carries a snapshot (#540)', () => {
    const stale = record({
      config: config({ rulesVersion: RULES_VERSION - 1 }),
      snapshot: snapshot(),
    })
    expect(() => assertSaveIsLoadable(stale)).not.toThrow()
  })

  it('still rejects a newer-client-schema save even with a snapshot (#540)', () => {
    const newer = record({ schemaVersion: SCHEMA_VERSION + 1, snapshot: snapshot() })
    expect(() => assertSaveIsLoadable(newer)).toThrow(/newer client/)
  })

  it('rejects a pre-#213 save with no recorded rulesVersion at all', () => {
    // Omit rulesVersion entirely rather than set it `undefined` — matches how
    // an actual pre-#213 save (predating the field) deserializes, and
    // exactOptionalPropertyTypes forbids assigning `undefined` explicitly.
    const bareConfig = config()
    delete bareConfig.rulesVersion
    const noVersion = record({ config: bareConfig })
    expect(() => assertSaveIsLoadable(noVersion)).toThrow(/earlier version of the game/)
  })

  it('still rejects a save written by a newer client schema (pre-existing check)', () => {
    const newer = record({ schemaVersion: SCHEMA_VERSION + 1 })
    expect(() => assertSaveIsLoadable(newer)).toThrow(/newer client/)
  })
})
