/**
 * Captain items (#498): pirate-flavored trinkets a captain collects from
 * encounters and land hauls. An item boosts its carrier's STATS (operator
 * decision, 2026-07-14) — whole stat points added to attack/defense/speed
 * while the item is in the captain's hold (carried = equipped; stash items are
 * inert). Boosted attack/defense stats add flat per-unit combat score, boosted
 * speed adds movement at refresh, exactly like trained points. All numbers
 * here are balance data; the engine reads them from the frozen ContentCatalog
 * and hardcodes none.
 *
 * Magnitudes are deliberately modest — each attack/defense point is +1 to
 * every commanded unit's score, so a common item grants +1 to one stat and a
 * rare +2 (or a +2/+1 split).
 *
 * Rarity is the drop `weight`: common items carry weight 6, rare ones 2, so a
 * drop is a rare roughly one time in four with this table.
 */

/** Stat points an item adds to its carrier while carried. */
export interface ItemStatBonuses {
  attack?: number
  defense?: number
  speed?: number
}

export interface ItemDef {
  id: string
  name: string
  description: string
  statBonuses: ItemStatBonuses
  /** Relative weight for the seeded drop roll — higher is more common. */
  weight: number
}

const COMMON = 6
const RARE = 2

const ITEM_LIST: readonly ItemDef[] = [
  {
    id: 'rusty-cutlass',
    name: 'Rusty Cutlass',
    description: 'Notched and ugly, but it still bites: +1 attack.',
    statBonuses: { attack: 1 },
    weight: COMMON,
  },
  {
    id: 'boarding-hooks',
    name: 'Boarding Hooks',
    description: 'Grapples that pull a prize in close: +1 attack.',
    statBonuses: { attack: 1 },
    weight: COMMON,
  },
  {
    id: 'grapeshot-crate',
    name: 'Grapeshot Crate',
    description: 'Canister loads that sweep a deck clean: +1 attack.',
    statBonuses: { attack: 1 },
    weight: COMMON,
  },
  {
    id: 'oak-planking',
    name: 'Oak Planking',
    description: 'Seasoned timbers patch the worst of a broadside: +1 defense.',
    statBonuses: { defense: 1 },
    weight: COMMON,
  },
  {
    id: 'tar-sealed-hull',
    name: 'Tar-Sealed Hull',
    description: 'A fresh coat below the waterline: +1 defense.',
    statBonuses: { defense: 1 },
    weight: COMMON,
  },
  {
    id: 'sea-charts',
    name: 'Sea Charts',
    description: 'Hand-inked shortcuts through the shoals: +1 speed.',
    statBonuses: { speed: 1 },
    weight: COMMON,
  },
  {
    id: 'lucky-coin',
    name: 'Lucky Coin',
    description: 'A doubloon that always lands crown-up: +1 defense.',
    statBonuses: { defense: 1 },
    weight: COMMON,
  },
  {
    id: 'quartermasters-ledger',
    name: "Quartermaster's Ledger",
    description: 'A crew paid on time fights harder: +1 attack.',
    statBonuses: { attack: 1 },
    weight: COMMON,
  },
  {
    id: 'kraken-figurehead',
    name: 'Kraken Figurehead',
    description: 'A carved horror that unnerves every gun crew it faces: +2 attack.',
    statBonuses: { attack: 2 },
    weight: RARE,
  },
  {
    id: 'admirals-spyglass',
    name: "Admiral's Spyglass",
    description: 'Reads an enemy broadside before it fires: +2 defense.',
    statBonuses: { defense: 2 },
    weight: RARE,
  },
  {
    id: 'ghost-sails',
    name: 'Ghost Sails',
    description: 'Canvas that drinks the wind no one else feels: +2 speed.',
    statBonuses: { speed: 2 },
    weight: RARE,
  },
  {
    id: 'cursed-doubloon',
    name: 'Cursed Doubloon',
    description: 'Its owner cannot die poor — or easily: +2 attack, +1 defense.',
    statBonuses: { attack: 2, defense: 1 },
    weight: RARE,
  },
  {
    id: 'sirens-bell',
    name: "Siren's Bell",
    description: 'Rings the crew into a killing fervor: +1 attack, +1 speed.',
    statBonuses: { attack: 1, speed: 1 },
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
