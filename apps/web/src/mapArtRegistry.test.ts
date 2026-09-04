import { FACTIONS } from '@aop/content'
import { ENGINE_VERSION } from '@aop/shared'
import { describe, expect, it } from 'vitest'
import { computeEngineVersion } from '../../../scripts/generate-engine-version.mjs'
import {
  mapArtDefaultUrls,
  mapArtPreloadRequests,
  mapArtRegistry,
  mapShipDefaultUrl,
  resolveMapPartyUrl,
  resolveMapShipUrl,
  unsettledMapArtUrls,
  type MapArtLoadStatus,
  type MapArtScene,
} from './mapArtRegistry'

const PUBLIC_ASSETS = import.meta.glob('../public/art/**/*', {
  eager: true,
  import: 'default',
  query: '?url',
})

function hasPublicAsset(url: string): boolean {
  return Object.hasOwn(PUBLIC_ASSETS, `../public${url}`)
}

function scene(overrides: Partial<MapArtScene> = {}): MapArtScene {
  const factionByOwner = {
    self: 'british',
    rival: 'spanish',
    pirate: 'pirates',
  } as const
  return {
    captains: [],
    cities: [],
    encounters: [],
    landSites: [],
    landEncounters: [],
    parties: [],
    viewerId: 'self',
    visibleKeys: new Set(),
    exploredKeys: new Set(),
    factionOf: (ownerId) => {
      const faction = factionByOwner[ownerId as keyof typeof factionByOwner]
      if (!faction) throw new Error(`unknown owner ${ownerId}`)
      return faction
    },
    cityFactionOf: (ownerId) =>
      ownerId === 'neutral' ? undefined : factionByOwner[ownerId as keyof typeof factionByOwner],
    spriteUrl: () => undefined,
    ...overrides,
  }
}

function urls(input: MapArtScene): string[] {
  return mapArtPreloadRequests(input).map((request) => request.url)
}

describe('mapArtRegistry', () => {
  it('maps the complete 41-identity runtime family, including all 20 ships, to files', () => {
    const shipUrls = Object.values(mapArtRegistry.ships).flatMap((faction) =>
      Object.values(faction),
    )
    const generatedUrls = [
      ...Object.values(mapArtRegistry.cities),
      ...shipUrls,
      ...Object.values(mapArtRegistry.parties),
      ...Object.values(mapArtRegistry.seaEncounters),
      ...Object.values(mapArtRegistry.landEncounters),
      ...Object.values(mapArtRegistry.landSites),
    ]

    expect(shipUrls).toHaveLength(20)
    expect(new Set(shipUrls)).toHaveLength(20)
    expect(generatedUrls).toHaveLength(41)
    expect(new Set(generatedUrls)).toHaveLength(41)
    for (const url of generatedUrls) {
      expect(hasPublicAsset(url), `${url} missing under public`).toBe(true)
    }
  })

  it('keeps every selectable default URL backed by a public asset', () => {
    for (const url of mapArtDefaultUrls()) {
      expect(hasPublicAsset(url), `${url} missing under public`).toBe(true)
    }
  })

  it('makes every faction/class ship reachable through the pure web registry', () => {
    const factions = ['british', 'dutch', 'french', 'pirates', 'spanish'] as const
    const classes = ['sloop', 'brigantine', 'frigate', 'galleon'] as const

    for (const faction of factions) {
      for (const shipClass of classes) {
        const expected = mapArtRegistry.ships[faction][shipClass]
        expect(mapShipDefaultUrl(faction, shipClass)).toBe(expected)
        expect(resolveMapShipUrl(() => undefined, faction, shipClass)).toBe(expected)
        expect(hasPublicAsset(expected), `${faction}/${shipClass} missing under public`).toBe(true)
      }
    }
  })

  it('keeps theme overrides ahead of registry defaults for ships and parties', () => {
    expect(resolveMapShipUrl(() => '/theme/ship.webp', 'spanish', 'galleon')).toBe(
      '/theme/ship.webp',
    )
    expect(resolveMapPartyUrl(() => '/theme/party.webp', 'british')).toBe('/theme/party.webp')
    for (const faction of ['british', 'dutch', 'french', 'pirates', 'spanish'] as const) {
      expect(resolveMapPartyUrl(() => undefined, faction)).toBe(mapArtRegistry.parties[faction])
    }
  })

  it('leaves content URLs at their legacy replay-hash values', () => {
    expect(FACTIONS.british.shipSpriteUrl).toBe('/art/factions/british/ship.png')
    expect(FACTIONS.pirates.shipSpriteUrlsByClass?.galleon).toBe(
      '/art/factions/pirates/ship_galleon.png',
    )
    for (const faction of Object.values(FACTIONS)) {
      expect(faction.partySpriteUrl).toBe(`/art/parties/${faction.id}.png`)
    }
    expect(ENGINE_VERSION).toBe('47d4a5867f0d16d7')
    expect(computeEngineVersion()).toBe('47d4a5867f0d16d7')
  })
})

