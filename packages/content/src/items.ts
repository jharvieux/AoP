/**
 * Captain items (#498): pirate-flavored trinkets a captain collects from
 * encounters and land hauls. Every held item is passively active — attack and
 * defense percentages fold into the same combat-bonus channel as skills, and
 * speed adds movement points at refresh. All numbers here are balance data;
 * the engine reads them from the frozen ContentCatalog and hardcodes none.
 *
 * Rarity is the drop `weight`: common items carry weight 6, rare ones 2, so a
 * drop is a rare roughly one time in four with this table.
 */

export interface ItemDef {
  id: string
  name: string
  description: string
  attackBonusPct: number
  defenseBonusPct: number
  /** Extra movement points granted to the carrying captain at movement refresh. */
  speedBonus: number
  /** Relative weight for the seeded drop roll — higher is more common. */
  weight: number
}

const COMMON = 6
const RARE = 2

const ITEM_LIST: readonly ItemDef[] = [
  {
    id: 'rusty-cutlass',
    name: 'Rusty Cutlass',
    description: 'Notched and ugly, but it still bites: +3% attack.',
    attackBonusPct: 3,
    defenseBonusPct: 0,
    speedBonus: 0,
    weight: COMMON,
  },
  {
    id: 'boarding-hooks',
    name: 'Boarding Hooks',
    description: 'Grapples that pull a prize in close: +4% attack.',
    attackBonusPct: 4,
    defenseBonusPct: 0,
    speedBonus: 0,
    weight: COMMON,
  },
  {
    id: 'grapeshot-crate',
    name: 'Grapeshot Crate',
    description: 'Canister loads that sweep a deck clean: +5% attack.',
    attackBonusPct: 5,
    defenseBonusPct: 0,
    speedBonus: 0,
    weight: COMMON,
  },
  {
    id: 'oak-planking',
    name: 'Oak Planking',
    description: 'Seasoned timbers patch the worst of a broadside: +4% defense.',
    attackBonusPct: 0,
    defenseBonusPct: 4,
    speedBonus: 0,
    weight: COMMON,
  },
  {
    id: 'tar-sealed-hull',
    name: 'Tar-Sealed Hull',
    description: 'A fresh coat below the waterline: +3% defense.',
    attackBonusPct: 0,
    defenseBonusPct: 3,
    speedBonus: 0,
    weight: COMMON,
  },
  {
    id: 'sea-charts',
    name: 'Sea Charts',
    description: 'Hand-inked shortcuts through the shoals: +1 movement.',
    attackBonusPct: 0,
    defenseBonusPct: 0,
    speedBonus: 1,
    weight: COMMON,
  },
  {
    id: 'lucky-coin',
    name: 'Lucky Coin',
    description: 'A doubloon that always lands crown-up: +2% attack, +2% defense.',
    attackBonusPct: 2,
    defenseBonusPct: 2,
    speedBonus: 0,
    weight: COMMON,
  },
  {
    id: 'quartermasters-ledger',
    name: "Quartermaster's Ledger",
    description: 'A crew paid on time fights harder: +2% attack, +1% defense.',
    attackBonusPct: 2,
    defenseBonusPct: 1,
    speedBonus: 0,
    weight: COMMON,
  },
  {
    id: 'kraken-figurehead',
    name: 'Kraken Figurehead',
    description: 'A carved horror that unnerves every gun crew it faces: +8% attack.',
    attackBonusPct: 8,
    defenseBonusPct: 0,
    speedBonus: 0,
    weight: RARE,
  },
  {
    id: 'admirals-spyglass',
    name: "Admiral's Spyglass",
    description: 'Reads an enemy broadside before it fires: +8% defense.',
    attackBonusPct: 0,
    defenseBonusPct: 8,
    speedBonus: 0,
    weight: RARE,
  },
  {
    id: 'ghost-sails',
    name: 'Ghost Sails',
    description: 'Canvas that drinks the wind no one else feels: +2 movement.',
    attackBonusPct: 0,
    defenseBonusPct: 0,
    speedBonus: 2,
    weight: RARE,
  },
  {
    id: 'cursed-doubloon',
    name: 'Cursed Doubloon',
    description: 'Its owner cannot die poor — or easily: +6% attack, +6% defense.',
    attackBonusPct: 6,
    defenseBonusPct: 6,
    speedBonus: 0,
    weight: RARE,
  },
  {
    id: 'sirens-bell',
    name: "Siren's Bell",
    description: 'Rings the crew into a killing fervor: +4% attack, +1 movement.',
    attackBonusPct: 4,
    defenseBonusPct: 0,
    speedBonus: 1,
    weight: RARE,
  },
]

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_LIST.map((i) => [i.id, i]))

/** Drop-source probabilities and the carry cap (#498) — balance data, engine reads it from the catalog. */
export interface ItemDropTuning {
  /** Items a captain can carry; further finds overflow to the owner's faction stash. */
  captainItemCap: number
  /** Drop probability in [0,1] on a successful sea encounter. */
  seaEncounterDropChance: number
  /** Drop probability in [0,1] on capturing a haul land site (one-time, so generous). */
  landHaulDropChance: number
  /** Drop probability in [0,1] on a successful land encounter. */
  landEncounterDropChance: number
}

export const ITEM_DROPS: ItemDropTuning = {
  captainItemCap: 8,
  seaEncounterDropChance: 0.3,
  landHaulDropChance: 0.5,
  landEncounterDropChance: 0.35,
}
