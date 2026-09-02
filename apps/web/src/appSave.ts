import type { Action, GameState } from '@aop/engine'
import type { ReplayOrigin } from './storage'

/** The complete save payload shared by App's autosave and manual slot paths. */
export function saveGameArguments(
  slotId: string,
  game: GameState,
  actions: Action[],
  replayOrigin: ReplayOrigin,
): [string, GameState['config'], Action[], number, GameState, ReplayOrigin] {
  return [slotId, game.config, actions, game.round, game, replayOrigin]
}
