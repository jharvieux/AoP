import type { FactionId, ResourcePool } from '@aop/shared'

/**
 * Random-encounter tables (#23). Merchants, natives, and settlers scattered on the
 * open sea by mapgen; each offers a set of choices with seeded outcomes. Pure
 * balance data — the engine holds none of it, and the client/edge functions freeze
 * this into the match config exactly like the combat and economy tables.
 */

export type EncounterKind = 'merchant' | 'natives' | 'settlers'

export type EncounterChoice = 'trade' | 'rob' | 'fight' | 'quest' | 'recruit' | 'escort' | 'raid'

export interface EncounterChoiceDef {
  /** Probability in [0,1] the choice succeeds; 1 = deterministic. */
  successChance: number
  /** Resources paid up front regardless of outcome. */
  cost?: Partial<ResourcePool>
  /** Resources granted on success. */
  reward?: Partial<ResourcePool>
  /** Captain XP granted on success (#21). */
  xp?: number
  /** Fraction in [0,1] of each captain troop stack lost on failure. */
  failTroopLossPct?: number
  /** Unit id granted on success, keyed by the recruiting captain's faction. */
  grantUnitByFaction?: Partial<Record<FactionId, string>>
  /** How many of the granted unit to add on success. */
  grantCount?: number
}

export interface EncounterKindDef {
  choices: Partial<Record<EncounterChoice, EncounterChoiceDef>>
  /** Rounds after a consumed encounter respawns; 0 = one-shot. */
  respawnDelay: number
}

export interface EncounterCatalog {
  merchant: EncounterKindDef
  natives: EncounterKindDef
  settlers: EncounterKindDef
  /** Encounters spawned ≈ floor(navigableWaterTiles * spawnDensity). */
  spawnDensity: number
  /** Keep encounters off each player's doorstep so starts don't hand out free loot. */
  minStartDistance: number
}

/** The tier-1 unit a settler band yields when recruited, per faction. */
const RECRUIT_UNIT: Record<FactionId, string> = {
  pirates: 'deckhand',
  british: 'sailor',
  spanish: 'milicia',
  dutch: 'company-hand',
  french: 'corsaire',
}

export const ENCOUNTERS: EncounterCatalog = {
  merchant: {
    respawnDelay: 3,
    choices: {
      // Fair trade: spend gold for scarce materials. Always succeeds.
      trade: {
        successChance: 1,
        cost: { gold: 120 },
        reward: { timber: 10, iron: 6, rum: 6 },
        xp: 5,
      },
      // Piracy: a gamble on the merchant's guard — big gold or bloodied crew.
      rob: { successChance: 0.6, reward: { gold: 250 }, failTroopLossPct: 0.25, xp: 15 },
    },
  },
  natives: {
    respawnDelay: 4,
    choices: {
      trade: { successChance: 1, cost: { gold: 80 }, reward: { rum: 12 }, xp: 5 },
      fight: {
        successChance: 0.55,
        reward: { gold: 180, iron: 10 },
        failTroopLossPct: 0.35,
        xp: 25,
      },
      quest: { successChance: 0.7, reward: { gold: 300 }, xp: 20 },
    },
  },
  settlers: {
    respawnDelay: 5,
    choices: {
      recruit: {
        successChance: 1,
        cost: { gold: 150 },
        grantUnitByFaction: RECRUIT_UNIT,
        grantCount: 6,
        xp: 5,
      },
      escort: { successChance: 0.75, reward: { gold: 220 }, failTroopLossPct: 0.1, xp: 15 },
      raid: { successChance: 0.65, reward: { gold: 280, rum: 8 }, failTroopLossPct: 0.3, xp: 20 },
    },
  },
  spawnDensity: 0.012,
  minStartDistance: 4,
}
