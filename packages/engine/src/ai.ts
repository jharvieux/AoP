import { canAfford, coordsEqual, type Coord } from '@aop/shared'
import type { Action } from './actions'
import { combatantStrength, createCombatStats, type CombatStats, type Combatant } from './combat'
import type { ContentCatalog } from './content'
import { cityUnlocksCaptains, unlockedRecruitTier } from './economy'
import { areAllied, captainsOf, currentPlayer } from './game'
import { isWaterTile, mapDistance, mapNeighbors, tileAt, tileIndex } from './map'
import { findLandPath, findPath } from './pathfinding'
import {
  applyAction,
  cityPortDefenders,
  cityToCombatant,
  garrisonCityOf,
  partyLeader,
  partyLedBy,
  partyToCombatant,
} from './reducer'
import { nextFloat, seedRng } from './rng'
import { effectiveShipStats, nextUpgradeCost } from './ships'
import { availableSkillPicks, availableStatPoints, levelForXp } from './skills'
import type {
  AiPersonality,
  Captain,
  CaptainStat,
  CityState,
  GameState,
  LandingParty,
  PlayerState,
} from './types'

/**
 * Single-player AI opponent (#13/#67): a utility-scoring turn player.
 *
 * The AI reads only the game state and emits the very same {@link Action}s a human
 * would, so nothing here is privileged. It is pure and DOM-free — the identical
 * code runs in the browser (chunked so it never blocks the main thread, via
 * {@link nextAiAction}) and, later, inside a Supabase Edge Function.
 *
 * Every call scores every candidate action across the strategic verbs — engage
 * (attack), expand (advance on a beatable target), and the economy verbs
 * (construct, recruit, load a fleet, buy skills/upgrades) — and returns the
 * single best one. `endTurn` is the score-0 fallback when nothing is worth
 * doing. Callers loop this (see {@link runAiTurn}); each call is cheap and
 * deterministic.
 */

/**
 * Fallback scoring constants used only when a match's `GameConfig.aiTuning` is
 * not configured (matches the AI's original, pre-#67 behavior). Real matches
 * always inject an `AiTuning` from @aop/content, which is where these numbers
 * belong; the engine holds none of its own.
 */
const FALLBACK_ENGAGE_MIN_RATIO = 0.9
/**
 * With no tuning configured, the attrition floor equals the engage gate, so the
 * attrition band is empty and the AI behaves exactly as before (#462) — it only
 * assaults cities it expects to win. Real matches inject a lower floor.
 */
const FALLBACK_ATTRITION_MIN_RATIO = FALLBACK_ENGAGE_MIN_RATIO
const FALLBACK_ATTRITION_SCORE_MULT = 0.5
/**
 * With no tuning configured the siege-commitment bonus is 0, so conquest scores
 * exactly as it did pre-#471 (#462 attrition, no stickiness). Real matches inject
 * a positive bonus so a loaded captain presses a reachable siege to the wall.
 */
const FALLBACK_SIEGE_STICKINESS_BONUS = 0
/**
 * With no tuning configured the land-assault premium is 0 and the party-op
 * scores fall back to the same values the sea verbs use, so an unconfigured
 * match plays land ops on the identical (pre-#475) combat-only scale.
 */
const FALLBACK_LAND_ASSAULT_BONUS = 0
const FALLBACK_PARTY_RESCUE_SCORE_BASE = 15
const FALLBACK_REINFORCE_CITY_SCORE_BASE = 60
const FALLBACK_PARTY_THREAT_RADIUS = 3
const FALLBACK_PARTY_THREAT_MIN_RATIO = 0.4
const FALLBACK_ATTACK_SCORE_BASE = 100
const FALLBACK_ADVANCE_SCORE_BASE = 10
const FALLBACK_ADVANCE_DISTANCE_BONUS = 10
/**
 * Recruiting a replacement captain (#308) is existential once a seat has
 * none left — comfortably outscores any economy action so the AI doesn't sit
 * on a full treasury while captain-less.
 */
const FALLBACK_RECRUIT_CAPTAIN_SCORE_BASE = 500
/**
 * Ransom policy (#309): "always ransom when affordable and outnumbered, else
 * wait" — the simple single-player AI policy the issue calls for. Scored
 * between the advance and attack bands: worth doing over idling, but never
 * preferred over a favorable fight.
 */
const FALLBACK_RANSOM_SCORE_BASE = 50

/**
 * Weights and thresholds the AI uses to score candidate actions. Balance data —
 * lives in @aop/content's `tuning.ts` (`AiTuning`/`AI_TUNING`) and is frozen into
 * `GameConfig.aiTuning` for replay/authority determinism, the same injection
 * pattern as {@link CombatStatsData}.
 */
export interface AiTuning {
  engageMinRatio: number
  /**
   * Attrition floor for city assaults (#462): the lowest troops-only strength
   * ratio at which the AI lands an assault it does not expect to win, to thin a
   * garrison that persists between assaults. Strictly below {@link engageMinRatio}.
   */
  attritionMinRatio: number
  /** Score multiplier (<1) on an attrition assault relative to a winning one (#462). */
  attritionScoreMult: number
  /**
   * Siege-commitment bonus (#471): a score bonus added to a conquest
   * approach/assault candidate, scaled by the assault ratio (mine ÷ defenders).
   * Without it a loaded captain's attrition approach scores below the economy
   * verbs, so it dithers at sea instead of pressing a reachable siege — the
   * observed cap of one assault per (attacker, city). Scaling by ratio makes the
   * captain converge on the *softest* reachable target (a garrison already ground
   * down by an earlier wave has the highest ratio) and the pull decays for free as
   * that garrison rebuilds, so the AI sustains successive waves on one city without
   * any cross-turn planner memory. Personality-scaled by `combatScoreMult`.
   */
  siegeStickinessBonus: number
  /**
   * Land-assault premium (#475): a ratio-scaled bonus on the landing-party
   * attrition vector (a captain disembarking to grind a city, and a party
   * pressing an assault it can't yet win). Captain preservation is the point —
   * a failed *sea* attrition assault captures the captain, a failed *land* one
   * only destroys the party — so this tips a loaded captain toward the cheaper
   * land vector. Scoped to the attrition band; personality-scaled by
   * `combatScoreMult` like {@link attackScoreBase}.
   */
  landAssaultBonus: number
  /** Score for re-embarking a purposeless party onto an adjacent friendly ship (#475). */
  partyRescueScoreBase: number
  /** Score for reinforcing a threatened owned city's garrison from a docked captain (#475). */
  reinforceCityScoreBase: number
  /** Map-distance at which a hostile party counts as marching on an owned city (#475). */
  partyThreatRadius: number
  /**
   * Minimum strength a hostile party needs — as a fraction of the city's
   * intrinsic auto-defence (militia + turrets + fortification, garrison
   * excluded) — to count as a threat (#475 audit). Below it the party is too
   * slight to endanger the city, so it neither triggers reinforcement nor
   * freezes the garrison→ship pipeline (without the floor, a single-troop
   * party camped nearby locked a city's logistics forever). The basis is
   * deliberately garrison-independent so the verdict stays stable while
   * reinforce/garrison-to-ship move troops within a turn — a garrison-relative
   * test oscillates: reinforcing un-threatens the city, unloading re-threatens
   * it, looping until the action guard. Scaled by the same personality
   * `engageMinRatioMult` as the other ratio floors.
   */
  partyThreatMinRatio: number
  attackScoreBase: number
  advanceScoreBase: number
  advanceDistanceBonus: number
  minGoldReserve: number
  buildGoldWeight: number
  buildTimberWeight: number
  buildIronWeight: number
  buildRumWeight: number
  buildRecruitTierWeight: number
  buildDefenseBonusWeight: number
  buildShipyardBonus: number
  /**
   * Utility bonus for the building that unlocks captain recruitment (#433).
   * Applied only while the seat is captain-less with no such building anywhere
   * (#439) — see {@link planConstruct}.
   */
  buildTavernBonus: number
  buildScoreScale: number
  recruitScoreBase: number
  recruitSpendFraction: number
  garrisonToShipScoreBase: number
  garrisonReserveFraction: number
  upgradeScoreBase: number
  skillPickScoreBase: number
  /** Score for spending an available captain stat point (#498) — the skill pick's sibling. */
  statPickScoreBase: number
  /**
   * Score for recruiting a replacement captain when captain-less (#308).
   * Not folded into any personality/economy overlay — recovering from zero
   * captains is treated as existential regardless of behavior profile.
   */
  recruitCaptainScoreBase: number
  /** Score for ransoming an eligible captive when outnumbered and affordable (#309). */
  ransomScoreBase: number
}

