import type { FactionId } from '@aop/shared'

/**
 * Captain skill trees (#21): a captain earns XP from combat (drilling and,
 * later, real engagements) and exploration, leveling up to unlock one skill
 * pick per level above 1. Bonuses are percentage modifiers the engine's
 * `boostedCatalog()` applies to that captain's own faction roster before
 * combat — all the numbers live here, never hardcoded in @aop/engine.
 */

export type SkillCategory = 'gunnery' | 'boarding' | 'navigation' | 'plunder'

export interface SkillDef {
  id: string
  name: string
  description: string
  factionId: FactionId
  category: SkillCategory
  /** Unlocked once the captain reaches this level. */
  tier: 1 | 2 | 3 | 4
  attackBonusPct: number
  defenseBonusPct: number
}

/** Cumulative XP required to *be* at level N (1-based; index 0 is level 1's floor, 0). */
export const CAPTAIN_XP_THRESHOLDS: readonly number[] = [0, 150, 400, 800, 1400]

/** XP a captain earns for a decisive drill win — the only combat XP source until real ship-to-ship combat (#4/#12/#18) lands. */
export const DRILL_WIN_XP = 40

function tree(factionId: FactionId, entries: readonly Omit<SkillDef, 'factionId'>[]): SkillDef[] {
  return entries.map((e) => ({ ...e, factionId }))
}

const PIRATES_TREE = tree('pirates', [
  {
    id: 'pirates-gunnery-1',
    name: 'Broadside Drill',
    description: 'Sharper volleys: +10% attack.',
    category: 'gunnery',
    tier: 1,
    attackBonusPct: 10,
    defenseBonusPct: 0,
  },
  {
    id: 'pirates-boarding-1',
    name: 'Cutlass Rush',
    description: 'Boarding fury: +15% attack.',
    category: 'boarding',
    tier: 2,
    attackBonusPct: 15,
    defenseBonusPct: 0,
  },
  {
    id: 'pirates-navigation-1',
    name: 'Reef Runner',
    description: 'Nimble hulls dodge return fire: +10% defense.',
    category: 'navigation',
    tier: 3,
    attackBonusPct: 0,
    defenseBonusPct: 10,
  },
  {
    id: 'pirates-plunder-1',
    name: "Corsair's Greed",
    description: 'Ruthless raiding: +10% attack, +5% defense.',
    category: 'plunder',
    tier: 4,
    attackBonusPct: 10,
    defenseBonusPct: 5,
  },
])

const BRITISH_TREE = tree('british', [
  {
    id: 'british-gunnery-1',
    name: 'Line Discipline',
    description: 'Volley timing drilled to the second: +12% attack.',
    category: 'gunnery',
    tier: 1,
    attackBonusPct: 12,
    defenseBonusPct: 0,
  },
  {
    id: 'british-navigation-1',
    name: 'Naval Ensign',
    description: 'Royal Navy seamanship: +12% defense.',
    category: 'navigation',
    tier: 2,
    attackBonusPct: 0,
    defenseBonusPct: 12,
  },
  {
    id: 'british-boarding-1',
    name: 'Marine Detachment',
    description: 'Trained boarders: +10% attack, +5% defense.',
    category: 'boarding',
    tier: 3,
    attackBonusPct: 10,
    defenseBonusPct: 5,
  },
  {
    id: 'british-plunder-1',
    name: 'Prize Crew',
    description: 'Practiced at taking prizes cleanly: +8% attack, +8% defense.',
    category: 'plunder',
    tier: 4,
    attackBonusPct: 8,
    defenseBonusPct: 8,
  },
])

const SPANISH_TREE = tree('spanish', [
  {
    id: 'spanish-navigation-1',
    name: 'Treasure Fleet Drill',
    description: 'Escort formation discipline: +12% defense.',
    category: 'navigation',
    tier: 1,
    attackBonusPct: 0,
    defenseBonusPct: 12,
  },
  {
    id: 'spanish-boarding-1',
    name: 'Conquistador Zeal',
    description: 'Heavy-armored boarders: +12% attack.',
    category: 'boarding',
    tier: 2,
    attackBonusPct: 12,
    defenseBonusPct: 0,
  },
  {
    id: 'spanish-gunnery-1',
    name: 'Tercio Volley',
    description: 'Massed cannon fire: +10% attack, +5% defense.',
    category: 'gunnery',
    tier: 3,
    attackBonusPct: 10,
    defenseBonusPct: 5,
  },
  {
    id: 'spanish-plunder-1',
    name: "King's Ransom",
    description: 'Every prize serves the crown: +8% attack, +8% defense.',
    category: 'plunder',
    tier: 4,
    attackBonusPct: 8,
    defenseBonusPct: 8,
  },
])

const DUTCH_TREE = tree('dutch', [
  {
    id: 'dutch-navigation-1',
    name: 'VOC Seamanship',
    description: 'Merchant-company sailing discipline: +14% defense.',
    category: 'navigation',
    tier: 1,
    attackBonusPct: 0,
    defenseBonusPct: 14,
  },
  {
    id: 'dutch-gunnery-1',
    name: 'Sea Beggar Volley',
    description: 'Coordinated cannon crews: +10% attack.',
    category: 'gunnery',
    tier: 2,
    attackBonusPct: 10,
    defenseBonusPct: 0,
  },
  {
    id: 'dutch-boarding-1',
    name: 'Company Muster',
    description: 'Well-drilled boarding parties: +8% attack, +6% defense.',
    category: 'boarding',
    tier: 3,
    attackBonusPct: 8,
    defenseBonusPct: 6,
  },
  {
    id: 'dutch-plunder-1',
    name: 'Company Ledger',
    description: 'Nothing of value goes uncounted: +6% attack, +10% defense.',
    category: 'plunder',
    tier: 4,
    attackBonusPct: 6,
    defenseBonusPct: 10,
  },
])

export const SKILLS: Record<string, SkillDef> = Object.fromEntries(
  [...PIRATES_TREE, ...BRITISH_TREE, ...SPANISH_TREE, ...DUTCH_TREE].map((s) => [s.id, s]),
)

/** A faction's skill tree, ordered by tier — the order the mobile skill-tree UI lists picks in. */
export function skillsForFaction(factionId: FactionId): SkillDef[] {
  return Object.values(SKILLS)
    .filter((s) => s.factionId === factionId)
    .sort((a, b) => a.tier - b.tier)
}
