import {
  applyAction,
  applyActionWithOutcome,
  createGame,
  replay,
  type Action,
  type BattleReport,
  type GameConfig,
  type GameState,
} from '@aop/engine'

/**
 * Client-side replay cursor for #146 (local single-player) and #147
 * (multiplayer finished matches): reconstructs `GameState` from a frozen
 * `GameConfig` + full action log via `createGame`/`applyAction`, the same
 * event-sourced path saves already use (see ../storage.ts). Kept in apps/web,
 * not the engine — scrubbing/checkpointing is UI concern, not simulation
 * (CLAUDE.md's engine-purity invariant).
 */

export interface ReplayCheckpoint {
  /** Number of actions applied to reach this checkpoint (0 = the initial state). */
  actionIndex: number
  round: number
  state: GameState
}

/**
 * One checkpoint per round boundary, so seeking to any round jumps straight
 * there instead of replaying the whole log from action 0. Cost is a single
 * full replay of the log, done once up front.
 */
export function buildReplayCheckpoints(
  config: GameConfig,
  actions: readonly Action[],
): ReplayCheckpoint[] {
  let state = createGame(config)
  const checkpoints: ReplayCheckpoint[] = [{ actionIndex: 0, round: state.round, state }]
  for (let i = 0; i < actions.length; i++) {
    state = applyAction(state, actions[i]!)
    const last = checkpoints[checkpoints.length - 1]!
    if (state.round !== last.round) {
      checkpoints.push({ actionIndex: i + 1, round: state.round, state })
    }
  }
  return checkpoints
}

/**
 * The `GameState` after exactly `actionIndex` actions, replaying forward from
 * the nearest preceding checkpoint rather than from action 0.
 */
export function stateAtActionIndex(
  checkpoints: readonly ReplayCheckpoint[],
  actions: readonly Action[],
  actionIndex: number,
): GameState {
  const clamped = Math.max(0, Math.min(actionIndex, actions.length))
  let base = checkpoints[0]!
  for (const checkpoint of checkpoints) {
    if (checkpoint.actionIndex > clamped) break
    base = checkpoint
  }
  if (base.actionIndex === clamped) return base.state
  return replay(base.state, actions.slice(base.actionIndex, clamped))
}

/**
 * The action index of the last checkpoint at or before `round` — used to jump
 * a round-seek slider straight to that round's start. A round beyond the
 * replay's range clamps to the final checkpoint (end of the log).
 */
export function actionIndexForRound(
  checkpoints: readonly ReplayCheckpoint[],
  round: number,
): number {
  let found = checkpoints[0]!
  for (const checkpoint of checkpoints) {
    if (checkpoint.round > round) break
    found = checkpoint
  }
  return found.actionIndex
}

/**
 * The `BattleReport` produced by the action that led to `actionIndex`, or
 * `null` if that action wasn't an `attackCaptain` (or `actionIndex` is 0,
 * before any action ran). Reports aren't stored in the log or in checkpoint
 * state — only the resulting `GameState` is — so this replays that one action
 * again with {@link applyActionWithOutcome} from the state just before it.
 * Fully derived from the pre-action RNG state, so it reproduces the report
 * that was shown live, bit-exactly (#304: Watch Replay had no battle
 * playback at all because nothing recovered this).
 */
export function battleReportAtActionIndex(
  checkpoints: readonly ReplayCheckpoint[],
  actions: readonly Action[],
  actionIndex: number,
): BattleReport | null {
  if (actionIndex <= 0 || actionIndex > actions.length) return null
  const action = actions[actionIndex - 1]!
  if (action.type !== 'attackCaptain') return null
  const before = stateAtActionIndex(checkpoints, actions, actionIndex - 1)
  return applyActionWithOutcome(before, action).battleReport ?? null
}