/**
 * Per-personality weight overlay (#25) folded into {@link AiTuning} before scoring
 * (see {@link effectiveTuning}), so the shared scorer stays personality-agnostic.
 * Balance data — the concrete overlays live in @aop/content (`AI_PERSONALITIES`).
 */
export interface AiPersonalityWeights {
  /** Scales attack + advance scores — appetite for combat. */
  combatScoreMult: number
  /** Scales the engage threshold — <1 fights at worse odds, >1 demands a clearer edge. */
  engageMinRatioMult: number
  /** Scales every economy action's score — construct, recruit, fleet-loading, upgrades, skills. */
  economyScoreMult: number
  /** Scales the gold reserve the AI keeps before spending. */
  minGoldReserveMult: number
}

/**
 * Per-difficulty skill modifier (#25). Balance data — concrete values live in
 * @aop/content (`AI_DIFFICULTIES`).
 */
export interface AiDifficultyModifier {
  /**
   * Probability [0,1) the AI passes over its best move for the next-best one.
   * Rolled from a scratch seed derived from GameState (never GameState.rngState),
   * so it stays deterministic and replay-safe. 0 = always optimal.
   */
  blunderChance: number
  /**
   * Multiplier on per-round income. MUST be 1 for `easy`/`normal` (no resource
   * cheating); `hard` may exceed 1 for a modest economic edge.
   */
  incomeMult: number
}

interface ScoredAction {
  action: Action
  score: number
}

const NEUTRAL_WEIGHTS: AiPersonalityWeights = {
  combatScoreMult: 1,
  engageMinRatioMult: 1,
  economyScoreMult: 1,
  minGoldReserveMult: 1,
}

/**
 * Fold a personality's weight overlay into the base tuning, so the economy
 * planners below need no personality awareness of their own. Combat scalars are
 * folded inline in {@link nextAiAction} (they also cover the no-tuning fallback).
 */
function effectiveTuning(base: AiTuning, weights: AiPersonalityWeights): AiTuning {
  return {
    ...base,
    engageMinRatio: base.engageMinRatio * weights.engageMinRatioMult,
    attackScoreBase: base.attackScoreBase * weights.combatScoreMult,
    advanceScoreBase: base.advanceScoreBase * weights.combatScoreMult,
    advanceDistanceBonus: base.advanceDistanceBonus * weights.combatScoreMult,
    minGoldReserve: base.minGoldReserve * weights.minGoldReserveMult,
    buildScoreScale: base.buildScoreScale * weights.economyScoreMult,
    recruitScoreBase: base.recruitScoreBase * weights.economyScoreMult,
    garrisonToShipScoreBase: base.garrisonToShipScoreBase * weights.economyScoreMult,
    upgradeScoreBase: base.upgradeScoreBase * weights.economyScoreMult,
    skillPickScoreBase: base.skillPickScoreBase * weights.economyScoreMult,
    statPickScoreBase: base.statPickScoreBase * weights.economyScoreMult,
  }
}

/**
 * A [0,1) roll for the difficulty blunder check, derived purely from GameState
 * (action cursor, round, player id) via a scratch RNG. It never reads or advances
 * {@link GameState.rngState}, so replaying an identical log reproduces the identical
 * roll — the same determinism guarantee {@link estimateOdds} relies on.
 */
function blunderRoll(state: GameState, playerId: string): number {
  let h = seedRng(state.actionCount ^ Math.imul(state.round, 0x9e3779b1))
  for (let i = 0; i < playerId.length; i++) {
    h = seedRng(h ^ playerId.charCodeAt(i))
  }
  return nextFloat(h)[1]
}

/**
 * Pick the acting action from the scored candidates. Optimal play returns the
 * highest score (ties keep the earliest-considered candidate, matching the
 * pre-#25 scorer); a blunder returns the runner-up instead — a legal but weaker
 * move, how lower difficulties play suboptimally without ever cheating.
 */
function selectAction(candidates: ScoredAction[], blunder: boolean): Action {
  let best: ScoredAction | undefined
  let second: ScoredAction | undefined
  for (const candidate of candidates) {
    if (!best || candidate.score > best.score) {
      second = best
      best = candidate
    } else if (!second || candidate.score > second.score) {
      second = candidate
    }
  }
  if (blunder && second) return second.action
  return best!.action
}

/**
 * Decide the acting player's next single action. Returns `endTurn` when nothing
 * is worth doing. Callers loop this (see {@link runAiTurn}) and may yield between
 * calls to stay off the main thread — each call is cheap and deterministic.
 */
