import type { ContentCatalog } from './content'
import type { Captain, CaptainStats } from './types'

/**
 * Captain skill trees (#21) and stat points/items (#498): pure XP/level math
 * plus the combat bonus a captain's chosen skills, spent stat points, and held
 * items confer. Skills stay percentages; stat points (level-up picks plus item
 * boosts) are flat per-unit adds. Both channels are handed to combat.ts on the
 * combatant (see the reducer's toCombatant), so combat.ts never needs to know
 * anything about captains, skills, stats, or items.
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
  /** Flat attack added to every unit under this captain, before percentage scaling. */
  attackFlatBonus: number
  /** Flat defense added to every unit under this captain, before percentage scaling. */
  defenseFlatBonus: number
}

/**
 * A captain's effective stats (#498): level-up-spent points plus the boosts of
 * every CARRIED item — carried is equipped, all 8 hold slots are live; stash
 * items are inert. The single aggregation point: the reducer, the AI, the
 * battle board, and the UI all derive combat/speed effects from this, so they
 * can never disagree on what a captain's items are worth.
 */
export function effectiveCaptainStats(
  captain: Captain,
  catalog: ContentCatalog | undefined,
): CaptainStats {
  const stats = { ...captain.stats }
  if (catalog?.items) {
    for (const itemId of captain.items) {
      const def = catalog.items.defs[itemId]
      if (!def) continue
      stats.attack += def.stats.attack
      stats.defense += def.stats.defense
      stats.speed += def.stats.speed
    }
  }
  return stats
}

/**
 * The combat bonus a captain confers on every unit under their command:
 * percentage channel from chosen skills, flat per-unit channel from effective
 * attack/defense stats (level-up points + carried-item boosts, per-point
 * amounts from the catalog). Sources absent from the catalog contribute
 * nothing. Combat applies flat before percent:
 * `(unit.attack + flat) * (1 + pct/100)`.
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
  let attackFlatBonus = 0
  let defenseFlatBonus = 0
  if (catalog.captainStats) {
    const stats = effectiveCaptainStats(captain, catalog)
    attackFlatBonus = stats.attack * catalog.captainStats.attackPerPoint
    defenseFlatBonus = stats.defense * catalog.captainStats.defensePerPoint
  }
  return { attackBonusPct, defenseBonusPct, attackFlatBonus, defenseFlatBonus }
}

/**
 * Extra movement points this captain regains at refresh (#498): effective
 * speed (stat points + carried-item boosts) times the catalog's per-point
 * rate. Read only at refresh, so an item taken mid-turn moves the ship from
 * the NEXT refresh — never retroactively this turn. Zero without a catalog —
 * no balance data, no bonus.
 */
export function captainSpeedBonus(captain: Captain, catalog: ContentCatalog | undefined): number {
  if (!catalog?.captainStats) return 0
  return effectiveCaptainStats(captain, catalog).speed * catalog.captainStats.speedMovementPerPoint
}
