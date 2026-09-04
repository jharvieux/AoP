import { FACTIONS } from '@aop/content'
import type { EncounterKind, LandEncounterKind, LandSiteKind } from '@aop/engine'
import type { Coord, FactionId } from '@aop/shared'
import {
  cityContentId,
  encounterContentId,
  factionFlagContentId,
  landSiteContentId,
  partyContentId,
  resolveSpriteUrl,
  tileContentId,
} from './mapSprites'

function requiredDefaultUrl(url: string | undefined, identity: string): string {
  if (!url) throw new Error(`Missing default map art URL for ${identity}`)
  return url
}

/**
 * Default world-map art is centralized here so URL completeness and fog-safe
 * preload selection can be tested without initializing Pixi.
 */
export const mapArtRegistry = {
  tiles: {
    deep: '/art/tiles/deep.png',
    shallows: '/art/tiles/shallows.png',
    land: '/art/tiles/land.png',
    port: '/art/tiles/port.png',
  },
  cities: {
    british: '/art/cities/british.webp',
    dutch: '/art/cities/dutch.webp',
    french: '/art/cities/french.webp',
    pirates: '/art/cities/pirates.webp',
    spanish: '/art/cities/spanish.webp',
    neutral: '/art/cities/neutral.webp',
  },
  seaEncounters: {
    merchant: '/art/encounters/merchant-v2.webp',
    natives: '/art/encounters/natives-v2.webp',
    settlers: '/art/encounters/settlers-v2.webp',
  },
  landEncounters: {
    nativeVillage: '/art/encounters/native-village.webp',
    hermit: '/art/encounters/hermit.webp',
    banditCamp: '/art/encounters/bandit-camp.webp',
  },
  landSites: {
    mine: '/art/sites/mine.webp',
    sawmill: '/art/sites/sawmill.webp',
    lumberCamp: '/art/sites/lumber-camp.webp',
    ruins: '/art/sites/ruins.webp',
  },
  generatedShips: {
    'british:sloop': requiredDefaultUrl(FACTIONS.british.shipSpriteUrl, 'ship:british:sloop'),
    'pirates:galleon': requiredDefaultUrl(
      FACTIONS.pirates.shipSpriteUrlsByClass?.galleon,
      'ship:pirates:galleon',
    ),
  },
  parties: {
    british: FACTIONS.british.partySpriteUrl,
    dutch: FACTIONS.dutch.partySpriteUrl,
    french: FACTIONS.french.partySpriteUrl,
    pirates: FACTIONS.pirates.partySpriteUrl,
    spanish: FACTIONS.spanish.partySpriteUrl,
  },
} as const

export type CityArtIdentity = FactionId | 'neutral'

export interface MapArtRequest {
  contentId: string
  url: string
}

export type MapArtLoadStatus = 'idle' | 'pending' | 'loaded' | 'failed'

interface PositionedOwner {
  ownerId: string
  position: Coord
}

export interface MapArtScene {
  captains: readonly (PositionedOwner & {
    shipClassId: string
    shipLost?: boolean | undefined
  })[]
  cities: readonly PositionedOwner[]
  encounters: readonly {
    kind: EncounterKind
    position: Coord
    active: boolean
  }[]
  landSites: readonly {
    kind: LandSiteKind
    position: Coord
    active: boolean
    claimedBy?: string | null | undefined
  }[]
  landEncounters: readonly {
    kind: LandEncounterKind
    position: Coord
    active: boolean
  }[]
  parties: readonly PositionedOwner[]
  viewerId: string
  visibleKeys: ReadonlySet<string>
  exploredKeys: ReadonlySet<string>
  factionOf: (ownerId: string) => FactionId
  cityFactionOf: (ownerId: string) => FactionId | undefined
  spriteUrl: (contentId: string) => string | undefined
}

function positionKey(position: Coord): string {
  return `${position.x},${position.y}`
}

function cityIdentity(scene: MapArtScene, ownerId: string): CityArtIdentity {
  return scene.cityFactionOf(ownerId) ?? 'neutral'
}

function shipDefaultUrl(factionId: FactionId, shipClassId: string): string | undefined {
  const faction = FACTIONS[factionId]
  return faction.shipSpriteUrlsByClass?.[shipClassId] ?? faction.shipSpriteUrl
}

/**
 * Return the finite art set that may be drawn for this viewer right now.
 * Hidden entity identities are never added, decoded, or used as preload keys.
 * Theme overrides are resolved here so readiness covers the exact winning URL.
 */
