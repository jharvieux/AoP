import { FACTIONS, buildingDisplayName, type BuildingDef } from '@aop/content'
import { canAfford, type FactionId, type ResourcePool } from '@aop/shared'

/**
 * Pure helpers behind the town-hall build modal and building tooltips
 * (#430/#431), split from the modal components so the requirement/description
 * logic is unit-testable without rendering.
 */

/**
 * Why `def` can't be constructed in this city right now, as the human-readable
 * reason the build modal shows next to a greyed-out entry — or null when it's
 * buildable. Mirrors the engine's `construct` reducer checks exactly (prereq,
 * one build per round, cost); the reducer stays the enforcer.
 */
export function buildUnavailableReason(
  def: BuildingDef,
  faction: FactionId,
  city: { buildings: readonly string[]; builtThisRound: boolean },
  resources: ResourcePool,
): string | null {
  if (city.buildings.includes(def.id)) return 'Already built'
  if (def.requires && !city.buildings.includes(def.requires))
    return `Requires ${buildingDisplayName(def.requires, faction)}`
  if (city.builtThisRound) return 'Already built this round'
  if (!canAfford(resources, def.cost)) return 'Not enough resources'
  return null
}

/**
 * Data-derived function lines for a building's tooltip (#430): production,
 * defense, and recruitment figures come from the def's own data fields so the
 * tooltip can never drift from what the engine applies, and recruitment
 * buildings name the faction's actual units for their tier. `unitName` is the
 * theme resolver (useTheme) so theme packs rename units here too.
 */
export function buildingFacts(
  def: BuildingDef,
  faction: FactionId,
  unitName: (id: string, fallback: string) => string = (_, fallback) => fallback,
): string[] {
  const facts: string[] = []
  for (const [resource, amount] of Object.entries(def.produces)) {
    if (amount) facts.push(`Produces ${amount} ${resource} per round`)
  }
  if (def.unlocksTier) {
    const units = FACTIONS[faction].units.filter((u) => u.tier === def.unlocksTier)
    if (units.length > 0) {
      facts.push(`Recruits: ${units.map((u) => unitName(u.id, u.name)).join(', ')}`)
    }
  }
  if (def.defenseBonus) facts.push(`+${def.defenseBonus} city defense during assaults`)
  if (def.unlocksShipyard) facts.push('Enables ship refits for docked captains')
  if (def.unlocksCaptains) facts.push('Enables captain hiring and management')
  return facts
}
