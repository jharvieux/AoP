import { describe, expect, it } from 'vitest'
import {
  mapArtDefaultUrls,
  mapArtPreloadRequests,
  mapArtRegistry,
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
  it('maps the 21 approved identities plus two runtime sea-family replacements to files', () => {
    const generatedUrls = [
      ...Object.values(mapArtRegistry.cities),
      ...Object.values(mapArtRegistry.generatedShips),
      ...Object.values(mapArtRegistry.parties),
      ...Object.values(mapArtRegistry.seaEncounters),
      ...Object.values(mapArtRegistry.landEncounters),
      ...Object.values(mapArtRegistry.landSites),
    ]

    expect(generatedUrls).toHaveLength(23)
    expect(new Set(generatedUrls)).toHaveLength(23)
    for (const url of generatedUrls) {
      expect(hasPublicAsset(url), `${url} missing under public`).toBe(true)
    }
  })

  it('keeps every selectable default URL backed by a public asset', () => {
    for (const url of mapArtDefaultUrls()) {
      expect(hasPublicAsset(url), `${url} missing under public`).toBe(true)
    }
  })
})

describe('mapArtPreloadRequests', () => {
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
