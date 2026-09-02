import { createGame, RULES_VERSION, type Action, type GameConfig } from '@aop/engine'
import { describe, expect, it, vi } from 'vitest'
import appSource from './App.tsx?raw'
import { saveGameArguments } from './appSave'
import { replayOriginFromSave } from './loadSave'
import { SCHEMA_VERSION, type SaveRecord } from './storage'

function config(): GameConfig {
  return {
    seed: 1,
    mapSize: 'small',
    rulesVersion: RULES_VERSION,
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

function crossVersionSave(): SaveRecord {
  const state = createGame(config())
  const snapshot = { ...state, config: { ...state.config, rulesVersion: RULES_VERSION - 1 } }
  return {
    slotId: 'slot-1',
    schemaVersion: SCHEMA_VERSION - 1,
    config: { ...config(), rulesVersion: RULES_VERSION - 1 },
    actions: [],
    round: state.round,
    savedAt: 0,
    snapshot,
  }
}

describe('App save call sites (#565)', () => {
  it('preserves snapshot lineage through both autosave and manual save after a cross-version resume', async () => {
    const resumed = crossVersionSave()
    const replayOrigin = replayOriginFromSave(resumed)
    expect(replayOrigin).toBe('snapshot')

    const resumedState = createGame(config())
    const actions: Action[] = [{ type: 'endTurn', playerId: 'p1' }]
    const save = vi
      .fn<(...args: ReturnType<typeof saveGameArguments>) => Promise<void>>()
      .mockResolvedValue()

    await save(...saveGameArguments('autosave', resumedState, actions, replayOrigin))
    await save(...saveGameArguments('slot-2', resumedState, actions, replayOrigin))

    expect(save).toHaveBeenNthCalledWith(
      1,
      'autosave',
      resumedState.config,
      actions,
      resumedState.round,
      resumedState,
      'snapshot',
    )
    expect(save).toHaveBeenNthCalledWith(
      2,
      'slot-2',
      resumedState.config,
      actions,
      resumedState.round,
      resumedState,
      'snapshot',
    )
  })

  it('wires replayOrigin into both App save call sites', () => {
    // This package deliberately has no DOM test harness. Keep the call-site
    // assertion next to the payload test so deleting either argument cannot
    // leave the cross-version lineage regression green.
    expect(appSource).toContain(
      "saveGame(...saveGameArguments('autosave', next, nextLog, replayOrigin))",
    )
    expect(appSource).toContain(
      'saveGame(...saveGameArguments(slotId, game, actionLog, replayOrigin))',
    )
  })
})
