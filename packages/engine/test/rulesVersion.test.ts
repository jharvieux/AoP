import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createGame,
  currentPlayer,
  replay,
  RULES_VERSION,
  RulesVersionMismatchError,
  type Action,
  type GameConfig,
} from '../src'
import { GAME_SETUP } from './fixtures'

/**
 * The `rulesVersion` schema-version guard (#213): `createGame` stamps the
 * current `RULES_VERSION` into `GameState.config`, and `applyAction` refuses
 * to run against a state stamped with any other value (or none at all) — the
 * "refuse loudly" half of forward-compat, replacing the optional-field
 * sniffing the rest of the engine still relies on for purely additive
 * changes.
 */

function testConfig(): GameConfig {
  return {
    seed: 1,
    mapSize: 'small',
    setup: GAME_SETUP,
    players: [
      { id: 'p1', name: 'One', faction: 'pirates', isAI: false },
      { id: 'p2', name: 'Two', faction: 'british', isAI: true },
    ],
  }
}

const endTurn = (playerId: string): Action => ({ type: 'endTurn', playerId })

describe('rulesVersion (#213)', () => {
  it('createGame stamps the current RULES_VERSION into config', () => {
    const state = createGame(testConfig())
    expect(state.config.rulesVersion).toBe(RULES_VERSION)
  })

  it('createGame overwrites any rulesVersion the caller passed in — it is stamped, not caller-set', () => {
    const config: GameConfig = { ...testConfig(), rulesVersion: 999 }
    const state = createGame(config)
    expect(state.config.rulesVersion).toBe(RULES_VERSION)
  })

  it('a freshly-created game plays normally (regression guard on the new check)', () => {
    const state = createGame(testConfig())
    const next = applyAction(state, endTurn(currentPlayer(state).id))
    expect(next.currentPlayerIndex).not.toBe(state.currentPlayerIndex)
  })

  it('applyAction refuses a state stamped with a stale rulesVersion', () => {
    const state = createGame(testConfig())
    const stale = { ...state, config: { ...state.config, rulesVersion: RULES_VERSION - 1 } }
    expect(() => applyAction(stale, endTurn(currentPlayer(stale).id))).toThrow(
      RulesVersionMismatchError,
    )
  })

  it('applyAction refuses a state with no rulesVersion at all (pre-#213 snapshot)', () => {
    const state = createGame(testConfig())
    const { rulesVersion: _dropped, ...configWithoutVersion } = state.config
    const legacy = { ...state, config: configWithoutVersion }
    expect(() => applyAction(legacy, endTurn(currentPlayer(legacy).id))).toThrow(
      RulesVersionMismatchError,
    )
  })

  it('replay (a reduce over applyAction) rejects a mismatched-version log the same way', () => {
    const state = createGame(testConfig())
    const stale = { ...state, config: { ...state.config, rulesVersion: 0 } }
    expect(() => replay(stale, [endTurn(currentPlayer(stale).id)])).toThrow(
      RulesVersionMismatchError,
    )
  })

  it('the mismatch error carries both versions for a plain-English message', () => {
    const state = createGame(testConfig())
    const stale = { ...state, config: { ...state.config, rulesVersion: RULES_VERSION + 1 } }
    try {
      applyAction(stale, endTurn(currentPlayer(stale).id))
      expect.unreachable('expected RulesVersionMismatchError')
    } catch (err) {
      expect(err).toBeInstanceOf(RulesVersionMismatchError)
      const e = err as RulesVersionMismatchError
      expect(e.stateVersion).toBe(RULES_VERSION + 1)
      expect(e.currentVersion).toBe(RULES_VERSION)
    }
  })
})
