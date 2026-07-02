import type { ContentCatalog } from './content'
import type { CaptainState } from './types'

/**
 * Captain skill trees (#21): pure XP/level math plus the mechanism that
 * applies a captain's chosen skill bonuses to combat — without combat.ts
 * needing to know anything about captains or skills. `boostedCatalog()`
 * scales only the acting captain's own faction roster, so it composes with
 * the existing (faction-scoped) unit-id catalog untouched.
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
export function availableSkillPicks(captain: CaptainState, thresholds: readonly number[]): number {
  return Math.max(0, levelForXp(captain.xp, thresholds) - 1 - captain.skills.length)
}

export interface CombatBonus {
  attackBonusPct: number
  defenseBonusPct: number
}

/** Sums the attack/defense percentage bonuses of a captain's chosen skills. */
export function captainCombatBonus(captain: CaptainState, catalog: ContentCatalog): CombatBonus {
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

/**
 * A copy of `catalog` with `factionId`'s units scaled by `bonus` — the
 * mechanism combat.ts's totalAttackPower stays unmodified while a captain's
 * skill bonuses still apply, and only to their own faction's roster (unit
 * ids don't overlap across factions, so other factions pass through as-is).
 */
export function boostedCatalog(
  catalog: ContentCatalog,
  bonus: CombatBonus,
  factionId: string,
): ContentCatalog {
  if (bonus.attackBonusPct === 0 && bonus.defenseBonusPct === 0) return catalog
  return {
    ...catalog,
    units: Object.fromEntries(
      Object.entries(catalog.units).map(([id, def]) => [
        id,
        def.factionId === factionId
          ? {
              ...def,
              attack: Math.max(0, Math.round(def.attack * (1 + bonus.attackBonusPct / 100))),
              defense: Math.max(0, Math.round(def.defense * (1 + bonus.defenseBonusPct / 100))),
            }
          : def,
      ]),
    ),
  }
}
