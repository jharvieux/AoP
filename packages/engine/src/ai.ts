import { chebyshevDistance, type Coord } from '@aop/shared'
import type { Action } from './actions'
import { combatantStrength, createCombatStats, type CombatStats } from './combat'
import { captainsOf, currentPlayer } from './game'
import { findPath } from './pathfinding'
import { applyAction } from './reducer'
import type { Captain, GameState } from './types'

/**
 * Single-player AI opponent (#13): a utility-scoring turn player.
 *
 * The AI reads only the game state and emits the very same {@link Action}s a human
 * would, so nothing here is privileged. It is pure and DOM-free — the identical
 * code runs in the browser (chunked so it never blocks the main thread, via
 * {@link nextAiAction}) and, later, inside a Supabase Edge Function.
 *
 * Scoring spans the strategic verbs — engage (attack), expand (advance on a
 * beatable target), and defend (hold / end turn). Build and recruit verbs slot in
 * here as those systems land; the shape is deliberately open.
 */

/** Attack only when the odds are at least this good, to avoid suicidal charges. */
const MIN_ENGAGE_RATIO = 0.9

interface ScoredAction {
  action: Action
  score: number
}

/**
 * Decide the acting player's next single action. Returns `endTurn` when nothing
 * is worth doing. Callers loop this (see {@link runAiTurn}) and may yield between
 * calls to stay off the main thread — each call is cheap and deterministic.
 */
export function nextAiAction(state: GameState, playerId: string): Action {
  const stats = state.config.combatStats ? createCombatStats(state.config.combatStats) : null
  const myCaptains = captainsOf(state, playerId)
  const enemies = state.captains.filter((c) => c.ownerId !== playerId)

  let best: ScoredAction = { action: { type: 'endTurn', playerId }, score: 0 }

  for (const cap of myCaptains) {
    if (cap.movementPoints < 1) continue

    for (const enemy of enemies) {
      const ratio = strengthRatio(cap, enemy, stats)

      // Engage: adjacent and beatable -> attack.
      if (chebyshevDistance(cap.position, enemy.position) <= 1) {
        if (ratio >= MIN_ENGAGE_RATIO) {
          const score = 100 * ratio
          if (score > best.score) {
            best = {
              action: {
                type: 'attackCaptain',
                playerId,
                captainId: cap.id,
                targetCaptainId: enemy.id,
              },
              score,
            }
          }
        }
        continue
      }

      // Expand: advance on a beatable target if a sea route exists.
      if (ratio >= MIN_ENGAGE_RATIO) {
        const step = stepToward(state, cap, enemy.position)
        if (step) {
          // Prefer closing on nearer targets; keep well below any attack score.
          const score = 10 + (1 / (1 + chebyshevDistance(cap.position, enemy.position))) * 10
          if (score > best.score) {
            best = {
              action: { type: 'moveCaptain', playerId, captainId: cap.id, to: step },
              score,
            }
          }
        }
      }
    }
  }

  return best.action
}

/**
 * Play out the AI's whole turn synchronously and return the resulting state.
 * Stops when the AI ends its turn or is no longer the active player (e.g. it was
 * eliminated mid-turn). Used by tests, simulations, and edge functions; the
 * browser instead drives {@link nextAiAction} in chunks.
 */
export function runAiTurn(state: GameState, playerId: string): GameState {
  let current = state
  let guard = 0
  const maxActions = 1000
  while (
    current.status === 'active' &&
    currentPlayer(current).id === playerId &&
    guard++ < maxActions
  ) {
    const action = nextAiAction(current, playerId)
    current = applyAction(current, action)
    if (action.type === 'endTurn') break
  }
  return current
}

function strengthRatio(mine: Captain, enemy: Captain, stats: CombatStats | null): number {
  if (!stats) return Infinity // No stats to judge by: play aggressively.
  const mineStrength = combatantStrength(toCombatant(mine), stats)
  const enemyStrength = combatantStrength(toCombatant(enemy), stats)
  if (enemyStrength <= 0) return Infinity
  return mineStrength / enemyStrength
}

function toCombatant(c: Captain) {
  return { captainId: c.id, ownerId: c.ownerId, shipClassId: c.shipClassId, troops: c.troops }
}

/**
 * The furthest tile along the sea route toward `goal` the captain can reach this
 * turn, stopping one tile short of the goal (so it ends adjacent, ready to
 * attack, rather than stacking on top of the target). Returns null if no route.
 */
function stepToward(state: GameState, cap: Captain, goal: Coord): Coord | null {
  const path = findPath(state.map, cap.position, goal)
  if (!path || path.length < 2) return null
  // path[0] is the captain's current tile; the last tile is the goal itself.
  const maxIndex = Math.min(cap.movementPoints, path.length - 2)
  if (maxIndex < 1) return null
  return path[maxIndex]!
}
