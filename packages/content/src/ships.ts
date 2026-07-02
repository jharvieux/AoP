/**
 * Ship class skeleton. Upgrades (hull, cannons, sails, crew) and per-faction
 * variants come with the Phase 2 combat pass.
 */

export interface ShipClassDef {
  id: string
  name: string
  hull: number
  cannons: number
  speed: number
  crewCapacity: number
  goldCost: number
}

export const SHIP_CLASSES: ShipClassDef[] = [
  { id: 'sloop', name: 'Sloop', hull: 40, cannons: 6, speed: 5, crewCapacity: 4, goldCost: 400 },
  {
    id: 'brigantine',
    name: 'Brigantine',
    hull: 70,
    cannons: 12,
    speed: 4,
    crewCapacity: 6,
    goldCost: 900,
  },
  {
    id: 'frigate',
    name: 'Frigate',
    hull: 110,
    cannons: 24,
    speed: 3,
    crewCapacity: 8,
    goldCost: 1800,
  },
  {
    id: 'galleon',
    name: 'Galleon',
    hull: 160,
    cannons: 36,
    speed: 2,
    crewCapacity: 12,
    goldCost: 3200,
  },
]
