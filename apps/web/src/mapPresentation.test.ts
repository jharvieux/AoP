import type { GameMap, TileType } from '@aop/engine'
import { describe, expect, it, vi } from 'vitest'
import {
  PRESENTATION_LAYERS,
  PRESENTATION_THRESHOLDS,
  TERRAIN_ART,
  classifyTerrainNeighbors,
  detailedEntityScreenDiameter,
  detailedEntityWorldDiameter,
  markerEligible,
  ownershipMarkerScreenDiameter,
  ownershipMarkerWorldDiameter,
  overviewMarkerScreenDiameter,
  overviewMarkerWorldDiameter,
  presentationBand,
  proceduralPortGeometry,
  resolveDecodedTerrainSprite,
  resolveTerrainSprite,
  stableCoordinateHash,
  stableCoordinateUnit,
  stableCoordinateVariant,
  terrainArtPreloadUrls,
  terrainDecalCandidates,
  terrainPresentationAt,
  terrainTileCandidates,
  topologyNeighbors,
} from './mapPresentation'

function map(topology: 'square' | 'hex', rows: readonly (readonly TileType[])[]): GameMap {
  return {
    width: rows[0]!.length,
    height: rows.length,
    topology,
    tiles: rows
      .flat()
      .map((type) => ({ type, island: type === 'land' || type === 'port' ? 0 : -1 })),
    startPositions: [],
  }
}

describe('stable coordinate presentation', () => {
  it('selects byte-stable hashes and variants without time or random input', () => {
    const first = Array.from({ length: 100 }, (_, index) => ({
      hash: stableCoordinateHash(index % 10, Math.floor(index / 10), 'land'),
      unit: stableCoordinateUnit(index % 10, Math.floor(index / 10), 'land'),
      variant: stableCoordinateVariant(index % 10, Math.floor(index / 10), 3, 'land'),
    }))
    for (let repeat = 0; repeat < 20; repeat++) {
      expect(
        Array.from({ length: 100 }, (_, index) => ({
          hash: stableCoordinateHash(index % 10, Math.floor(index / 10), 'land'),
          unit: stableCoordinateUnit(index % 10, Math.floor(index / 10), 'land'),
          variant: stableCoordinateVariant(index % 10, Math.floor(index / 10), 3, 'land'),
        })),
      ).toEqual(first)
    }
    expect(new Set(first.map((sample) => sample.variant))).toEqual(new Set([0, 1, 2]))
    expect(first.every((sample) => sample.unit >= 0 && sample.unit < 1)).toBe(true)
    expect(() => stableCoordinateVariant(0, 0, 0)).toThrow('positive integer')
  })

  it('contains no nondeterministic clock or random source', () => {
    expect(`${stableCoordinateHash}${terrainPresentationAt}`).not.toMatch(
      /Math\.random|Date\.now|crypto\.getRandomValues/,
    )
  })

  it('salts base selection with only the visible tile content and topology', () => {
    expect(terrainPresentationAt(map('square', [['land']]), 0, 0).baseVariant).toBe(1)
    expect(terrainPresentationAt(map('square', [['port']]), 0, 0).baseVariant).toBe(2)
    expect(terrainPresentationAt(map('hex', [['land']]), 0, 0).baseVariant).toBe(2)
  })

  it.each([
    [
      'square',
      [
        [1, 0, 1, 2, 1],
        [2, 2, 1, 1, 0],
        [0, 2, 2, 0, 1],
        [0, 2, 0, 2, 2],
        [0, 1, 0, 2, 0],
      ],
    ],
    [
      'hex',
      [
        [2, 0, 0, 1, 1],
        [1, 0, 1, 2, 0],
        [1, 2, 1, 0, 0],
        [2, 0, 1, 0, 2],
        [1, 2, 2, 1, 0],
      ],
    ],
  ] as const)('has an irregular, spatially balanced 5x5 %s crop', (topology, expected) => {
    const land = map(
      topology,
      Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'land' as const)),
    )
    const variants = Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 5 }, (_, x) => terrainPresentationAt(land, x, y).baseVariant),
    )
    expect(variants).toEqual(expected)
    expect(new Set(variants.flat())).toEqual(new Set([0, 1, 2]))
    expect(new Set(variants.map((row) => row.join(''))).size).toBe(5)
    expect(
      new Set(Array.from({ length: 5 }, (_, x) => variants.map((row) => row[x]).join(''))).size,
    ).toBe(5)

    let longestAxisRun = 1
    for (const lines of [
      variants,
      Array.from({ length: 5 }, (_, x) => variants.map((row) => row[x]!)),
    ]) {
      for (const line of lines) {
        let run = 1
        for (let index = 1; index < line.length; index++) {
          run = line[index] === line[index - 1] ? run + 1 : 1
          longestAxisRun = Math.max(longestAxisRun, run)
        }
      }
    }
    expect(longestAxisRun).toBeLessThanOrEqual(3)
    for (const parity of [0, 1]) {
      const values = variants.flatMap((row, y) =>
        row.filter((_variant, x) => (x + y) % 2 === parity),
      )
      const dominance = Math.max(
        ...[0, 1, 2].map((variant) => values.filter((value) => value === variant).length),
      )
      expect(dominance / values.length).toBeLessThanOrEqual(0.55)
    }

    const motifs = new Set<string>()
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        motifs.add(
          [variants[y]![x], variants[y]![x + 1], variants[y + 1]![x], variants[y + 1]![x + 1]].join(
            '',
          ),
        )
      }
    }
    expect(motifs.size).toBeGreaterThanOrEqual(14)

    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
      [2, 0],
      [0, 2],
    ] as const) {
      let matches = 0
      let samples = 0
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          const otherX = x + dx
          const otherY = y + dy
          if (otherX < 0 || otherX >= 5 || otherY < 0 || otherY >= 5) continue
          matches += Number(variants[y]![x] === variants[otherY]![otherX])
          samples++
        }
      }
      expect(matches / samples).toBeLessThanOrEqual(0.5)
    }
  })
})

