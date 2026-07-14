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
 * v8 — captain expansion (#498): required `Captain.stats`/`Captain.items` and
 * `PlayerState.itemStash` fields with five new actions (`chooseCaptainStat`,
 * `garrisonCaptain`, `ungarrisonCaptain`, `takeItem`, `depositItem`) plus
 * `disembark.withCaptain`; item drops add RNG draws to `resolveEncounter`,
 * `captureSite` (haul), and `resolvePartyEncounter`, shifting every subsequent
 * roll; city assaults now fold port defenders into the defence and capture
 * them on a fall. A v7 snapshot lacks the required fields and replays its
 * encounter log to different rolls, so replaying across the boundary is refused.
 * v9 — flat captain stats (#498 rebalance): the MEANING of `Captain.stats`
 * attack/defense changes — stat points are now flat per-unit adds to every
 * commanded unit's attack/defense scores, applied before the skills'
 * percentage scaling, instead of feeding the percentage channel; and items no
 * longer carry their own percentages — they boost the carrier's stats
 * (`ItemLike.stats`, live while carried, inert in the stash), with speed items
 * flowing through the same stat channel at refresh. No new actions or state
 * fields, but every combat and movement refresh involving stats or items
 * resolves differently, so a v8 log replays to a silently different state and
 * replaying across the boundary is refused.
 * v10 — map quadrupling (operator directive, 2026-07-14): every MAP_DIMENSIONS
 * preset doubles both dimensions (4x area), and generation gains the
 * land-assault-guarantee post-pass. MAP_DIMENSIONS is an engine constant (not
 * frozen into config like the content-side setup numbers), so a v9 action log
 * replayed on this build regenerates a differently-sized map from the same
 * (seed, mapSize) and silently diverges — replay across the boundary is refused.
 * v11 — stranded-captain rescue (#499, operator decision 2026-07-14 "instant
 * pool transfer"): `embark` now accepts a ship-lost leader's party onto ANY
 * own adjacent ship (previously rejected) and pools the rescued captain;
 * every action gains a port-rescue sweep (a ship-lost leader whose party
 * stands at an owned city transfers to the recruitment pool); and
 * `recruitCaptain` accepts such a pooled rescue as an immediately-eligible
 * rehire candidate. A v11 log can contain actions a v10 build rejects, and a
 * v10 state with a stranded column beside an owned city replays to different
 * party leadership here, so replaying across the boundary is refused.
 */
export const RULES_VERSION = 11

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
