import { createGame, replay, type GameState } from '@aop/engine'
import type { SaveRecord } from './storage'

/**
 * Replays a save record's action log into fresh `GameState` (#237). `replay`
 * throws on a corrupt log the same way `loadGame` deliberately throws for a
 * newer-schema save — both are real failure modes a save file can be in
 * (disk corruption, a save written by a build with different content data,
 * etc.), not exotic edge cases. Extracted as its own step so callers compute
 * it *before* touching any of their own state: a load that's about to fail
 * must never half-overwrite the game currently in progress.
 */
export function stateFromSave(record: SaveRecord): GameState {
  return replay(createGame(record.config), record.actions)
}
