import { canAfford, chebyshevDistance, type Coord } from '@aop/shared'
import type { Action } from './actions'
import { combatantStrength, createCombatStats, type CombatStats } from './combat'
import type { ContentCatalog } from './content'
import { unlockedRecruitTier } from './economy'
import { captainsOf, currentPlayer } from './game'
import { findPath } from './pathfinding'
import { applyAction } from './reducer'
import { effectiveShipStats, nextUpgradeCost } from './ships'
import { availableSkillPicks, levelForXp } from './skills'
import type { Captain, CityState, GameState, PlayerState } from './types'

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
  buildScoreScale: number
  recruitScoreBase: number
  recruitSpendFraction: number
  garrisonToShipScoreBase: number
  garrisonReserveFraction: number
  upgradeScoreBase: number
  skillPickScoreBase: number
}

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
  const tuning = state.config.aiTuning
  const catalog = state.config.content
  const myCaptains = captainsOf(state, playerId)
  const enemies = state.captains.filter((c) => c.ownerId !== playerId)

  const engageMinRatio = tuning?.engageMinRatio ?? FALLBACK_ENGAGE_MIN_RATIO
  const attackScoreBase = tuning?.attackScoreBase ?? FALLBACK_ATTACK_SCORE_BASE
  const advanceScoreBase = tuning?.advanceScoreBase ?? FALLBACK_ADVANCE_SCORE_BASE
  const advanceDistanceBonus = tuning?.advanceDistanceBonus ?? FALLBACK_ADVANCE_DISTANCE_BONUS

  let best: ScoredAction = { action: { type: 'endTurn', playerId }, score: 0 }
  const consider = (candidate: ScoredAction | null): void => {
    if (candidate && candidate.score > best.score) best = candidate
  }

  for (const cap of myCaptains) {
    if (cap.movementPoints < 1) continue

    for (const enemy of enemies) {
      const ratio = strengthRatio(cap, enemy, stats)

      // Engage: adjacent and beatable -> attack.
      if (chebyshevDistance(cap.position, enemy.position) <= 1) {
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
        const step = stepToward(state, cap, enemy.position)
        if (step) {
          // Prefer closing on nearer targets; keep well below any attack score.
          const score =
            advanceScoreBase +
            (1 / (1 + chebyshevDistance(cap.position, enemy.position))) * advanceDistanceBonus
          consider({
            action: { type: 'moveCaptain', playerId, captainId: cap.id, to: step },
            score,
          })
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

function requirePlayer(state: GameState, playerId: string): PlayerState {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error(`Unknown player ${playerId}`)
  return player
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

/** Raw utility of constructing a building: weighted production plus tier/defense/shipyard value. */
function buildingUtility(def: ContentCatalog['buildings'][string], tuning: AiTuning): number {
  const produces = def.produces
  return (
    (produces.gold ?? 0) * tuning.buildGoldWeight +
    (produces.timber ?? 0) * tuning.buildTimberWeight +
    (produces.iron ?? 0) * tuning.buildIronWeight +
    (produces.rum ?? 0) * tuning.buildRumWeight +
    (def.unlocksTier ?? 0) * tuning.buildRecruitTierWeight +
    (def.defenseBonus ?? 0) * tuning.buildDefenseBonusWeight +
    (def.unlocksShipyard ? tuning.buildShipyardBonus : 0)
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
      (c) => c.ownerId === playerId && chebyshevDistance(c.position, city.position) <= 1,
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
      if (chebyshevDistance(captain.position, city.position) > 1) continue
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
