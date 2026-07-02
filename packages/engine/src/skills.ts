import type { ContentCatalog } from './content'
import type { Captain } from './types'

/**
 * Captain skill trees (#21): pure XP/level math plus the combat bonus a
 * captain's chosen skills confer. The bonus is handed to combat.ts as a
 * per-combatant attack/defense percentage (see the reducer's toCombatant), so
 * combat.ts never needs to know anything about captains or skills.
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

export interface CombatBonus {
  attackBonusPct: number
  defenseBonusPct: number
}

/** Sums the attack/defense percentage bonuses of a captain's chosen skills. */
export function captainCombatBonus(captain: Captain, catalog: ContentCatalog): CombatBonus {
  return captain.skills.reduce<CombatBonus>(
    (total, skillId) => {
      const def = catalog.skills[skillId]
      if (!def) return total
      return {
        attackBonusPct: total.attackBonusPct + def.attackBonusPct,
        defenseBonusPct: total.defenseBonusPct + def.defenseBonusPct,
      }
    },
    { attackBonusPct: 0, defenseBonusPct: 0 },
  )
}
