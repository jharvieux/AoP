import { applyActionWithOutcome, createGame, type GameConfig, type GameState } from '@aop/engine'
import { describe, expect, it } from 'vitest'
import { dispatchAction } from './actionDispatch'

/**
 * `dispatchAction`'s whole reason to exist (#240) is what happens when the
 * engine rejects an action: for a human seat, a message with no state change;
 * for an AI seat, a forced endTurn so the game can never softlock on
 * "AI thinking…". These tests drive the real engine (createGame +
 * applyActionWithOutcome), same as boardingPlanner.test.ts, rather than
 * mocking it — the contract is specifically about how the real
 * InvalidActionError-throwing reducer gets handled.
 */

function config(): GameConfig {
  return {
    seed: 1,
    mapSize: 'small',
    setup: {
      startingGold: 1000,
      startingCaptainMovement: 5,
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

function freshGame(): GameState {
  return createGame(config())
}

/** Advances from p1's (human) turn to p2's (AI) turn via a real endTurn. */
function aiTurnGame(): GameState {
  return applyActionWithOutcome(freshGame(), { type: 'endTurn', playerId: 'p1' }).state
}

describe('dispatchAction', () => {
  it('applies a legal action unchanged', () => {
    const game = freshGame()
    const result = dispatchAction(game, { type: 'endTurn', playerId: 'p1' })
    expect(result.kind).toBe('applied')
    if (result.kind !== 'applied') throw new Error('unreachable')
    expect(result.appliedAction).toEqual({ type: 'endTurn', playerId: 'p1' })
    expect(result.outcome.state.round).toBeGreaterThanOrEqual(game.round)
  })

  it('reports a rejected human action as a message, with no forced substitute', () => {
    const game = freshGame() // p1 (human) is on the clock
    const result = dispatchAction(game, {
      type: 'moveCaptain',
      playerId: 'p1',
      captainId: 'no-such-captain',
      to: { x: 0, y: 0 },
    })
    expect(result).toEqual({ kind: 'rejected', message: 'No captain no-such-captain' })
  })

  it('forces the AI seat off the clock when its proposed action is rejected', () => {
    const game = aiTurnGame() // p2 (AI) is on the clock
    const result = dispatchAction(game, {
      type: 'moveCaptain',
      playerId: 'p2',
      captainId: 'no-such-captain',
      to: { x: 0, y: 0 },
    })
    expect(result.kind).toBe('applied')
    if (result.kind !== 'applied') throw new Error('unreachable')
    // The forced substitute is what gets logged/persisted, not the rejected
    // proposal — replaying the action log must never hit the same rejection.
    expect(result.appliedAction).toEqual({ type: 'endTurn', playerId: 'p2' })
    expect(result.outcome.state.round).toBeGreaterThan(game.round - 1)
  })

  it('rethrows an error that is not an InvalidActionError', () => {
    // A corrupt currentPlayerIndex makes the engine's own `currentPlayer()`
    // throw a plain Error (not InvalidActionError) — dispatchAction must let
    // that surface rather than silently swallowing it as a routine rejection.
    const game: GameState = { ...freshGame(), currentPlayerIndex: 99 }
    expect(() => dispatchAction(game, { type: 'endTurn', playerId: 'p1' })).toThrow(
      /Invalid currentPlayerIndex/,
    )
  })
})
