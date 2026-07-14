import type { ContentCatalog } from './content'
import type { Captain } from './types'

/**
 * Captain skill trees (#21) and stat points/items (#498): pure XP/level math
 * plus the combat bonus a captain's chosen skills, spent stat points, and held
 * items confer. The bonus is handed to combat.ts as a per-combatant
 * attack/defense percentage (see the reducer's toCombatant), so combat.ts
 * never needs to know anything about captains, skills, stats, or items.
 */

/** Level reached at `xp`, given the catalog's cumulative-XP thresholds. */
export function levelForXp(xp: number, thresholds: readonly number[]): number {
  let level = 1
  for (let i = 1; i < thresholds.length; i++) {
    if (xp >= thresholds[i]!) level = i + 1
  }
  return level
}

/** How many more skills this captain may choose right now (one pick per level above 1). */
export function availableSkillPicks(captain: Captain, thresholds: readonly number[]): number {
  return Math.max(0, levelForXp(captain.xp, thresholds) - 1 - captain.skills.length)
}

/**
 * How many stat points this captain may spend right now (#498): one per level
 * above 1 — earned in addition to the skill pick — minus the points already
 * spent. Derived, exactly like {@link availableSkillPicks}: no pending state.
 */
export function availableStatPoints(captain: Captain, thresholds: readonly number[]): number {
  const spent = captain.stats.attack + captain.stats.defense + captain.stats.speed
  return Math.max(0, levelForXp(captain.xp, thresholds) - 1 - spent)
}

export interface CombatBonus {
  attackBonusPct: number
  defenseBonusPct: number
}

/**
 * Sums the attack/defense percentage bonuses of a captain's chosen skills,
 * spent stat points (#498, per-point rates from the catalog), and held items.
 * Sources absent from the catalog contribute nothing.
 */
export function captainCombatBonus(captain: Captain, catalog: ContentCatalog): CombatBonus {
  let attackBonusPct = 0
  let defenseBonusPct = 0
  for (const skillId of captain.skills) {
    const def = catalog.skills[skillId]
    if (!def) continue
    attackBonusPct += def.attackBonusPct
    defenseBonusPct += def.defenseBonusPct
  }
  if (catalog.captainStats) {
    attackBonusPct += captain.stats.attack * catalog.captainStats.attackPctPerPoint
    defenseBonusPct += captain.stats.defense * catalog.captainStats.defensePctPerPoint
  }
  if (catalog.items) {
    for (const itemId of captain.items) {
      const def = catalog.items.defs[itemId]
      if (!def) continue
      attackBonusPct += def.attackBonusPct
      defenseBonusPct += def.defenseBonusPct
    }
  }
  return { attackBonusPct, defenseBonusPct }
}

/**
 * Extra movement points this captain regains at refresh (#498): speed stat
 * points times the catalog's per-point rate, plus every held item's speed
 * bonus. Zero without a catalog — no balance data, no bonus.
 */
export function captainSpeedBonus(captain: Captain, catalog: ContentCatalog | undefined): number {
  if (!catalog) return 0
  let bonus = catalog.captainStats
    ? captain.stats.speed * catalog.captainStats.speedMovementPerPoint
    : 0
  if (catalog.items) {
    for (const itemId of captain.items) {
      bonus += catalog.items.defs[itemId]?.speedBonus ?? 0
    }
  }
  return bonus
}