describe('topology-aware terrain classification', () => {
  it('classifies all eight square neighbors, explicit map edges, shore, and a port water edge', () => {
    const square = map('square', [
      ['land', 'shallows', 'land'],
      ['deep', 'port', 'land'],
      ['land', 'land', 'land'],
    ])
    const center = classifyTerrainNeighbors(square, 1, 1)
    expect(center.neighbors).toHaveLength(8)
    expect(center.water.map((neighbor) => neighbor.direction).sort()).toEqual(['n', 'w'])
    expect(center.shoreAdjacent).toBe(true)
    expect(center.preferredWater && center.water).toContainEqual(center.preferredWater)

    const corner = classifyTerrainNeighbors(square, 0, 0)
    expect(corner.mapEdges.map((neighbor) => neighbor.direction).sort()).toEqual([
      'n',
      'ne',
      'nw',
      'sw',
      'w',
    ])
    expect(corner.water.map((neighbor) => neighbor.direction).sort()).toEqual(['e', 's'])
  })

  it('uses the six odd-r hex neighbors at both row parities and never treats an edge as water', () => {
    expect(topologyNeighbors('hex', 2, 2).map(({ direction, x, y }) => [direction, x, y])).toEqual([
      ['e', 3, 2],
      ['ne', 2, 1],
      ['nw', 1, 1],
      ['w', 1, 2],
      ['sw', 1, 3],
      ['se', 2, 3],
    ])
    expect(topologyNeighbors('hex', 2, 3).map(({ direction, x, y }) => [direction, x, y])).toEqual([
      ['e', 3, 3],
      ['ne', 3, 2],
      ['nw', 2, 2],
      ['w', 1, 3],
      ['sw', 2, 4],
      ['se', 3, 4],
    ])

    const hex = map('hex', [
      ['port', 'deep', 'land'],
      ['shallows', 'land', 'land'],
      ['land', 'land', 'land'],
    ])
    const corner = classifyTerrainNeighbors(hex, 0, 0)
    expect(corner.neighbors).toHaveLength(6)
    expect(corner.mapEdges.map((neighbor) => neighbor.direction).sort()).toEqual([
      'ne',
      'nw',
      'sw',
      'w',
    ])
    expect(corner.water.map((neighbor) => neighbor.direction).sort()).toEqual(['e', 'se'])
    const port = terrainPresentationAt(hex, 0, 0)
    expect(port.portFacing && corner.water).toContainEqual(port.portFacing)
    expect([0, 1]).toContain(port.portOverlayVariant)
  })

  it('does not inspect or orient toward an unknown neighboring tile', () => {
    const square = map('square', [
      ['land', 'deep', 'land'],
      ['land', 'port', 'shallows'],
      ['land', 'land', 'land'],
    ])
    const tiles = new Proxy(square.tiles, {
      get(target, property, receiver) {
        const index = Number(property)
        if (Number.isInteger(index) && index !== 1 && index !== 4) {
          throw new Error(`hidden tile ${index} was read`)
        }
        return Reflect.get(target, property, receiver)
      },
    })
    const guarded = { ...square, tiles }
    const classification = classifyTerrainNeighbors(guarded, 1, 1, {
      isKnown: (x, y) => x === 1 && y === 0,
    })
    expect(classification.water.map(({ direction }) => direction)).toEqual(['n'])
    expect(classification.unknown).toHaveLength(7)
    expect(
      terrainPresentationAt(guarded, 1, 1, {
        isKnown: (x, y) => x === 1 && y === 0,
      }).portFacing?.direction,
    ).toBe('n')

    const fullyUnknown = terrainPresentationAt(square, 1, 1, { isKnown: () => false })
    expect(fullyUnknown.shoreAdjacent).toBe(false)
    expect(fullyUnknown.portFacing).toBeNull()
  })
})

