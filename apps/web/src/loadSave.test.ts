import { type GameConfig } from '@aop/engine'
import { describe, expect, it } from 'vitest'
import { stateFromSave } from './loadSave'
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

function record(overrides: Partial<SaveRecord> = {}): SaveRecord {
  return {
    slotId: 'slot-1',
    schemaVersion: SCHEMA_VERSION,
    config: config(),
    actions: [],
    round: 1,
    savedAt: Date.now(),
    ...overrides,
  }
}

describe('stateFromSave', () => {
  it('replays a clean action log back into GameState', () => {
    const state = stateFromSave(record({ actions: [{ type: 'endTurn', playerId: 'p1' }] }))
    expect(state.players[state.currentPlayerIndex]!.id).toBe('p2')
  })

  it('throws (#237) on a corrupt log instead of returning a bogus state', () => {
    // p2 can never legally act before p1's first endTurn — replay must reject
    // this the same way a hand-edited/corrupted save file would be rejected.
    expect(() =>
      stateFromSave(record({ actions: [{ type: 'endTurn', playerId: 'p2' }] })),
    ).toThrow()
  })
})
