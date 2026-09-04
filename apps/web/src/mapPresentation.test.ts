import type { GameMap, TileType } from '@aop/engine'
import { describe, expect, it, vi } from 'vitest'
import {
  PRESENTATION_LAYERS,
  PRESENTATION_THRESHOLDS,
  TERRAIN_ART,
  classifyTerrainNeighbors,
  markerEligible,
  overviewMarkerScreenDiameter,
  overviewMarkerWorldDiameter,
  presentationBand,
  resolveTerrainSprite,
  stableCoordinateHash,
  stableCoordinateUnit,
  stableCoordinateVariant,
  terrainArtPreloadUrls,
  terrainPresentationAt,
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

  it('uses all bases without an identical adjacent pair or repeated 2x2 motif in a 5x5 crop', () => {
    const land = map(
      'square',
      Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'land' as const)),
    )
    const variants = Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 5 }, (_, x) => terrainPresentationAt(land, x, y).baseVariant),
    )
    expect(new Set(variants.flat())).toEqual(new Set([0, 1, 2]))
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if (x > 0) expect(variants[y]![x]).not.toBe(variants[y]![x - 1])
        if (y > 0) expect(variants[y]![x]).not.toBe(variants[y - 1]![x])
      }
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
    expect(motifs.size).toBeGreaterThanOrEqual(6)
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
})
