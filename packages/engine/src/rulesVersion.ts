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
 * v4 — city recruit pools replenish on a multi-round cadence
 * (`ContentCatalog.recruitReplenishInterval`, #453) instead of every round,
 * changing the meaning of the round counter for recruitment.
 * v5 — landing parties (#465): a new required `GameState.parties` piece
 * domain with five new actions (disembark, moveParty, embark, attackParty,
 * partyAssaultCity); elimination now also requires holding no party, parties
 * extend vision and sail-order contacts, and `GameSetup` gains the required
 * `partyMovementPoints` knob — pre-#465 snapshots lack the field entirely.
 * v6 — land content (#466/#467): two new required `GameState` piece domains
 * (`landSites`, `landEncounters`) with two new actions (`captureSite`,
 * `resolvePartyEncounter`), hold-site claims add to per-round income, inland
 * neutral settlements are seeded into `cities`, and a shipyard now requires a
 * coastline. Land placement draws from a separate RNG stream, so the live
 * combat/encounter roll order is unchanged — but the new required fields and
 * reducer semantics make a pre-#466 snapshot replay differently, so it bumps.
 * v7 — standing march orders for landing parties (#482): new
 * `LandingParty.marchOrder` state with two actions (`setMarchOrder`,
 * `clearMarchOrder`), and turn advancement gains an auto-march phase (after
 * sail-order continuation) that moves ordered parties and accumulates their
 * explored tiles. A v7 log's `endTurn` therefore does more than a v6 build
 * would replay it as doing, so replaying across the boundary is refused.
 */
export const RULES_VERSION = 7

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