describe('semantic zoom', () => {
  const { overviewToTacticalPx, tacticalToDetailPx, overviewHysteresisPx, detailHysteresisPx } =
    PRESENTATION_THRESHOLDS

  it('selects every nominal threshold exactly', () => {
    expect(presentationBand(overviewToTacticalPx - 0.001)).toBe('overview')
    expect(presentationBand(overviewToTacticalPx)).toBe('tactical')
    expect(presentationBand(tacticalToDetailPx - 0.001)).toBe('tactical')
    expect(presentationBand(tacticalToDetailPx)).toBe('detail')
    expect(presentationBand(Number.NaN)).toBe('overview')
  })

  it('holds both dead zones in both zoom directions and permits direct jumps', () => {
    expect(presentationBand(overviewToTacticalPx + overviewHysteresisPx - 0.001, 'overview')).toBe(
      'overview',
    )
    expect(presentationBand(overviewToTacticalPx + overviewHysteresisPx, 'overview')).toBe(
      'tactical',
    )
    expect(presentationBand(overviewToTacticalPx - overviewHysteresisPx + 0.001, 'tactical')).toBe(
      'tactical',
    )
    expect(presentationBand(overviewToTacticalPx - overviewHysteresisPx, 'tactical')).toBe(
      'overview',
    )
    expect(presentationBand(tacticalToDetailPx + detailHysteresisPx - 0.001, 'tactical')).toBe(
      'tactical',
    )
    expect(presentationBand(tacticalToDetailPx + detailHysteresisPx, 'tactical')).toBe('detail')
    expect(presentationBand(tacticalToDetailPx - detailHysteresisPx + 0.001, 'detail')).toBe(
      'detail',
    )
    expect(presentationBand(tacticalToDetailPx - detailHysteresisPx, 'detail')).toBe('tactical')
    expect(presentationBand(64, 'overview')).toBe('detail')
    expect(presentationBand(4, 'detail')).toBe('overview')
  })

  it('makes overview materially cheaper than tactical/detail', () => {
    expect(PRESENTATION_LAYERS.overview).toEqual({
      terrainTiles: false,
      terrainDecals: 'none',
      fullEntityArt: false,
      rangeAndRoutes: false,
      waterGlints: false,
      waterCaustics: false,
      layeredSurf: false,
    })
    expect(PRESENTATION_LAYERS.tactical.rangeAndRoutes).toBe(true)
    expect(PRESENTATION_LAYERS.detail.terrainDecals).toBe('rich')
    expect(PRESENTATION_LAYERS.detail.waterCaustics).toBe(true)
  })
})

