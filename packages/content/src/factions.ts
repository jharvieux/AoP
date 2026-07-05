import type { FactionId } from '@aop/shared'

/**
 * Placeholder faction data — names and rosters are starting points for the
 * Phase 2 content pass, not final balance. All gameplay numbers live here as
 * data so balance changes never touch engine code.
 */

export interface UnitDef {
  id: string
  name: string
  /** Recruitment tier, 1 (basic) – 4 (elite). Gated by the city's recruitment building tier. */
  tier: 1 | 2 | 3 | 4
  attack: number
  defense: number
  health: number
  goldCost: number
  /** New recruits available per round, replenished up to no cap (HoMM weekly-growth style). */
  weeklyGrowth: number
  /** Battle-board speed (#39): hexes per activation, and initiative rank (faster acts first). */
  speed: number
}

export interface FactionDef {
  id: FactionId
  name: string
  description: string
  units: UnitDef[]
  /** Generated art (#26/#109), served from apps/web/public. MapCanvas.tsx falls back to a
   * flat-color shape when absent (see #115). */
  shipSpriteUrl?: string
  /** Generated art (#26/#110), served from apps/web/public. Rendered per-captain in the
   * army/garrison list and the attack-confirmation sheet (#114). */
  captainPortraitUrl?: string
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  pirates: {
    id: 'pirates',
    name: 'Pirates',
    description: 'Outlaws of every flag. Cheap, fast, and vicious — weak in a long fight.',
    shipSpriteUrl: '/art/factions/pirates/ship.png',
    captainPortraitUrl: '/art/factions/pirates/captain.png',
    units: [
      {
        id: 'deckhand',
        name: 'Deckhand',
        tier: 1,
        attack: 2,
        defense: 1,
        health: 6,
        goldCost: 25,
        weeklyGrowth: 8,
        speed: 6,
      },
      {
        id: 'cutthroat',
        name: 'Cutthroat',
        tier: 2,
        attack: 5,
        defense: 2,
        health: 12,
        goldCost: 60,
        weeklyGrowth: 5,
        speed: 6,
      },
      {
        id: 'buccaneer',
        name: 'Buccaneer',
        tier: 3,
        attack: 8,
        defense: 5,
        health: 22,
        goldCost: 140,
        weeklyGrowth: 3,
        speed: 5,
      },
      {
        id: 'dread-corsair',
        name: 'Dread Corsair',
        tier: 4,
        attack: 14,
        defense: 8,
        health: 40,
        goldCost: 320,
        weeklyGrowth: 1,
        speed: 5,
      },
    ],
  },
  british: {
    id: 'british',
    name: 'British',
    description: 'The Royal Navy: disciplined line infantry and superior gunnery.',
    shipSpriteUrl: '/art/factions/british/ship.png',
    captainPortraitUrl: '/art/factions/british/captain.png',
    units: [
      {
        id: 'sailor',
        name: 'Sailor',
        tier: 1,
        attack: 2,
        defense: 2,
        health: 7,
        goldCost: 30,
        weeklyGrowth: 8,
        speed: 5,
      },
      {
        id: 'redcoat',
        name: 'Redcoat',
        tier: 2,
        attack: 4,
        defense: 4,
        health: 14,
        goldCost: 70,
        weeklyGrowth: 5,
        speed: 4,
      },
      {
        id: 'royal-marine',
        name: 'Royal Marine',
        tier: 3,
        attack: 7,
        defense: 7,
        health: 24,
        goldCost: 150,
        weeklyGrowth: 3,
        speed: 5,
      },
      {
        id: 'ship-of-the-line-crew',
        name: 'Ship-of-the-Line Crew',
        tier: 4,
        attack: 12,
        defense: 11,
        health: 42,
        goldCost: 340,
        weeklyGrowth: 1,
        speed: 4,
      },
    ],
  },
  spanish: {
    id: 'spanish',
    name: 'Spanish',
    description: 'Treasure-fleet escorts and conquistadors: heavy armor, heavy gold.',
    shipSpriteUrl: '/art/factions/spanish/ship.png',
    captainPortraitUrl: '/art/factions/spanish/captain.png',
    units: [
      {
        id: 'milicia',
        name: 'Milicia',
        tier: 1,
        attack: 2,
        defense: 2,
        health: 8,
        goldCost: 30,
        weeklyGrowth: 8,
        speed: 4,
      },
      {
        id: 'rodelero',
        name: 'Rodelero',
        tier: 2,
        attack: 5,
        defense: 3,
        health: 13,
        goldCost: 65,
        weeklyGrowth: 5,
        speed: 5,
      },
      {
        id: 'conquistador',
        name: 'Conquistador',
        tier: 3,
        attack: 9,
        defense: 6,
        health: 23,
        goldCost: 155,
        weeklyGrowth: 3,
        speed: 5,
      },
      {
        id: 'tercio-veteran',
        name: 'Tercio Veteran',
        tier: 4,
        attack: 13,
        defense: 10,
        health: 44,
        goldCost: 350,
        weeklyGrowth: 1,
        speed: 4,
      },
    ],
  },
  dutch: {
    id: 'dutch',
    name: 'Dutch',
    description: 'Merchant-company men of the VOC: economy-focused, strong defensively.',
    shipSpriteUrl: '/art/factions/dutch/ship.png',
    captainPortraitUrl: '/art/factions/dutch/captain.png',
    units: [
      {
        id: 'company-hand',
        name: 'Company Hand',
        tier: 1,
        attack: 1,
        defense: 2,
        health: 7,
        goldCost: 22,
        weeklyGrowth: 8,
        speed: 4,
      },
      {
        id: 'schutter',
        name: 'Schutter',
        tier: 2,
        attack: 4,
        defense: 3,
        health: 12,
        goldCost: 55,
        weeklyGrowth: 5,
        speed: 5,
      },
      {
        id: 'sea-beggar',
        name: 'Sea Beggar',
        tier: 3,
        attack: 8,
        defense: 6,
        health: 21,
        goldCost: 135,
        weeklyGrowth: 3,
        speed: 6,
      },
      {
        id: 'voc-guard',
        name: 'VOC Guard',
        tier: 4,
        attack: 11,
        defense: 12,
        health: 45,
        goldCost: 330,
        weeklyGrowth: 1,
        speed: 3,
      },
    ],
  },
  french: {
    id: 'french',
    name: 'French',
    description:
      'Corsairs and crown regiments alike: aggressive gunnery and rapid rearmament, at the cost of a thinner hull.',
    shipSpriteUrl: '/art/factions/french/ship.png',
    captainPortraitUrl: '/art/factions/french/captain.png',
    units: [
      {
        id: 'corsaire',
        name: 'Corsaire',
        tier: 1,
        attack: 2,
        defense: 1,
        health: 6,
        goldCost: 24,
        weeklyGrowth: 9,
        speed: 6,
      },
      {
        id: 'mousquetaire',
        name: 'Mousquetaire',
        tier: 2,
        attack: 6,
        defense: 2,
        health: 12,
        goldCost: 65,
        weeklyGrowth: 6,
        speed: 6,
      },
      {
        id: 'grenadier',
        name: 'Grenadier',
        tier: 3,
        attack: 9,
        defense: 4,
        health: 20,
        goldCost: 150,
        weeklyGrowth: 4,
        speed: 5,
      },
      {
        id: 'garde-du-roi',
        name: 'Garde du Roi',
        tier: 4,
        attack: 15,
        defense: 7,
        health: 38,
        goldCost: 330,
        weeklyGrowth: 2,
        speed: 5,
      },
    ],
  },
}