export function mapArtPreloadRequests(scene: MapArtScene): MapArtRequest[] {
  const requests = new Map<string, MapArtRequest>()
  const add = (contentId: string, defaultUrl: string | undefined) => {
    const url = resolveSpriteUrl(scene.spriteUrl, contentId, defaultUrl)
    if (url && !requests.has(url)) requests.set(url, { contentId, url })
  }
  const addFactionFlag = (factionId: FactionId) => {
    add(factionFlagContentId(factionId), FACTIONS[factionId].flagSpriteUrl)
  }

  // Land/port are the only tile types that currently draw raster art. Water
  // remains procedural, so decoding deep/shallows would waste critical bytes.
  add(tileContentId('land'), mapArtRegistry.tiles.land)
  add(tileContentId('port'), mapArtRegistry.tiles.port)

  for (const encounter of scene.encounters) {
    if (!encounter.active || !scene.visibleKeys.has(positionKey(encounter.position))) continue
    add(encounterContentId(encounter.kind), mapArtRegistry.seaEncounters[encounter.kind])
  }

  for (const encounter of scene.landEncounters) {
    if (!encounter.active || !scene.visibleKeys.has(positionKey(encounter.position))) continue
    add(encounterContentId(encounter.kind), mapArtRegistry.landEncounters[encounter.kind])
  }

  for (const site of scene.landSites) {
    if (!site.active || !scene.visibleKeys.has(positionKey(site.position))) continue
    add(landSiteContentId(site.kind), mapArtRegistry.landSites[site.kind])
    if (site.claimedBy) addFactionFlag(scene.factionOf(site.claimedBy))
  }

  for (const city of scene.cities) {
    const own = city.ownerId === scene.viewerId
    if (!own && !scene.exploredKeys.has(positionKey(city.position))) continue
    const identity = cityIdentity(scene, city.ownerId)
    add(cityContentId(own), mapArtRegistry.cities[identity])
    if (identity !== 'neutral') addFactionFlag(identity)
  }

  for (const captain of scene.captains) {
    const own = captain.ownerId === scene.viewerId
    if ((!own && !scene.visibleKeys.has(positionKey(captain.position))) || captain.shipLost)
      continue
    const factionId = scene.factionOf(captain.ownerId)
    add(captain.shipClassId, shipDefaultUrl(factionId, captain.shipClassId))
    addFactionFlag(factionId)
  }

  for (const party of scene.parties) {
    const own = party.ownerId === scene.viewerId
    if (!own && !scene.visibleKeys.has(positionKey(party.position))) continue
    const factionId = scene.factionOf(party.ownerId)
    add(partyContentId(factionId), FACTIONS[factionId].partySpriteUrl)
    addFactionFlag(factionId)
  }

  return [...requests.values()]
}

/**
 * Select the unique URLs that still have to settle before an interactive map
 * frame may be revealed. Failed assets are deliberately settled: their first
 * visible frame uses the permanent procedural fallback instead of popping.
 */
export function unsettledMapArtUrls(
  requests: readonly MapArtRequest[],
  statusOf: (url: string) => MapArtLoadStatus,
): string[] {
  return [...new Set(requests.map((request) => request.url))]
    .filter((url) => {
      const status = statusOf(url)
      return status === 'idle' || status === 'pending'
    })
    .sort()
}

/** Every static default URL MapCanvas can select, for fail-loud file coverage. */
export function mapArtDefaultUrls(): string[] {
  const urls = new Set<string>()
  const addRecord = (record: Record<string, string>) => {
    for (const url of Object.values(record)) urls.add(url)
  }
  addRecord(mapArtRegistry.tiles)
  addRecord(mapArtRegistry.cities)
  addRecord(mapArtRegistry.seaEncounters)
  addRecord(mapArtRegistry.landEncounters)
  addRecord(mapArtRegistry.landSites)
  addRecord(mapArtRegistry.generatedShips)
  addRecord(mapArtRegistry.parties)
  for (const faction of Object.values(FACTIONS)) {
    urls.add(faction.flagSpriteUrl)
    urls.add(faction.partySpriteUrl)
    if (faction.shipSpriteUrl) urls.add(faction.shipSpriteUrl)
    for (const url of Object.values(faction.shipSpriteUrlsByClass ?? {})) {
      if (url) urls.add(url)
    }
  }
  return [...urls].sort()
}
