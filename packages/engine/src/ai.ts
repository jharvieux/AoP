import { canAfford, type Coord } from '@aop/shared'
import type { Action } from './actions'
import { combatantStrength, createCombatStats, type CombatStats } from './combat'
import type { ContentCatalog } from './content'
import { cityUnlocksCaptains, unlockedRecruitTier } from './economy'
import { areAllied, captainsOf, currentPlayer } from './game'
import { isWaterTile, mapDistance, mapNeighbors, tileAt } from './map'
import { findPath } from './pathfinding'
import { applyAction, cityToCombatant } from './reducer'
import { nextFloat, seedRng } from './rng'
import { effectiveShipStats, nextUpgradeCost } from './ships'
import { availableSkillPicks, levelForXp } from './skills'
import type { AiPersonality, Captain, CityState, GameState, PlayerState } from './types'

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
  /** Flat utility bonus for the building that unlocks captain recruitment (#433). */
  buildTavernBonus: number
  buildScoreScale: number
  recruitScoreBase: number
  recruitSpendFraction: number
  garrisonToShipScoreBase: number
  garrisonReserveFraction: number
  upgradeScoreBase: number
  skillPickScoreBase: number
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
  const enemies = state.captains.filter(
    (c) => c.ownerId !== playerId && !areAllied(state, playerId, c.ownerId) && !c.captured,
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
        const ratio = cityAssaultRatio(cap, city, stats, catalog)
        if (mapDistance(state.map, cap.position, city.position) <= 1) {
          if (ratio >= engageMinRatio) {
            consider({
              action: {
                type: 'attackCity',
                playerId,
                captainId: cap.id,
                targetCityId: city.id,
              },
              score: attackScoreBase * ratio,
            })
          }
          continue
        }
        if (ratio >= engageMinRatio) {
          const step = approachCity(state, cap, city, pathCache)
          if (step) {
            const score =
              advanceScoreBase +
              (1 / (1 + mapDistance(state.map, cap.position, city.position))) * advanceDistanceBonus
            consider({
              action: { type: 'moveCaptain', playerId, captainId: cap.id, to: step },
              score,
            })
          }
        }
      }
    }
  }

  // Economy verbs (#67) all need the content catalog and its tuning; without
  // both, the AI plays combat-only, exactly as it did before this feature.
  if (catalog && tuning) {
    consider(planSkillPick(state, playerId, catalog, tuning))
    consider(planConstruct(state, playerId, catalog, tuning))
    consider(planRecruit(state, playerId, catalog, tuning))
    consider(planGarrisonToShip(state, playerId, catalog, tuning))
    consider(planUpgrade(state, playerId, catalog, tuning))
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
 * A captain's assault strength against a city's garrison (#344), including the
 * city's fortification defense bonus via {@link cityToCombatant} so the AI
 * respects walls. Infinity when there are no stats to judge by, or the garrison
 * is empty (a free capture). The caller has already verified the captain carries
 * troops.
 */
function cityAssaultRatio(
  cap: Captain,
  city: CityState,
  stats: CombatStats | null,
  content: ContentCatalog | undefined,
): number {
  if (!stats) return Infinity
  const mine = combatantStrength(toCombatant(cap), stats)
  const garrison = combatantStrength(cityToCombatant(city, content), stats)
  if (garrison <= 0) return Infinity
  return mine / garrison
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
 * captains than the best-fielded living rival.
 */
function planRansomCaptain(
  state: GameState,
  playerId: string,
  scoreBase: number,
): ScoredAction | null {
  const myCaptives = state.captains.filter((c) => c.ownerId === playerId && c.captured)
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

/** A city's not-yet-built options whose prerequisite (if any) is already standing. */
function constructibleBuildings(
  city: CityState,
  catalog: ContentCatalog,
): [string, ContentCatalog['buildings'][string]][] {
  return Object.entries(catalog.buildings).filter(([id, def]) => {
    if (city.buildings.includes(id)) return false
    return !def.requires || city.buildings.includes(def.requires)
  })
}

/** Raw utility of constructing a building: weighted production plus tier/defense/shipyard/tavern value. */
function buildingUtility(def: ContentCatalog['buildings'][string], tuning: AiTuning): number {
  const produces = def.produces
  return (
    (produces.gold ?? 0) * tuning.buildGoldWeight +
    (produces.timber ?? 0) * tuning.buildTimberWeight +
    (produces.iron ?? 0) * tuning.buildIronWeight +
    (produces.rum ?? 0) * tuning.buildRumWeight +
    (def.unlocksTier ?? 0) * tuning.buildRecruitTierWeight +
    (def.defenseBonus ?? 0) * tuning.buildDefenseBonusWeight +
    (def.unlocksShipyard ? tuning.buildShipyardBonus : 0) +
    (def.unlocksCaptains ? tuning.buildTavernBonus : 0)
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

  for (const city of state.cities) {
    if (city.ownerId !== playerId || city.builtThisRound) continue
    for (const [buildingId, def] of constructibleBuildings(city, catalog)) {
      if (!canAfford(player.resources, def.cost)) continue
      const utility = buildingUtility(def, tuning)
      if (!best || utility > best.utility) best = { cityId: city.id, buildingId, utility }
    }
  }

  if (!best) return null
  return {
    action: { type: 'construct', playerId, cityId: best.cityId, buildingId: best.buildingId },
    score: best.utility * tuning.buildScoreScale,
  }
}

/** Recruit-vs-save (#67): spend a bounded fraction of spare gold on the strongest affordable unit. */
function planRecruit(
  state: GameState,
  playerId: string,
  catalog: ContentCatalog,
  tuning: AiTuning,
): ScoredAction | null {
  const player = requirePlayer(state, playerId)
  const spare = player.resources.gold - tuning.minGoldReserve
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
): ScoredAction | null {
  let best: { cityId: string; captainId: string; unitId: string; count: number } | null = null

  for (const city of state.cities) {
    if (city.ownerId !== playerId) continue
    const captain = state.captains.find(
      (c) => c.ownerId === playerId && mapDistance(state.map, c.position, city.position) <= 1,
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
      if (captain.ownerId !== playerId) continue
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
