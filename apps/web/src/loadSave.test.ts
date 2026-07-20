import {
  applyAction,
  createGame,
  RULES_VERSION,
  type GameConfig,
  type GameState,
} from '@aop/engine'
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

/** A `GameState` snapshot stamped with `rulesVersion` (defaults to current). */
function snapshot(rulesVersion: number = RULES_VERSION): GameState {
  const base = createGame(config())
  return { ...base, config: { ...base.config, rulesVersion } }
}

describe('stateFromSave', () => {
  describe('no snapshot (pre-#540 v2 save): replays the log', () => {
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

  describe('snapshot present (#540): resumes from the snapshot', () => {
    it('returns the current-version snapshot directly, ignoring the action log', () => {
      const snap = snapshot()
      // A deliberately corrupt log: if resume touched it at all this would throw.
      const state = stateFromSave(
        record({ snapshot: snap, actions: [{ type: 'endTurn', playerId: 'p2' }] }),
      )
      expect(state).toEqual(snap)
    })

    it('resumes a version-mismatched snapshot by re-stamping rulesVersion, and it stays playable', () => {
      const stale = snapshot(RULES_VERSION - 1)
      const state = stateFromSave(record({ snapshot: stale, config: config() }))
      // Re-stamped so the reducer's version gate accepts further moves.
      expect(state.config.rulesVersion).toBe(RULES_VERSION)
      const nextId = state.players[state.currentPlayerIndex]!.id
      const advanced = applyAction(state, { type: 'endTurn', playerId: nextId })
      expect(advanced.players[advanced.currentPlayerIndex]!.id).not.toBe(nextId)
    })

    it('re-stamping does not mutate the stored snapshot', () => {
      const stale = snapshot(RULES_VERSION - 1)
      stateFromSave(record({ snapshot: stale }))
      expect(stale.config.rulesVersion).toBe(RULES_VERSION - 1)
    })

    it('round-trips losslessly through JSON (the snapshot IS the persisted state)', () => {
      const snap = snapshot()
      const persisted = JSON.parse(JSON.stringify(record({ snapshot: snap }))) as SaveRecord
      const state = stateFromSave(persisted)
      expect(JSON.stringify(state)).toBe(JSON.stringify(snap))
    })
  })
})