export function nextAiAction(state: GameState, playerId: string): Action {
  const stats = state.config.combatStats ? createCombatStats(state.config.combatStats) : null
  const baseTuning = state.config.aiTuning
  const catalog = state.config.content
  const myCaptains = captainsOf(state, playerId).filter((c) => !c.captured)
  // Alliance awareness (#25, Phase 3 prep): the AI never targets an ally.
  // Captured captains (#309) are already out of the fight — nothing to engage.
  // Garrisoned and shipless captains (#498) are not naval targets either: the
  // reducer rejects attacking them (assault the city / the party instead).
  const enemies = state.captains.filter(
    (c) =>
      c.ownerId !== playerId &&
      !areAllied(state, playerId, c.ownerId) &&
      !c.captured &&
      !c.shipLost &&
      !garrisonCityOf(state, c.id),
  )
  // Conquest targets (#344): enemy cities the AI may assault or advance on.
  // Allied seats' cities are never targeted — the AI does not betray (#25).
  const enemyCities = state.cities.filter(
    (c) => c.ownerId !== playerId && !areAllied(state, playerId, c.ownerId),
  )

  // Personality overlay (#25): fold the seat's weights into the tuning so the
  // scorers stay personality-agnostic. Combat scalars are folded here directly
  // because they also carry the no-tuning combat-only fallback.
  const profile = state.players.find((p) => p.id === playerId)?.aiProfile
  const weights = personalityWeights(state, profile?.personality)
  const tuning = baseTuning ? effectiveTuning(baseTuning, weights) : undefined

  const engageMinRatio =
    (baseTuning?.engageMinRatio ?? FALLBACK_ENGAGE_MIN_RATIO) * weights.engageMinRatioMult
  // Attrition floor scales with the same personality appetite as the engage gate
  // (an aggressive seat both fights and attrits at worse odds).
  const attritionMinRatio =
    (baseTuning?.attritionMinRatio ?? FALLBACK_ATTRITION_MIN_RATIO) * weights.engageMinRatioMult
  const attritionScoreMult = baseTuning?.attritionScoreMult ?? FALLBACK_ATTRITION_SCORE_MULT
  // Siege commitment scales with the same combat appetite as the attack score: an
  // aggressive seat presses a siege harder, an economic one less so.
  const siegeStickinessBonus =
    (baseTuning?.siegeStickinessBonus ?? FALLBACK_SIEGE_STICKINESS_BONUS) * weights.combatScoreMult
  // Land-assault premium scales with the same combat appetite as the attack
  // score — an aggressive seat commits to the land vector harder (#475).
  const landAssaultBonus =
    (baseTuning?.landAssaultBonus ?? FALLBACK_LAND_ASSAULT_BONUS) * weights.combatScoreMult
  const partyRescueScoreBase = baseTuning?.partyRescueScoreBase ?? FALLBACK_PARTY_RESCUE_SCORE_BASE
  const reinforceCityScoreBase =
    baseTuning?.reinforceCityScoreBase ?? FALLBACK_REINFORCE_CITY_SCORE_BASE
  const partyThreatRadius = baseTuning?.partyThreatRadius ?? FALLBACK_PARTY_THREAT_RADIUS
  // Threat floor scales with the same personality appetite as the other ratio
  // floors: a cautious seat (mult > 1) shrugs off more nuisance parties.
  const partyThreatMinRatio =
    (baseTuning?.partyThreatMinRatio ?? FALLBACK_PARTY_THREAT_MIN_RATIO) *
    weights.engageMinRatioMult
  const attackScoreBase =
    (baseTuning?.attackScoreBase ?? FALLBACK_ATTACK_SCORE_BASE) * weights.combatScoreMult
  const advanceScoreBase =
    (baseTuning?.advanceScoreBase ?? FALLBACK_ADVANCE_SCORE_BASE) * weights.combatScoreMult
  const advanceDistanceBonus =
    (baseTuning?.advanceDistanceBonus ?? FALLBACK_ADVANCE_DISTANCE_BONUS) * weights.combatScoreMult
  const recruitCaptainScoreBase =
    baseTuning?.recruitCaptainScoreBase ?? FALLBACK_RECRUIT_CAPTAIN_SCORE_BASE
  const ransomScoreBase = baseTuning?.ransomScoreBase ?? FALLBACK_RANSOM_SCORE_BASE

  const candidates: ScoredAction[] = [{ action: { type: 'endTurn', playerId }, score: 0 }]
  const consider = (candidate: ScoredAction | null): void => {
    if (candidate) candidates.push(candidate)
  }

  // Scoped to this single call so repeated (captain, goal) route queries within
  // the same turn's candidate scan reuse one A* result instead of recomputing it
  // (#214); discarded once nextAiAction returns, so it carries no engine state.
  const pathCache = new Map<string, Coord[] | null>()

  // Captain-recovery verbs (#308/#309): unlike the economy verbs below, these
  // only need `GameConfig.setup` (not a content catalog) to price their
  // action, so they run regardless of whether `aiTuning` is configured —
  // their *scores* still come from it, falling back like every other score
  // above when it isn't.
  consider(planRecruitCaptain(state, playerId, recruitCaptainScoreBase))
  consider(planRansomCaptain(state, playerId, ransomScoreBase))

  for (const cap of myCaptains) {
    if (cap.movementPoints < 1) continue

    for (const enemy of enemies) {
      const ratio = strengthRatio(cap, enemy, stats)

      // Engage: adjacent and beatable -> attack.
      if (mapDistance(state.map, cap.position, enemy.position) <= 1) {
        if (ratio >= engageMinRatio) {
          consider({
            action: {
              type: 'attackCaptain',
              playerId,
              captainId: cap.id,
              targetCaptainId: enemy.id,
            },
            score: attackScoreBase * ratio,
          })
        }
        continue
      }

      // Expand: advance on a beatable target if a sea route exists.
      if (ratio >= engageMinRatio) {
        const step = stepToward(state, cap, enemy.position, pathCache)
        if (step) {
          // Prefer closing on nearer targets; keep well below any attack score.
          const score =
            advanceScoreBase +
            (1 / (1 + mapDistance(state.map, cap.position, enemy.position))) * advanceDistanceBonus
          consider({
            action: { type: 'moveCaptain', playerId, captainId: cap.id, to: step },
            score,
          })
        }
      }
    }

    // Conquest (#344): a captain carrying troops storms a beatable enemy city
    // when adjacent, or sails toward the nearest one it can beat. A landing
    // force is required — an empty ship can never win an assault — and a city
    // assault is a land board battle, so it only applies when the match has
    // board tuning (matches without it resolve combat naval-only).
    if (stats?.battle && cap.troops.reduce((sum, t) => sum + t.count, 0) > 0) {
      for (const city of enemyCities) {
        const cityFaction = state.players.find((p) => p.id === city.ownerId)?.faction
        const ratio = cityAssaultRatio(state, cap, city, stats, catalog, cityFaction)
        // Attrition warfare (#462): a landing party that can't win outright is
        // still worth landing when it will meaningfully thin a garrison that
        // persists between assaults (recruited-troop casualties stick, and pools
        // replenish only every few rounds — #453), so a later wave or captain
        // finishes the weakened city. `attritionMinRatio` is the cost floor:
        // below it the party is too weak to dent the defenders and would just
        // feed the captain to the turrets. Attrition scores below any winning
        // assault and rises with the ratio, so each successful thinning makes the
        // next wave score higher.
        const winning = ratio >= engageMinRatio
        const attrition = !winning && ratio >= attritionMinRatio
        if (!winning && !attrition) continue
        const combatMult = winning ? 1 : attritionScoreMult
        // Siege commitment (#471): a ratio-scaled bonus that lifts an *attrition*
        // wave (a city the captain can't yet win, combatMult < 1) above the economy
        // verbs, so a loaded captain presses the grind-down instead of dithering at
        // sea — the observed cap of one assault per (attacker, city). Scoped to the
        // attrition case on purpose: a winnable city already scores highly, and
        // adding the bonus there just makes the AI beeline and trade cities in a
        // runaway churn (measured). Ratio scaling biases the captain toward the
        // softest (most ground-down) reachable city and decays the pull as that
        // garrison rebuilds, so successive waves converge on one target with no
        // cross-turn planner memory.
        const siegeBonus = winning ? 0 : siegeStickinessBonus * ratio
        // Land vector (#475): on an attrition wave, if this captain can put a
        // party ashore within overland reach of the city, prefer to — a repelled
        // land assault costs only the party, a repelled sea assault costs the
        // captain. The party then marches and assaults over the next turns
        // (scored in the landing-party loop below). Scoped to attrition: a
        // winnable city is taken immediately and safely by sea, so landing a
        // party first would only delay a capture it does not risk losing.
        if (attrition) {
          const landing = disembarkTileToward(state, cap, city)
          if (landing) {
            consider({
              action: {
                type: 'disembark',
                playerId,
                captainId: cap.id,
                to: landing,
                troops: cap.troops.map((t) => ({ ...t })),
              },
              score: attackScoreBase * ratio * combatMult + siegeBonus + landAssaultBonus * ratio,
            })
          }
        }
        if (mapDistance(state.map, cap.position, city.position) <= 1) {
          consider({
            action: {
              type: 'attackCity',
              playerId,
              captainId: cap.id,
              targetCityId: city.id,
            },
            score: attackScoreBase * ratio * combatMult + siegeBonus,
          })
          continue
        }
        const step = approachCity(state, cap, city, pathCache)
        if (step) {
          const score =
            (advanceScoreBase +
              (1 / (1 + mapDistance(state.map, cap.position, city.position))) *
                advanceDistanceBonus) *
              combatMult +
            siegeBonus
          consider({
            action: { type: 'moveCaptain', playerId, captainId: cap.id, to: step },
            score,
          })
        }
      }
    }
  }

  // Landing-party operations (#475). A party is a land piece: it marches on and
  // assaults enemy cities — the captain-preserving attrition vector, since a
  // repelled land assault costs only the party, not a captain — intercepts an
  // adjacent enemy party, and re-embarks when it has nothing to march on. A land
  // board battle needs board tuning, so the whole block is gated on it. All
  // scoring is derived purely from this turn's state, like the captain loop.
  if (stats?.battle) {
    for (const party of state.parties) {
      if (party.ownerId !== playerId || party.movementPoints < 1) continue
      let hasPurpose = false

      // Intercept (counter, #475): destroy an adjacent enemy party we can beat.
      for (const foe of state.parties) {
        if (foe.ownerId === playerId || areAllied(state, playerId, foe.ownerId)) continue
        if (mapDistance(state.map, party.position, foe.position) > 1) continue
        const ratio = partyVsPartyRatio(state, party, foe, stats)
        if (ratio >= engageMinRatio) {
          hasPurpose = true
          consider({
            action: { type: 'attackParty', playerId, partyId: party.id, targetPartyId: foe.id },
            score: attackScoreBase * ratio,
          })
        }
      }

      // Assault / march on enemy cities — the same attrition/siege machinery the
      // captain uses. The land-assault premium always applies here: a party has
      // no safer sea alternative, so it should press rather than idle.
      for (const city of enemyCities) {
        const cityFaction = state.players.find((p) => p.id === city.ownerId)?.faction
        const ratio = partyCityAssaultRatio(state, party, city, stats, catalog, cityFaction)
        const winning = ratio >= engageMinRatio
        const attrition = !winning && ratio >= attritionMinRatio
        if (!winning && !attrition) continue
        const combatMult = winning ? 1 : attritionScoreMult
        const siegeBonus = winning ? 0 : siegeStickinessBonus * ratio
        const landBonus = landAssaultBonus * ratio
        if (mapDistance(state.map, party.position, city.position) <= 1) {
          hasPurpose = true
          consider({
            action: {
              type: 'partyAssaultCity',
              playerId,
              partyId: party.id,
              targetCityId: city.id,
            },
            score: attackScoreBase * ratio * combatMult + siegeBonus + landBonus,
          })
          continue
        }
        const step = landStepTowardCity(state, party, city)
        if (step) {
          hasPurpose = true
          consider({
            action: { type: 'moveParty', playerId, partyId: party.id, to: step },
            score:
              (advanceScoreBase +
                (1 / (1 + mapDistance(state.map, party.position, city.position))) *
                  advanceDistanceBonus) *
                combatMult +
              siegeBonus +
              landBonus,
          })
        }
      }

      // Logistics (#475): a party with no reachable city and no beatable foe is
      // stranded value — re-embark it onto an adjacent friendly ship with room
      // rather than leave troops idling ashore. Falls back to holding (no
      // candidate) when no ship is beside it, per the stranded-until-rescued rule.
      if (!hasPurpose) {
        consider(planEmbarkParty(state, playerId, party, catalog, partyRescueScoreBase))
      }
    }
  }

  // A city an enemy party is marching on (#475). Recomputed per turn, no memory.
  const threatenedCityIds = threatenedCities(
    state,
    playerId,
    partyThreatRadius,
    partyThreatMinRatio,
    stats,
    catalog,
  )

  // Economy verbs (#67) all need the content catalog and its tuning; without
  // both, the AI plays combat-only, exactly as it did before this feature.
  if (catalog && tuning) {
    consider(planSkillPick(state, playerId, catalog, tuning))
    consider(planStatPick(state, playerId, catalog, tuning))
    consider(planConstruct(state, playerId, catalog, tuning))
    consider(planRecruit(state, playerId, catalog, tuning))
    consider(planGarrisonToShip(state, playerId, catalog, tuning, threatenedCityIds))
    consider(planUpgrade(state, playerId, catalog, tuning))
    // Reinforce a threatened city from a captain docked at it (counter, #475).
    consider(planReinforceCity(state, playerId, threatenedCityIds, reinforceCityScoreBase))
  }

  // Difficulty (#25): a lower-skill seat sometimes takes the runner-up move.
  const difficulty =
    profile && state.config.aiDifficulties
      ? state.config.aiDifficulties[profile.difficulty]
      : undefined
  const blunder = difficulty ? blunderRoll(state, playerId) < difficulty.blunderChance : false
  return selectAction(candidates, blunder)
}

