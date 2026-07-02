import type { FactionId } from '@aop/shared'

/**
 * Placeholder faction data — names and rosters are starting points for the
 * Phase 2 content pass, not final balance. All gameplay numbers live here as
 * data so balance changes never touch engine code.
 */

export interface UnitDef {
  id: string
  name: string
  /** Recruitment tier, 1 (basic) – 4 (elite). */
  tier: 1 | 2 | 3 | 4
  attack: number
  defense: number
  health: number
  goldCost: number
}

export interface FactionDef {
  id: FactionId
  name: string
  description: string
  units: UnitDef[]
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  pirates: {
    id: 'pirates',
    name: 'Pirates',
    description: 'Outlaws of every flag. Cheap, fast, and vicious — weak in a long fight.',
    units: [
      { id: 'deckhand', name: 'Deckhand', tier: 1, attack: 2, defense: 1, health: 6, goldCost: 25 },
      {
        id: 'cutthroat',
        name: 'Cutthroat',
        tier: 2,
        attack: 5,
        defense: 2,
        health: 12,
        goldCost: 60,
      },
      {
        id: 'buccaneer',
        name: 'Buccaneer',
        tier: 3,
        attack: 8,
        defense: 5,
        health: 22,
        goldCost: 140,
      },
      {
        id: 'dread-corsair',
        name: 'Dread Corsair',
        tier: 4,
        attack: 14,
        defense: 8,
        health: 40,
        goldCost: 320,
      },
    ],
  },
  british: {
    id: 'british',
    name: 'British',
    description: 'The Royal Navy: disciplined line infantry and superior gunnery.',
    units: [
      { id: 'sailor', name: 'Sailor', tier: 1, attack: 2, defense: 2, health: 7, goldCost: 30 },
      { id: 'redcoat', name: 'Redcoat', tier: 2, attack: 4, defense: 4, health: 14, goldCost: 70 },
      {
        id: 'royal-marine',
        name: 'Royal Marine',
        tier: 3,
        attack: 7,
        defense: 7,
        health: 24,
        goldCost: 150,
      },
      {
        id: 'ship-of-the-line-crew',
        name: 'Ship-of-the-Line Crew',
        tier: 4,
        attack: 12,
        defense: 11,
        health: 42,
        goldCost: 340,
      },
    ],
  },
  spanish: {
    id: 'spanish',
    name: 'Spanish',
    description: 'Treasure-fleet escorts and conquistadors: heavy armor, heavy gold.',
    units: [
      { id: 'milicia', name: 'Milicia', tier: 1, attack: 2, defense: 2, health: 8, goldCost: 30 },
      {
        id: 'rodelero',
        name: 'Rodelero',
        tier: 2,
        attack: 5,
        defense: 3,
        health: 13,
        goldCost: 65,
      },
      {
        id: 'conquistador',
        name: 'Conquistador',
        tier: 3,
        attack: 9,
        defense: 6,
        health: 23,
        goldCost: 155,
      },
      {
        id: 'tercio-veteran',
        name: 'Tercio Veteran',
        tier: 4,
        attack: 13,
        defense: 10,
        health: 44,
        goldCost: 350,
      },
    ],
  },
  dutch: {
    id: 'dutch',
    name: 'Dutch',
    description: 'Merchant-company men of the VOC: economy-focused, strong defensively.',
    units: [
      {
        id: 'company-hand',
        name: 'Company Hand',
        tier: 1,
        attack: 1,
        defense: 2,
        health: 7,
        goldCost: 22,
      },
      {
        id: 'schutter',
        name: 'Schutter',
        tier: 2,
        attack: 4,
        defense: 3,
        health: 12,
        goldCost: 55,
      },
      {
        id: 'sea-beggar',
        name: 'Sea Beggar',
        tier: 3,
        attack: 8,
        defense: 6,
        health: 21,
        goldCost: 135,
      },
      {
        id: 'voc-guard',
        name: 'VOC Guard',
        tier: 4,
        attack: 11,
        defense: 12,
        health: 45,
        goldCost: 330,
      },
    ],
  },
}