describe('visibility-safe markers and sizing', () => {
  it.each([
    ['city', true, false, false, true],
    ['city', false, false, true, true],
    ['city', false, true, false, false],
    ['fleet', true, false, false, true],
    ['fleet', false, true, false, true],
    ['fleet', false, false, true, false],
    ['party', true, false, false, true],
    ['party', false, true, false, true],
    ['party', false, false, true, false],
    ['encounter', false, true, true, true],
    ['encounter', false, false, true, false],
    ['site', false, true, true, true],
    ['site', false, false, true, false],
  ] as const)(
    '%s own=%s visible=%s explored=%s -> %s',
    (family, own, visible, explored, expected) => {
      expect(markerEligible({ family, own, visible, explored })).toBe(expected)
    },
  )

  it('keeps inactive/unavailable markers hidden regardless of ownership or fog', () => {
    expect(
      markerEligible({ family: 'encounter', active: false, explored: true, visible: true }),
    ).toBe(false)
    expect(
      markerEligible({
        family: 'fleet',
        own: true,
        unavailable: true,
        explored: true,
        visible: true,
      }),
    ).toBe(false)
  })

  it('keeps overview marks bounded in screen pixels while converting to world size', () => {
    expect(overviewMarkerScreenDiameter('city', 4)).toBe(12)
    expect(overviewMarkerScreenDiameter('city', 20)).toBe(18)
    expect(overviewMarkerScreenDiameter('fleet', 8)).toBe(12)
    expect(overviewMarkerWorldDiameter('fleet', 32, 0.25)).toBe(48)
    expect(overviewMarkerWorldDiameter('fleet', 32, 1)).toBe(16)
    expect(() => overviewMarkerWorldDiameter('fleet', 32, 0)).toThrow('positive')
  })

  it.each([
    ['phone', 390, 844],
    ['desktop', 1440, 900],
  ])('enforces tactical and detail screen-space bands on %s (%ix%i)', (_label, _width, _height) => {
    const tacticalSamples = [
      detailedEntityScreenDiameter('tactical', 32 * 0.45, 0.6),
      detailedEntityScreenDiameter('tactical', 44.8, 1.05),
      detailedEntityScreenDiameter('tactical', 51.2, 1.05),
    ]
    const detailSamples = [
      detailedEntityScreenDiameter('detail', 44.8, 0.6),
      detailedEntityScreenDiameter('detail', 51.2, 1.05),
      detailedEntityScreenDiameter('detail', 32 * 3, 1.05),
    ]
    expect(tacticalSamples.every((diameter) => diameter >= 24 && diameter <= 40)).toBe(true)
    expect(detailSamples.every((diameter) => diameter >= 40 && diameter <= 64)).toBe(true)
    expect(ownershipMarkerScreenDiameter('tactical', 32 * 0.45)).toBe(24)
    expect(ownershipMarkerScreenDiameter('tactical', 51.2)).toBe(40)
    expect(ownershipMarkerScreenDiameter('detail', 44.8)).toBeCloseTo(49.28)
    expect(ownershipMarkerScreenDiameter('detail', 32 * 3)).toBe(64)
  })

  it('covers hysteresis extrema and direct 0.45x/3x jumps without out-of-band art', () => {
    const lowJumpBand = presentationBand(32 * 0.45, 'overview')
    const highJumpBand = presentationBand(32 * 3, 'overview')
    expect(lowJumpBand).toBe('tactical')
    expect(highJumpBand).toBe('detail')
    expect(detailedEntityScreenDiameter(lowJumpBand as 'tactical', 32 * 0.45, 0.65)).toBe(24)
    expect(detailedEntityScreenDiameter(highJumpBand as 'detail', 32 * 3, 0.95)).toBe(64)

    expect(detailedEntityScreenDiameter('tactical', 51.2, 2)).toBe(40)
    expect(detailedEntityScreenDiameter('detail', 44.8, 0.1)).toBe(40)
    expect(detailedEntityWorldDiameter('tactical', 32, 0.45, 0.6) * 0.45).toBe(24)
    expect(ownershipMarkerWorldDiameter('detail', 32, 3) * 3).toBe(64)
    expect(() => detailedEntityWorldDiameter('detail', 32, 0)).toThrow('positive')
    expect(() => ownershipMarkerWorldDiameter('detail', 32, 0)).toThrow('positive')
  })
})