describe('mapArtPreloadRequests', () => {
  it('preloads the same registry winner the renderer resolves for every faction and class', () => {
    const factions = ['british', 'dutch', 'french', 'pirates', 'spanish'] as const
    const classes = ['sloop', 'brigantine', 'frigate', 'galleon'] as const

    for (const faction of factions) {
      for (const shipClass of classes) {
        const input = scene({
          captains: [{ ownerId: 'self', position: { x: 1, y: 1 }, shipClassId: shipClass }],
          factionOf: () => faction,
        })
        const request = mapArtPreloadRequests(input).find(
          (candidate) => candidate.contentId === shipClass,
        )
        expect(request?.url).toBe(resolveMapShipUrl(input.spriteUrl, faction, shipClass))
        expect(request?.url).toBe(mapArtRegistry.ships[faction][shipClass])
      }
    }
  })

  it('selects faction and neutral city defaults without calling factionOf for neutral', () => {
    const input = scene({
      cities: [
        { ownerId: 'self', position: { x: 1, y: 1 } },
        { ownerId: 'neutral', position: { x: 2, y: 2 } },
      ],
      exploredKeys: new Set(['2,2']),
    })

    expect(urls(input)).toEqual(
      expect.arrayContaining([
        mapArtRegistry.cities.british,
        mapArtRegistry.cities.neutral,
        '/art/factions/british/flag.png',
      ]),
    )
  })

  it('keeps city:own and city:enemy theme overrides ahead of faction defaults', () => {
    const input = scene({
      cities: [
        { ownerId: 'self', position: { x: 1, y: 1 } },
        { ownerId: 'rival', position: { x: 2, y: 2 } },
      ],
      exploredKeys: new Set(['2,2']),
      spriteUrl: (contentId) =>
        contentId === 'city:own'
          ? 'data:image/png;base64,OWN'
          : contentId === 'city:enemy'
            ? 'data:image/png;base64,ENEMY'
            : undefined,
    })

    const selected = urls(input)
    expect(selected).toEqual(
      expect.arrayContaining(['data:image/png;base64,OWN', 'data:image/png;base64,ENEMY']),
    )
    expect(selected).not.toContain(mapArtRegistry.cities.british)
    expect(selected).not.toContain(mapArtRegistry.cities.spanish)
  })

  it('covers each currently eligible entity family, including sites and land encounters', () => {
    const visibleKeys = new Set(['3,3', '4,4', '5,5', '6,6', '7,7'])
    const selected = urls(
      scene({
        captains: [
          { ownerId: 'self', position: { x: 1, y: 1 }, shipClassId: 'sloop' },
          { ownerId: 'pirate', position: { x: 3, y: 3 }, shipClassId: 'galleon' },
        ],
        parties: [{ ownerId: 'rival', position: { x: 4, y: 4 } }],
        encounters: [{ kind: 'merchant', position: { x: 5, y: 5 }, active: true }],
        landEncounters: [{ kind: 'nativeVillage', position: { x: 6, y: 6 }, active: true }],
        landSites: [{ kind: 'mine', position: { x: 7, y: 7 }, active: true }],
        visibleKeys,
      }),
    )

    expect(selected).toEqual(
      expect.arrayContaining([
        '/art/factions/british/ship_sloop.webp',
        '/art/factions/pirates/ship_galleon_v2.webp',
        '/art/parties/spanish.webp',
        mapArtRegistry.seaEncounters.merchant,
        mapArtRegistry.landEncounters.nativeVillage,
        mapArtRegistry.landSites.mine,
      ]),
    )
  })

  it('uses the same winning registry/theme URL that the renderer consumes', () => {
    const themeUrl = '/theme/frigate.webp'
    const input = scene({
      captains: [{ ownerId: 'self', position: { x: 1, y: 1 }, shipClassId: 'frigate' }],
      factionOf: () => 'french',
      spriteUrl: (contentId) => (contentId === 'frigate' ? themeUrl : undefined),
    })

    const request = mapArtPreloadRequests(input).find(
      (candidate) => candidate.contentId === 'frigate',
    )
    expect(request?.url).toBe(resolveMapShipUrl(input.spriteUrl, 'french', 'frigate'))
    expect(request?.url).toBe(themeUrl)
    expect(request?.url).not.toBe(mapArtRegistry.ships.french.frigate)
  })

  it('never selects, decodes, or outlines hidden sentinel identities', () => {
    const overrideLookups: string[] = []
    const selected = urls(
      scene({
        captains: [{ ownerId: 'pirate', position: { x: 9, y: 1 }, shipClassId: 'galleon' }],
        cities: [{ ownerId: 'rival', position: { x: 9, y: 2 } }],
        parties: [{ ownerId: 'rival', position: { x: 9, y: 3 } }],
        encounters: [{ kind: 'merchant', position: { x: 9, y: 4 }, active: true }],
        landEncounters: [{ kind: 'hermit', position: { x: 9, y: 5 }, active: true }],
        landSites: [{ kind: 'ruins', position: { x: 9, y: 6 }, active: true, claimedBy: 'rival' }],
        factionOf: () => {
          throw new Error('hidden faction identity was inspected')
        },
        cityFactionOf: () => {
          throw new Error('hidden city identity was inspected')
        },
        spriteUrl: (contentId) => {
          overrideLookups.push(contentId)
          return undefined
        },
      }),
    )

    expect(selected).not.toContain('/art/factions/pirates/ship_galleon_v2.webp')
    expect(selected).not.toContain(mapArtRegistry.cities.spanish)
    expect(selected).not.toContain('/art/parties/spanish.webp')
    expect(selected).not.toContain(mapArtRegistry.seaEncounters.merchant)
    expect(selected).not.toContain(mapArtRegistry.landEncounters.hermit)
    expect(selected).not.toContain(mapArtRegistry.landSites.ruins)
    expect(selected).toEqual([mapArtRegistry.tiles.land, mapArtRegistry.tiles.port])
    expect(overrideLookups).toEqual(['tile:land', 'tile:port'])
  })

  it('keeps the all-family readiness request finite and eligibility-scoped', () => {
    const allVisible = new Set(['1,1', '2,2', '3,3', '4,4', '5,5', '6,6', '7,7'])
    const selected = urls(
      scene({
        captains: [
          { ownerId: 'self', position: { x: 1, y: 1 }, shipClassId: 'sloop' },
          { ownerId: 'pirate', position: { x: 2, y: 2 }, shipClassId: 'galleon' },
        ],
        cities: [
          { ownerId: 'self', position: { x: 3, y: 3 } },
          { ownerId: 'neutral', position: { x: 4, y: 4 } },
        ],
        encounters: [{ kind: 'merchant', position: { x: 5, y: 5 }, active: true }],
        landEncounters: [{ kind: 'banditCamp', position: { x: 6, y: 6 }, active: true }],
        landSites: [{ kind: 'sawmill', position: { x: 7, y: 7 }, active: true }],
        parties: [{ ownerId: 'rival', position: { x: 2, y: 2 } }],
        visibleKeys: allVisible,
        exploredKeys: allVisible,
      }),
    )
    expect(selected.length).toBeLessThanOrEqual(16)
    expect(selected.every(hasPublicAsset)).toBe(true)
  })

  it('blocks readiness only on idle or pending URLs and treats failures as settled', () => {
    const requests = [
      { contentId: 'city:own', url: '/idle.webp' },
      { contentId: 'city:enemy', url: '/loaded.webp' },
      { contentId: 'encounter:merchant', url: '/pending.webp' },
      { contentId: 'landSite:mine', url: '/failed.webp' },
      { contentId: 'party:british', url: '/idle.webp' },
    ]
    const statuses = new Map<string, MapArtLoadStatus>([
      ['/idle.webp', 'idle'],
      ['/loaded.webp', 'loaded'],
      ['/pending.webp', 'pending'],
      ['/failed.webp', 'failed'],
    ])

    expect(unsettledMapArtUrls(requests, (url) => statuses.get(url)!)).toEqual([
      '/idle.webp',
      '/pending.webp',
    ])
  })
})
