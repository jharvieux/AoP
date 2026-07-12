/**
 * Schema/behavior version for `GameState`/`GameConfig` (#213). Optional-field
 * presence (`CombatStatsData.battle?`, `AllianceState.broken?`) only survives
 * purely additive changes; the first change that alters the *meaning* of an
 * existing field, or the RNG draw order of an existing action, makes an old
 * snapshot replay to a silently different state with no way to detect which
 * rules build produced it. This constant is the explicit version stamp that
 * replaces that sniffing.
 *
 * Bump it whenever a change would break replay compatibility with existing
 * `GameState`/action logs — purely additive fields with safe defaults do not
 * need a bump (docs/MULTIPLAYER.md §10's backward-compatibility rule).
 *
 * `createGame` (game.ts) stamps the current value into every fresh
 * `GameState.config`; it never changes for the life of a match (config is
 * carried through unmodified by every reducer). `applyAction`/
 * `applyActionWithOutcome` (reducer.ts) refuse to run — throwing
 * {@link RulesVersionMismatchError} — against any state stamped with a
 * different value, including a state with no `rulesVersion` at all (a
 * pre-#213 snapshot, of unknown vintage). There is no migration path yet: a
 * mismatch is a hard stop, the same "refuse to replay" policy as the
 * cross-tier `ENGINE_VERSION` guard (docs/MULTIPLAYER.md §10, `@aop/shared`'s
 * `ENGINE_VERSION`) applies at the deploy-version level.
 *
 * History: v2 — elimination sweeps the dead seat's captains and cities (#208),
 * no combat XP on an escape (#209), pool-based crew casualties (#210).
 * v3 — a match whose living seats are all AI (in a match that had a human
 * seat) finishes at once, with no winner declared (#426).
 */
export const RULES_VERSION = 3

/**
 * Thrown by `applyAction`/`applyActionWithOutcome` when `state.config.rulesVersion`
 * does not match the running engine build's {@link RULES_VERSION}.
 */
export class RulesVersionMismatchError extends Error {
  constructor(
    readonly stateVersion: number | undefined,
    readonly currentVersion: number,
  ) {
    super(
      `GameState.config.rulesVersion is ${stateVersion ?? 'unset'}, but this engine build is ` +
        `rules v${currentVersion}. Replaying state from a different rules version can silently ` +
        'diverge from what actually happened, so this is refused rather than attempted.',
    )
    this.name = 'RulesVersionMismatchError'
  }
}