describe('terrain theme fallback and preload', () => {
  it('resolves theme variant, then theme base, then shipped default', () => {
    const variantLookup = vi.fn((id: string) =>
      id === 'tile:land:edge:2' ? '/theme/land-edge-2.webp' : '/theme/land.webp',
    )
    expect(resolveTerrainSprite(variantLookup, 'land', 2, '/default/land-2.webp')).toEqual({
      url: '/theme/land-edge-2.webp',
      source: 'theme-variant',
    })
    expect(variantLookup).toHaveBeenCalledTimes(1)
    expect(variantLookup).toHaveBeenCalledWith('tile:land:edge:2')

    const baseLookup = vi.fn((id: string) => (id === 'tile:land' ? '/theme/land.webp' : undefined))
    expect(resolveTerrainSprite(baseLookup, 'land', 2, '/default/land-2.webp')).toEqual({
      url: '/theme/land.webp',
      source: 'theme-base',
    })
    expect(baseLookup.mock.calls.map(([id]) => id)).toEqual(['tile:land:edge:2', 'tile:land'])

    expect(resolveTerrainSprite(() => undefined, 'land', 2, '/default/land-2.webp')).toEqual({
      url: '/default/land-2.webp',
      source: 'default',
    })

    const baseVariantLookup = vi.fn(() => '/theme/land.webp')
    expect(resolveTerrainSprite(baseVariantLookup, 'land', 0, '/default/land-0.webp')).toEqual({
      url: '/theme/land.webp',
      source: 'theme-base',
    })
    expect(baseVariantLookup).toHaveBeenCalledTimes(1)
    expect(baseVariantLookup).toHaveBeenCalledWith('tile:land')
  })

  it.each([
    ['base', terrainTileCandidates((id) => `/theme/${id}.webp`, 'land', 2, '/default/land.webp')],
    [
      'decal',
      terrainDecalCandidates((id) => `/theme/${id}.webp`, {
        kind: 'forest' as const,
        variant: 1 as const,
      }),
    ],
    [
      'port',
      terrainTileCandidates((id) => `/theme/${id}.webp`, 'port', 6, TERRAIN_ART.portOverlays[1]),
    ],
  ])('falls through %s candidates by decode result, including procedural', (_kind, candidates) => {
    expect(candidates.map(({ source }) => source)).toEqual([
      'theme-variant',
      'theme-base',
      'default',
    ])
    const first = { decoded: 'first' }
    const firstProbe = vi.fn((url: string) => (url === candidates[0]!.url ? first : undefined))
    expect(resolveDecodedTerrainSprite(candidates, firstProbe)).toEqual({
      ...candidates[0],
      texture: first,
    })
    expect(firstProbe.mock.calls.map(([url]) => url)).toEqual([candidates[0]!.url])

    const middle = { decoded: 'middle' }
    const middleProbe = vi.fn((url: string) => (url === candidates[1]!.url ? middle : undefined))
    expect(resolveDecodedTerrainSprite(candidates, middleProbe)).toEqual({
      ...candidates[1],
      texture: middle,
    })
    expect(middleProbe.mock.calls.map(([url]) => url)).toEqual([
      candidates[0]!.url,
      candidates[1]!.url,
    ])

    const shipped = { decoded: 'shipped' }
    expect(
      resolveDecodedTerrainSprite(candidates, (url) =>
        url === candidates[2]!.url ? shipped : undefined,
      ),
    ).toEqual({ ...candidates[2], texture: shipped })
    const failureProbe = vi.fn(() => undefined)
    expect(resolveDecodedTerrainSprite(candidates, failureProbe)).toEqual({
      url: undefined,
      source: 'procedural',
      texture: undefined,
    })
    expect(failureProbe).toHaveBeenCalledTimes(candidates.length)
  })

  it('deduplicates identical fallback URLs without changing first-source precedence', () => {
    const candidates = terrainTileCandidates(() => '/same.webp', 'land', 2, '/same.webp')
    expect(candidates).toEqual([{ url: '/same.webp', source: 'theme-variant' }])
  })

  it('preloads every shipped terrain asset once without inspecting map state', () => {
    const urls = terrainArtPreloadUrls(() => undefined)
    expect(urls).toEqual(
      [
        ...TERRAIN_ART.landBases,
        ...TERRAIN_ART.forestDecals,
        TERRAIN_ART.clearingDecal,
        TERRAIN_ART.highlandDecal,
        ...TERRAIN_ART.portOverlays,
      ].sort(),
    )
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('preloads every theme rung and shipped fallback in a finite, map-independent set', () => {
    const lookups: string[] = []
    const urls = terrainArtPreloadUrls((contentId) => {
      lookups.push(contentId)
      return `/theme/${contentId}.webp`
    })
    expect(urls).toEqual(expect.arrayContaining([...TERRAIN_ART.landBases]))
    expect(urls).toEqual(expect.arrayContaining([...TERRAIN_ART.portOverlays]))
    expect(urls).toContain('/theme/tile:land:edge:1.webp')
    expect(urls).toContain('/theme/tile:land:edge:2.webp')
    expect(urls).toContain('/theme/tile:land.webp')
    expect(urls).toContain('/theme/tile:port:edge:8.webp')
    expect(urls).toContain('/theme/tile:port.webp')
    expect(urls).toContain('/theme/terrain:decal:forest:variant:2.webp')
    expect(urls).toContain('/theme/terrain:decal:forest.webp')
    expect(new Set(urls).size).toBe(urls.length)
    expect(new Set(lookups).size).toBeLessThanOrEqual(20)
    expect(lookups).toHaveLength(new Set(lookups).size)
  })

  it.each([
    ['square east', { x: 16, y: 16 }, { x: 48, y: 16 }],
    ['square north', { x: 16, y: 16 }, { x: 16, y: -16 }],
    ['odd-r hex southeast', { x: 80, y: 88 }, { x: 96, y: 116 }],
  ])('orients procedural %s ports toward known water', (_label, center, water) => {
    const straight = proceduralPortGeometry(center, water, 32, 0)
    const lPort = proceduralPortGeometry(center, water, 32, 1)
    const towardWater = {
      x: water.x - center.x,
      y: water.y - center.y,
    }
    const pier = {
      x: straight.main[1].x - straight.main[0].x,
      y: straight.main[1].y - straight.main[0].y,
    }
    expect(pier.x * towardWater.x + pier.y * towardWater.y).toBeGreaterThan(0)
    expect(straight.arm).toBeNull()
    expect(lPort.arm).not.toBeNull()
    expect(lPort.direction.x).toBeCloseTo(straight.direction.x)
    expect(lPort.direction.y).toBeCloseTo(straight.direction.y)
  })
})
