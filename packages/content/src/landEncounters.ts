import type { EncounterChoiceDef, EncounterKindDef } from './encounters'

/**
 * Land random-encounter tables (#466) — the overland counterpart to the
 * open-sea `ENCOUNTERS` (encounters.ts, #23). The map generator scatters these
 * on island `land` tiles, and a landing party (never a ship) resolves them
 * through the same seeded choice/outcome machinery the sea encounters use
 * (`resolveEncounterChoice`), so the two share the `EncounterKindDef` /
 * `EncounterChoiceDef` shapes. They live in a separate catalog and a separate
 * `GameState.landEncounters` array from the sea encounters, so extending the
 * land side never touches — or perturbs the RNG of — the sea encounter stream.
 *
 * Choices reuse the existing `EncounterChoice` vocabulary (trade / fight /
 * quest / recruit / raid). A party has no crew-capacity cap, so a `recruit`
 * grant is bounded only by `grantCount`.
 */
export type LandEncounterKind = 'nativeVillage' | 'hermit' | 'banditCamp'

export interface LandEncounterCatalog {
  nativeVillage: EncounterKindDef
  hermit: EncounterKindDef
  banditCamp: EncounterKindDef
  /** Land encounters spawned ≈ floor(landTiles * spawnDensity). */
  spawnDensity: number
  /** Keep land encounters this many tiles clear of any start position. */
  minStartDistance: number
}

/** The tier-1 unit a native village yields when recruited, per faction. */
const VILLAGE_RECRUIT: EncounterChoiceDef['grantUnitByFaction'] = {
  pirates: 'deckhand',
  british: 'sailor',
  spanish: 'milicia',
  dutch: 'company-hand',
  french: 'corsaire',
}

export const LAND_ENCOUNTERS: LandEncounterCatalog = {
  nativeVillage: {
    respawnDelay: 5,
    choices: {
      // Barter for rum and coin; always succeeds.
      trade: { successChance: 1, cost: { gold: 90 }, reward: { rum: 14, gold: 40 }, xp: 5 },
      // Enlist warriors into the party — no crew cap ashore, so grantCount binds.
      recruit: {
        successChance: 1,
        cost: { gold: 160 },
        grantUnitByFaction: VILLAGE_RECRUIT,
        grantCount: 5,
        xp: 5,
      },
    },
  },
  hermit: {
    respawnDelay: 6,
    choices: {
      // A recluse's secret: modest but reliable coin, no risk.
      quest: { successChance: 0.8, reward: { gold: 260 }, xp: 15 },
    },
  },
  banditCamp: {
    respawnDelay: 4,
    choices: {
      // Storm the camp: a gamble on the party's blood for their loot.
      fight: { successChance: 0.55, reward: { gold: 220, iron: 12 }, failTroopLossPct: 0.35, xp: 25 }, // prettier-ignore
      raid: { successChance: 0.7, reward: { gold: 300 }, failTroopLossPct: 0.2, xp: 20 },
    },
  },
  spawnDensity: 0.02,
  minStartDistance: 3,
}