/** The active personality's weights, or the neutral (no-op) overlay when unconfigured. */
function personalityWeights(
  state: GameState,
  personality: AiPersonality | undefined,
): AiPersonalityWeights {
  const table = state.config.aiPersonalities
  if (!personality || !table) return NEUTRAL_WEIGHTS
  return table[personality]
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
 * A captain's assault strength against a city's defenders (#344), scored against
 * the very combatant the reducer resolves via {@link cityToCombatant} — garrison,
 * fortification defense bonus, and the automatic militia and turrets (#435). The
 * militia mean an "empty" city is no longer a free capture, so the AI stops
 * throwing hopeless landing forces at one. The attacker's ship is excluded from
 * its own strength (#442): the assault resolves on the land board where the ship
 * never fights, and counting its hull/cannons made the AI storm cities its
 * landing party alone could not take — a failed assault costs the captain.
 * Infinity only when there are no stats to judge by, or the defender's strength
 * is truly zero. The caller has already verified the captain carries troops.
 */
function cityAssaultRatio(
  state: GameState,
  cap: Captain,
  city: CityState,
  stats: CombatStats | null,
  content: ContentCatalog | undefined,
  factionId: string | undefined,
): number {
  return combatantVsCityRatio(
    state,
    { ...toCombatant(cap), shipStats: { hull: 0, cannons: 0, speed: 0 } },
    city,
    stats,
    content,
    factionId,
  )
}

/**
 * A landing party's assault strength against a city's defenders (#475), scored
 * against the exact {@link cityToCombatant} the reducer resolves — the same
 * troops-only comparison {@link cityAssaultRatio} makes for a captain, so land
 * and sea assaults share one attrition/siege scale. The caller has verified the
 * party carries troops (parties are never empty).
 */
function partyCityAssaultRatio(
  state: GameState,
  party: LandingParty,
  city: CityState,
  stats: CombatStats | null,
  content: ContentCatalog | undefined,
  factionId: string | undefined,
): number {
  return combatantVsCityRatio(
    state,
    partyToCombatant(party, partyLeader(state, party), content),
    city,
    stats,
    content,
    factionId,
  )
}

/**
 * Strength of `mine` against a city's full defence — shared by sea and land
 * assaults. Scores against the exact defender the reducer resolves, port
 * defenders (#498) included, so a garrisoned harbor reads as harder to crack.
 */
function combatantVsCityRatio(
  state: GameState,
  mine: Combatant,
  city: CityState,
  stats: CombatStats | null,
  content: ContentCatalog | undefined,
  factionId: string | undefined,
): number {
  if (!stats) return Infinity
  const attacker = combatantStrength(mine, stats)
  const garrison = combatantStrength(
    cityToCombatant(city, content, factionId, cityPortDefenders(state, city)),
    stats,
  )
  if (garrison <= 0) return Infinity
  return attacker / garrison
}

/** Strength ratio of two landing parties (#475): troops plus any leading captain's bonuses (#498). */
function partyVsPartyRatio(
  state: GameState,
  mine: LandingParty,
  foe: LandingParty,
  stats: CombatStats,
): number {
  const content = state.config.content
  const foeStrength = combatantStrength(partyToCombatant(foe, partyLeader(state, foe), content), stats) // prettier-ignore
  if (foeStrength <= 0) return Infinity
  return (
    combatantStrength(partyToCombatant(mine, partyLeader(state, mine), content), stats) /
    foeStrength
  )
}

/** Tile indices every landing party currently occupies — the overland block set (#475). */
function partyTileBlocks(state: GameState, exceptId?: string): Set<number> {
  return new Set(
    state.parties
      .filter((p) => p.id !== exceptId)
      .map((p) => tileIndex(state.map, p.position.x, p.position.y)),
  )
}

/** The land tiles bordering a city — a landing party's assault squares (#475). */
function cityLandApproaches(state: GameState, city: CityState): Coord[] {
  return mapNeighbors(state.map, city.position).filter((n) => tileAt(state.map, n)?.type === 'land')
}

/**
 * The empty land tile adjacent to `cap` from which `city` is nearest overland
 * (#475) — the staging square for putting a party ashore. Returns null when the
 * captain is not beside the target's landmass, or every candidate tile is
 * occupied by a party or walled off from the city by water. Matches the
 * disembark reducer's rule that a party lands only on empty land.
 */
function disembarkTileToward(state: GameState, cap: Captain, city: CityState): Coord | null {
  const occupied = partyTileBlocks(state)
  const approaches = cityLandApproaches(state, city)
  if (approaches.length === 0) return null
  let best: { tile: Coord; dist: number } | null = null
  for (const tile of mapNeighbors(state.map, cap.position)) {
    if (tileAt(state.map, tile)?.type !== 'land') continue
    if (occupied.has(tileIndex(state.map, tile.x, tile.y))) continue
    const dist = overlandDistance(state, tile, city, approaches, occupied)
    if (dist === null) continue
    if (!best || dist < best.dist) best = { tile, dist }
  }
  return best?.tile ?? null
}

/** Shortest overland march-cost from `from` to a tile bordering `city`, or null if unreachable. */
function overlandDistance(
  state: GameState,
  from: Coord,
  city: CityState,
  approaches: Coord[],
  blocked: ReadonlySet<number>,
): number | null {
  if (mapDistance(state.map, from, city.position) <= 1) return 0
  let best: number | null = null
  for (const target of approaches) {
    if (blocked.has(tileIndex(state.map, target.x, target.y))) continue
    const path = findLandPath(state.map, from, target, blocked)
    if (!path) continue
    const cost = path.length - 1
    if (best === null || cost < best) best = cost
  }
  return best
}

/**
 * The farthest land tile a party can reach this turn along the shortest overland
 * route toward a tile bordering `city` (#475) — the marching analog of
 * {@link approachCity}. The returned tile is a valid {@link MovePartyAction}
 * destination: reachable within the party's movement points and off every other
 * party's tile. Returns null when the city is unreachable overland this turn.
 */
function landStepTowardCity(state: GameState, party: LandingParty, city: CityState): Coord | null {
  const blocked = partyTileBlocks(state, party.id)
  let best: { step: Coord; dist: number } | null = null
  for (const target of cityLandApproaches(state, city)) {
    if (blocked.has(tileIndex(state.map, target.x, target.y))) continue
    const path = findLandPath(state.map, party.position, target, blocked)
    if (!path || path.length < 2) continue
    const idx = Math.min(party.movementPoints, path.length - 1)
    if (idx < 1) continue
    const step = path[idx]!
    const dist = mapDistance(state.map, step, city.position)
    if (!best || dist < best.dist) best = { step, dist }
  }
  return best?.step ?? null
}

/**
 * Re-embark a purposeless party (#475): board it onto a friendly, un-captured
 * captain's ship on an adjacent water tile with spare crew room. Returns null
 * when no such ship is beside it — the party then holds (stranded until rescued).
 */
function planEmbarkParty(
  state: GameState,
  playerId: string,
  party: LandingParty,
  catalog: ContentCatalog | undefined,
  score: number,
): ScoredAction | null {
  // A captain-led party (#498) only re-boards its own ship; the AI never leads
  // one today, but skip defensively so a mixed state can't crash the turn.
  if (party.captainId !== undefined) return null
  for (const cap of state.captains) {
    if (cap.ownerId !== playerId || cap.captured || cap.shipLost) continue
    if (partyLedBy(state, cap.id)) continue
    if (mapDistance(state.map, cap.position, party.position) !== 1) continue
    const shipDef = catalog?.ships[cap.shipClassId]
    const capacity = shipDef ? effectiveShipStats(shipDef, cap.shipUpgrades).crewCapacity : Infinity
    const aboard = cap.troops.reduce((sum, t) => sum + t.count, 0)
    if (capacity - aboard <= 0) continue
    return {
      action: { type: 'embark', playerId, partyId: party.id, captainId: cap.id },
      score,
    }
  }
  return null
}

/**
 * Ids of owned cities a *dangerous* hostile (non-allied) party is marching on:
 * within `radius`, and at least `minRatio` of the city's intrinsic auto-defence
 * strength — militia, turrets and fortification, garrison excluded (#475 audit).
 * The size floor stops a trivial party from freezing a city's garrison→ship
 * pipeline forever; the garrison-independent basis keeps the verdict stable
 * while reinforce/garrison-to-ship move troops within a turn (see
 * {@link AiTuning.partyThreatMinRatio}). With no combat stats there is no way
 * to judge size, so any party in radius counts — the defensively-safe reading.
 */
function threatenedCities(
  state: GameState,
  playerId: string,
  radius: number,
  minRatio: number,
  stats: CombatStats | null,
  catalog: ContentCatalog | undefined,
): Set<string> {
  const foes = state.parties.filter(
    (p) => p.ownerId !== playerId && !areAllied(state, playerId, p.ownerId),
  )
  const threatened = new Set<string>()
  if (foes.length === 0) return threatened
  const myFaction = state.players.find((p) => p.id === playerId)?.faction
  for (const city of state.cities) {
    if (city.ownerId !== playerId) continue
    const near = foes.filter((p) => mapDistance(state.map, p.position, city.position) <= radius)
    if (near.length === 0) continue
    if (!stats) {
      threatened.add(city.id)
      continue
    }
    const basis = combatantStrength(
      cityToCombatant({ ...city, garrison: {} }, catalog, myFaction),
      stats,
    )
    if (
      near.some(
        (p) =>
          combatantStrength(partyToCombatant(p, partyLeader(state, p), catalog), stats) >=
          minRatio * basis,
      )
    ) {
      threatened.add(city.id)
    }
  }
  return threatened
}

/**
 * Reinforce a threatened city (counter, #475): hand a docked captain's troops to
 * its garrison so the auto-defence it faces is thicker when the enemy party
 * strikes. Fires only for cities in {@link threatenedCities} with a friendly,
 * un-captured captain docked (within one tile) carrying troops. Transfers one
 * unit stack; the planner re-fires next action until the captain is empty, so a
 * whole cargo can be committed to a defence over a single turn.
 */
function planReinforceCity(
  state: GameState,
  playerId: string,
  threatened: ReadonlySet<string>,
  score: number,
): ScoredAction | null {
  if (threatened.size === 0) return null
  for (const city of state.cities) {
    if (!threatened.has(city.id)) continue
    const captain = state.captains.find(
      (c) =>
        c.ownerId === playerId &&
        !c.captured &&
        mapDistance(state.map, c.position, city.position) <= 1 &&
        c.troops.some((t) => t.count > 0),
    )
    if (!captain) continue
    const stack = captain.troops.find((t) => t.count > 0)!
    return {
      action: {
        type: 'transferTroops',
        playerId,
        cityId: city.id,
        captainId: captain.id,
        direction: 'toGarrison',
        unitId: stack.unitId,
        count: stack.count,
      },
      score,
    }
  }
  return null
}

/**
 * The farthest tile a captain can reach this turn along the sea route toward the
 * nearest water tile bordering `city` — the staging square from which it can
 * assault next turn. Unlike {@link stepToward} (which stops a tile short, to end
 * adjacent to a water target), this lands the captain on the shore tile itself.
 * Returns null when no water borders the city or none is reachable.
 */
function approachCity(
  state: GameState,
  cap: Captain,
  city: CityState,
  cache: Map<string, Coord[] | null>,
): Coord | null {
  let best: { step: Coord; dist: number } | null = null
  for (const shore of mapNeighbors(state.map, city.position)) {
    if (!isWaterTile(tileAt(state.map, shore))) continue
    if (mapDistance(state.map, cap.position, shore) === 0) continue
    const key = `${cap.position.x},${cap.position.y}:${shore.x},${shore.y}`
    let path = cache.get(key)
    if (path === undefined) {
      path = findPath(state.map, cap.position, shore)
      cache.set(key, path)
    }
    if (!path || path.length < 2) continue
    const idx = Math.min(cap.movementPoints, path.length - 1)
    if (idx < 1) continue
    const step = path[idx]!
    const dist = mapDistance(state.map, step, city.position)
    if (!best || dist < best.dist) best = { step, dist }
  }
  return best?.step ?? null
}

/**
 * The furthest tile along the sea route toward `goal` the captain can reach this
 * turn, stopping one tile short of the goal (so it ends adjacent, ready to
 * attack, rather than stacking on top of the target). Returns null if no route.
 * `cache` (see {@link nextAiAction}) memoizes repeated (position, goal) queries
 * within a single candidate scan.
 */
function stepToward(
  state: GameState,
  cap: Captain,
  goal: Coord,
  cache?: Map<string, Coord[] | null>,
): Coord | null {
  const key = `${cap.position.x},${cap.position.y}:${goal.x},${goal.y}`
  let path = cache?.get(key)
  if (path === undefined) {
    path = findPath(state.map, cap.position, goal)
    cache?.set(key, path)
  }
  if (!path || path.length < 2) return null
  // path[0] is the captain's current tile; the last tile is the goal itself.
  const maxIndex = Math.min(cap.movementPoints, path.length - 2)
  if (maxIndex < 1) return null
  return path[maxIndex]!
}

function requirePlayer(state: GameState, playerId: string): PlayerState {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error(`Unknown player ${playerId}`)
  return player
}

/**
 * Pick which owned city to recruit a captain at (#373): the one closest to the
 * front — the nearest enemy city or live enemy captain — so replacements spawn
 * where the fighting is, not at whichever city happened to sort first. Ties
 * break on lowest city id for replay-stable determinism. Only cities that
 * border open water are eligible, since `recruitCaptain` spawns the hull on an
 * adjacent water tile; a landlocked conquest can't launch one. When a content
 * catalog is configured, cities without a tavern are excluded too (#433) —
 * proposing a recruitCaptain the reducer would reject would crash the AI's
 * turn instead of just skipping it. Returns null when the seat owns no
 * eligible city.
 */
function bestRecruitCity(
  state: GameState,
  playerId: string,
  catalog: ContentCatalog | undefined,
): CityState | null {
  const eligible = state.cities.filter(
    (c) =>
      c.ownerId === playerId &&
      mapNeighbors(state.map, c.position).some((n) => isWaterTile(tileAt(state.map, n))) &&
      (!catalog || cityUnlocksCaptains(c, catalog)),
  )
  if (eligible.length === 0) return null

  const frontPoints = [
    ...state.cities.filter((c) => c.ownerId !== playerId).map((c) => c.position),
    ...state.captains.filter((c) => c.ownerId !== playerId && !c.captured).map((c) => c.position),
  ]
  const distToFront = (city: CityState): number =>
    frontPoints.length === 0
      ? 0
      : Math.min(...frontPoints.map((p) => mapDistance(state.map, city.position, p)))

  return [...eligible].sort((a, b) => {
    const da = distToFront(a)
    const db = distToFront(b)
    if (da !== db) return da - db
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })[0]!
}

/**
 * Recruit-when-desperate (#308): once a seat has no live captain left, mint
 * (or, if one is eligible, rehire) one from an owned port — the AI's own
 * escape from the coin-flip loss #308 fixed. Only fires while captain-less;
 * a seat with a live captain builds its fleet through combat/advance scoring
 * instead of proactively stacking captains.
 */
function planRecruitCaptain(
  state: GameState,
  playerId: string,
  scoreBase: number,
): ScoredAction | null {
  const liveCaptains = captainsOf(state, playerId).filter((c) => !c.captured)
  if (liveCaptains.length > 0) return null
  const city = bestRecruitCity(state, playerId, state.config.content)
  if (!city) return null

  const player = requirePlayer(state, playerId)
  const setup = state.config.setup
  const cost = Math.ceil(
    setup.recruitCaptainBaseCost * setup.recruitCaptainCostGrowth ** liveCaptains.length,
  )
  if (!canAfford(player.resources, { gold: cost })) return null

  const eligibleCaptive = state.captains.find(
    (c) =>
      c.ownerId === playerId &&
      c.captured &&
      c.captivityReturnRound !== undefined &&
      state.round >= c.captivityReturnRound,
  )
  return {
    action: eligibleCaptive
      ? { type: 'recruitCaptain', playerId, cityId: city.id, captainId: eligibleCaptive.id }
      : { type: 'recruitCaptain', playerId, cityId: city.id },
    score: scoreBase,
  }
}

/**
 * Ransom policy (#309): "always ransom when affordable and outnumbered, else
 * wait" — the simple single-player AI policy the issue calls for. Ransoms
 * the cheapest-to-free captive (lowest XP) when this seat fields fewer live
 * captains than the best-fielded living rival. Captives already eligible for
 * `recruitCaptain` (ransomed earlier, or captivity served out) are excluded
 * (#439): ransoming one again is legal but buys nothing — the AI was observed
 * paying its captor over and over for the same captive.
 */
function planRansomCaptain(
  state: GameState,
  playerId: string,
  scoreBase: number,
): ScoredAction | null {
  const myCaptives = state.captains.filter(
    (c) =>
      c.ownerId === playerId &&
      c.captured &&
      !(c.captivityReturnRound !== undefined && state.round >= c.captivityReturnRound),
  )
  if (myCaptives.length === 0) return null

  const myLive = captainsOf(state, playerId).filter((c) => !c.captured).length
  const enemyMaxLive = Math.max(
    0,
    ...state.players
      .filter((p) => p.id !== playerId && !p.eliminated)
      .map((p) => state.captains.filter((c) => c.ownerId === p.id && !c.captured).length),
  )
  if (myLive >= enemyMaxLive) return null

  const player = requirePlayer(state, playerId)
  const setup = state.config.setup
  const cheapest = [...myCaptives].sort((a, b) => a.xp - b.xp)[0]!
  const cost = Math.ceil(setup.ransomBaseCost + cheapest.xp * setup.ransomXpMultiplier)
  if (!canAfford(player.resources, { gold: cost })) return null

  return {
    action: { type: 'ransomCaptain', playerId, captainId: cheapest.id },
    score: scoreBase,
  }
}

/**
 * A city's not-yet-built options whose prerequisite (if any) is already standing.
 * Excludes `unlocksShipyard` buildings at a landlocked city (#467): the reducer's
 * `construct` rule refuses those (no adjacent water tile), and once parties can
 * capture inland neutral settlements (#475+#467, merged) the AI can come to own
 * one — without this filter, `planConstruct` would propose a shipyard there and
 * every subsequent `applyAction` call would throw.
 */
function constructibleBuildings(
  state: GameState,
  city: CityState,
  catalog: ContentCatalog,
): [string, ContentCatalog['buildings'][string]][] {
  const hasCoastline = mapNeighbors(state.map, city.position).some((n) =>
    isWaterTile(tileAt(state.map, n)),
  )
  return Object.entries(catalog.buildings).filter(([id, def]) => {
    if (city.buildings.includes(id)) return false
    if (def.unlocksShipyard && !hasCoastline) return false
    return !def.requires || city.buildings.includes(def.requires)
  })
}

/** Raw utility of constructing a building: weighted production plus tier/defense/shipyard/tavern value. */
function buildingUtility(
  def: ContentCatalog['buildings'][string],
  tuning: AiTuning,
  tavernBonusApplies: boolean,
): number {
  const produces = def.produces
  return (
    (produces.gold ?? 0) * tuning.buildGoldWeight +
    (produces.timber ?? 0) * tuning.buildTimberWeight +
    (produces.iron ?? 0) * tuning.buildIronWeight +
    (produces.rum ?? 0) * tuning.buildRumWeight +
    (def.unlocksTier ?? 0) * tuning.buildRecruitTierWeight +
    (def.defenseBonus ?? 0) * tuning.buildDefenseBonusWeight +
    (def.unlocksShipyard ? tuning.buildShipyardBonus : 0) +
    (def.unlocksCaptains && tavernBonusApplies ? tuning.buildTavernBonus : 0)
  )
}

/** Construction priority (#67): the highest-utility affordable building across the player's cities. */
function planConstruct(
  state: GameState,
  playerId: string,
  catalog: ContentCatalog,
  tuning: AiTuning,
): ScoredAction | null {
  const player = requirePlayer(state, playerId)
  let best: { cityId: string; buildingId: string; utility: number } | null = null

  // Captain-less recovery (#439): the tavern bonus applies only while the seat
  // is locked out of recruitCaptain entirely — no live captain AND no city that
  // unlocks captains. Then it must outrank every ordinary building (validated
  // against the full tree in the sim harness), because nothing else matters
  // until the seat can sail again. A seat that already holds a tavern, or still
  // has captains, gains nothing existential from one, so the building scores
  // its plain (zero-production) utility and is never built proactively.
  // While captain-less, ordinary construction also may not dip into the
  // comeback captain's price (the same recovery fund planRecruit holds) —
  // observed in sims: steady building otherwise eats the income that should
  // pay for the captain, stretching recovery from ~4 rounds to 15+.
  const captainless = isCaptainless(state, playerId)
  const tavernBonusApplies =
    captainless &&
    !state.cities.some((c) => c.ownerId === playerId && cityUnlocksCaptains(c, catalog))
  const heldResources = captainless
    ? {
        ...player.resources,
        gold: player.resources.gold - state.config.setup.recruitCaptainBaseCost,
      }
    : player.resources

  for (const city of state.cities) {
    if (city.ownerId !== playerId || city.builtThisRound) continue
    for (const [buildingId, def] of constructibleBuildings(state, city, catalog)) {
      const budget = def.unlocksCaptains ? player.resources : heldResources
      if (!canAfford(budget, def.cost)) continue
      const utility = buildingUtility(def, tuning, tavernBonusApplies)
      if (!best || utility > best.utility) best = { cityId: city.id, buildingId, utility }
    }
  }

  if (!best) return null
  return {
    action: { type: 'construct', playerId, cityId: best.cityId, buildingId: best.buildingId },
    score: best.utility * tuning.buildScoreScale,
  }
}

/** No live captain left — the recovery states of #308/#439. */
function isCaptainless(state: GameState, playerId: string): boolean {
  return captainsOf(state, playerId).every((c) => c.captured)
}

/**
 * Recruit-vs-save (#67): spend a bounded fraction of spare gold on the strongest
 * affordable unit. A captain-less seat first sets aside the price of its comeback
 * captain (#439): steady garrison recruiting otherwise pins gold below
 * `recruitCaptainBaseCost` forever — income arrives, troops soak it up, and the
 * seat never returns to sea.
 */
function planRecruit(
  state: GameState,
  playerId: string,
  catalog: ContentCatalog,
  tuning: AiTuning,
): ScoredAction | null {
  const player = requirePlayer(state, playerId)
  const recoveryFund = isCaptainless(state, playerId)
    ? state.config.setup.recruitCaptainBaseCost
    : 0
  const spare = player.resources.gold - tuning.minGoldReserve - recoveryFund
  if (spare <= 0) return null
  const budget = spare * tuning.recruitSpendFraction

  let best: { cityId: string; unitId: string; count: number; value: number } | null = null
  for (const city of state.cities) {
    if (city.ownerId !== playerId) continue
    const tier = unlockedRecruitTier(city, catalog)
    for (const [unitId, def] of Object.entries(catalog.units)) {
      if (def.factionId !== player.faction || def.tier > tier) continue
      if (def.goldCost > budget) continue
      const available = city.unitAvailability[unitId] ?? 0
      if (available <= 0) continue
      const count = Math.max(1, Math.min(available, Math.floor(budget / def.goldCost)))
      const value = def.tier * 1000 + def.attack + def.defense
      if (!best || value > best.value) best = { cityId: city.id, unitId, count, value }
    }
  }

  if (!best) return null
  return {
    action: {
      type: 'recruit',
      playerId,
      cityId: best.cityId,
      unitId: best.unitId,
      count: best.count,
    },
    score: tuning.recruitScoreBase,
  }
}

/** Garrison-vs-fleet (#67): load surplus garrisoned troops onto a docked captain's ship. */
function planGarrisonToShip(
  state: GameState,
  playerId: string,
  catalog: ContentCatalog,
  tuning: AiTuning,
  threatened: ReadonlySet<string>,
): ScoredAction | null {
  let best: { cityId: string; captainId: string; unitId: string; count: number } | null = null

  for (const city of state.cities) {
    if (city.ownerId !== playerId) continue
    // Don't strip a city's defenders while a hostile party is marching on it
    // (#475) — that both undoes a reinforcement and leaves it soft. This also
    // keeps reinforce/garrison-to-ship from oscillating within a single turn.
    if (threatened.has(city.id)) continue
    // Captured captains (#309) cannot act — proposing a transfer to one would
    // be rejected by the reducer and crash the AI's turn.
    const captain = state.captains.find(
      (c) =>
        c.ownerId === playerId &&
        !c.captured &&
        mapDistance(state.map, c.position, city.position) <= 1,
    )
    if (!captain) continue

    const shipDef = catalog.ships[captain.shipClassId]
    const capacity = shipDef
      ? effectiveShipStats(shipDef, captain.shipUpgrades).crewCapacity
      : Infinity
    const aboard = captain.troops.reduce((sum, t) => sum + t.count, 0)
    const room = capacity - aboard
    if (room <= 0) continue

    for (const [unitId, count] of Object.entries(city.garrison)) {
      const reserve = Math.ceil(count * tuning.garrisonReserveFraction)
      const movable = Math.min(count - reserve, room)
      if (movable <= 0) continue
      if (!best || movable > best.count)
        best = { cityId: city.id, captainId: captain.id, unitId, count: movable }
    }
  }

  if (!best) return null
  return {
    action: {
      type: 'transferTroops',
      playerId,
      cityId: best.cityId,
      captainId: best.captainId,
      direction: 'toShip',
      unitId: best.unitId,
      count: best.count,
    },
    score: tuning.garrisonToShipScoreBase,
  }
}

/** Ship upgrades (#67): buy the cheapest affordable upgrade level for a docked captain. */
function planUpgrade(
  state: GameState,
  playerId: string,
  catalog: ContentCatalog,
  tuning: AiTuning,
): ScoredAction | null {
  const player = requirePlayer(state, playerId)
  const spare = player.resources.gold - tuning.minGoldReserve
  if (spare <= 0) return null

  let best: { cityId: string; captainId: string; track: string; cost: number } | null = null
  for (const city of state.cities) {
    if (
      city.ownerId !== playerId ||
      !city.buildings.some((b) => catalog.buildings[b]?.unlocksShipyard)
    ) {
      continue
    }
    for (const captain of state.captains) {
      if (captain.ownerId !== playerId || captain.captured) continue
      if (mapDistance(state.map, captain.position, city.position) > 1) continue
      const ship = catalog.ships[captain.shipClassId]
      if (!ship) continue
      for (const track of Object.keys(ship.upgrades)) {
        const currentLevel = captain.shipUpgrades[track] ?? 0
        const cost = nextUpgradeCost(ship, track, currentLevel)
        if (cost === undefined || cost > spare) continue
        if (!best || cost < best.cost)
          best = { cityId: city.id, captainId: captain.id, track, cost }
      }
    }
  }

  if (!best) return null
  return {
    action: {
      type: 'upgradeShip',
      playerId,
      cityId: best.cityId,
      captainId: best.captainId,
      track: best.track,
    },
    score: tuning.upgradeScoreBase,
  }
}

/** Skill picks (#67): spend an available level-up pick on the highest total combat bonus. */
function planSkillPick(
  state: GameState,
  playerId: string,
  catalog: ContentCatalog,
  tuning: AiTuning,
): ScoredAction | null {
  const player = requirePlayer(state, playerId)

  for (const captain of captainsOf(state, playerId)) {
    if (captain.captured) continue
    if (availableSkillPicks(captain, catalog.captainXpThresholds) < 1) continue
    const level = levelForXp(captain.xp, catalog.captainXpThresholds)

    let bestSkillId: string | null = null
    let bestBonus = -Infinity
    for (const [skillId, def] of Object.entries(catalog.skills)) {
      if (def.factionId !== player.faction || def.tier > level) continue
      if (captain.skills.includes(skillId)) continue
      const bonus = def.attackBonusPct + def.defenseBonusPct
      if (bonus > bestBonus) {
        bestBonus = bonus
        bestSkillId = skillId
      }
    }

    if (bestSkillId) {
      return {
        action: {
          type: 'chooseCaptainSkill',
          playerId,
          captainId: captain.id,
          skillId: bestSkillId,
        },
        score: tuning.skillPickScoreBase,
      }
    }
  }
  return null
}

/**
 * Stat points (#498, v1 policy from the epic): spend an available point on
 * attack while the captain carries troops aboard (it is a fighting hull), on
 * defense otherwise (an empty ship mostly needs to survive). Requires the
 * catalog's stat tuning — without it the reducer rejects the action.
 */
function planStatPick(
  state: GameState,
  playerId: string,
  catalog: ContentCatalog,
  tuning: AiTuning,
): ScoredAction | null {
  if (!catalog.captainStats) return null
  for (const captain of captainsOf(state, playerId)) {
    if (captain.captured) continue
    if (availableStatPoints(captain, catalog.captainXpThresholds) < 1) continue
    const stat: CaptainStat = captain.troops.some((t) => t.count > 0) ? 'attack' : 'defense'
    return {
      action: { type: 'chooseCaptainStat', playerId, captainId: captain.id, stat },
      score: tuning.statPickScoreBase,
    }
  }
  return null
}
