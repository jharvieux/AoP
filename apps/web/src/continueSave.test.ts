import { type GameConfig } from '@aop/engine'
import { describe, expect, it } from 'vitest'
import { mostRecentSave } from './continueSave'
import { SCHEMA_VERSION, type SaveRecord } from './storage'

function config(): GameConfig {
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
  }
}

function record(overrides: Partial<SaveRecord>): SaveRecord {
  return {
    slotId: 'autosave',
    schemaVersion: SCHEMA_VERSION,
    config: config(),
    actions: [],
    round: 1,
    savedAt: 0,
    ...overrides,
  }
}

describe('mostRecentSave', () => {
  it('returns undefined when there are no saves', () => {
    expect(mostRecentSave([])).toBeUndefined()
  })

  it('picks a manual slot saved after the last autosave', () => {
    const autosave = record({ slotId: 'autosave', savedAt: 100, round: 5 })
    const manual = record({ slotId: 'slot-1', savedAt: 200, round: 6 })
    expect(mostRecentSave([autosave, manual])).toBe(manual)
  })

  it('picks the autosave when it is newer than every manual slot', () => {
    const autosave = record({ slotId: 'autosave', savedAt: 300, round: 9 })
    const manual = record({ slotId: 'slot-1', savedAt: 200, round: 6 })
    expect(mostRecentSave([autosave, manual])).toBe(autosave)
  })
})
