import { createGame, replay, RULES_VERSION, type GameState } from '@aop/engine'
import type { SaveRecord } from './storage'

/**
 * Reconstructs the resumable `GameState` from a save record (#237, #540).
 * Extracted as its own step so callers compute it *before* touching any of
 * their own state: a load that's about to fail must never half-overwrite the
 * game currently in progress.
 *
 * Two paths:
 *
 *  - **Snapshot present (#540, every v3+ save).** The snapshot is the exact
 *    serialized state at save time — the authoritative resume point. It is
 *    used directly, skipping replay entirely. This is what makes a save survive
 *    a `RULES_VERSION` bump: the snapshot carries its own seeded RNG state, so
 *    play continues deterministically from it regardless of whether the current
 *    engine could still reproduce the pre-bump history from the seed. When the
 *    snapshot predates the running engine, its one version-gated field —
 *    `config.rulesVersion`, which `applyAction` refuses to run against a
 *    mismatch on — is re-stamped to the current build so further moves apply.
 *    (Cross-version resume skips replay verification by design; single-player
 *    only — multiplayer stays server-authoritative. Any deeper reconciliation
 *    an older snapshot shape might need is out of scope: this client only ever
 *    writes current-shape snapshots, so the forward case — today's save resumed
 *    on a future engine — needs nothing beyond the re-stamp.)
 *
 *  - **No snapshot (a pre-#540 v2 save).** Reconstruct by replaying the log
 *    against a freshly created game. `replay` throws on a corrupt log the same
 *    way `loadGame` throws for a newer-schema save — a real failure mode, not
 *    an exotic edge case. `assertSaveIsLoadable` has already rejected such a
 *    save if its rules version doesn't match this build (#539).
 */
export function stateFromSave(record: SaveRecord): GameState {
  const { snapshot } = record
  if (snapshot) {
    if (snapshot.config.rulesVersion === RULES_VERSION) return snapshot
    return { ...snapshot, config: { ...snapshot.config, rulesVersion: RULES_VERSION } }
  }
  return replay(createGame(record.config), record.actions)
}
