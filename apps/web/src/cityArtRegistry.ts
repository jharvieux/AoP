/**
 * Shipping city art belongs to the web presentation layer. Keeping these
 * cosmetic URLs separate from @aop/content prevents presentation changes
 * from becoming gameplay inputs.
 */
export const CITY_BUILDING_IDS = [
  'townhall',
  'sawmill',
  'ironmine',
  'distillery',
  'tradehouse',
  'barracks',
  'garrisonHall',
  'fortressArmory',
  'grandArsenal',
  'palisade',
  'stoneWall',
  'citadel',
  'shipyard',
  'tavern',
] as const

export type CityBuildingId = (typeof CITY_BUILDING_IDS)[number]

export const cityArtRegistry = {
  buildings: {
    townhall: '/art/city/townhall.webp',
    sawmill: '/art/city/sawmill.webp',
    ironmine: '/art/city/ironmine.webp',
    distillery: '/art/city/distillery.webp',
    tradehouse: '/art/city/tradehouse.webp',
    barracks: '/art/city/barracks.webp',
    garrisonHall: '/art/city/garrisonHall.webp',
    fortressArmory: '/art/city/fortressArmory.webp',
    grandArsenal: '/art/city/grandArsenal.webp',
    palisade: '/art/city/palisade.webp',
    stoneWall: '/art/city/stoneWall.webp',
    citadel: '/art/city/citadel.webp',
    shipyard: '/art/city/shipyard.webp',
    tavern: '/art/city/tavern.webp',
  },
  citadelTower: '/art/city/citadel-tower.webp',
} as const satisfies {
  buildings: Record<CityBuildingId, string>
  citadelTower: string
}

export function cityBuildingArtUrl(buildingId: string): string | undefined {
  return (cityArtRegistry.buildings as Readonly<Record<string, string>>)[buildingId]
}
