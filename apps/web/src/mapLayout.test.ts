import { STARTING_MAP, STARTING_MAP_HEX } from '@aop/content'
import { describe, expect, it } from 'vitest'
import {
  cellCenter,
  cellPolygon,
  hexCorners,
  hexSize,
  mapPixelExtent,
  pixelToCell,
  visibleCellBounds,
} from './mapLayout'

/**
 * Phase 4 UI geometry contract (#348): the pure screen ↔ grid math MapCanvas /
 * Minimap render and route input through. The load-bearing guarantees are
 * (1) square output is byte-identical to the arithmetic these components used
 * before mapLayout existed — backward compat — and (2) a click on any hex round
 * trips back to that hex — input correctness. Both authored maps (STARTING_MAP
 * square, STARTING_MAP_HEX) are exercised end-to-end so "renders without errors"
 * means every cell of a real map produces finite, in-extent geometry.
 */

const TILE = 32

describe('cellCenter — square is byte-identical to the prior inline math', () => {
  it('places a tile centre at x*TILE + TILE/2', () => {
    for (const [x, y] of [
      [0, 0],
      [3, 7],
      [31, 31],
    ]) {
      expect(cellCenter('square', x!, y!, TILE)).toEqual({
        x: x! * TILE + TILE / 2,
        y: y! * TILE + TILE / 2,
      })
    }
  })
})

describe('pixelToCell — square is byte-identical to floor-divide', () => {
  it('inverts a pixel back to floor(px / TILE)', () => {
    expect(pixelToCell('square', 0, 0, TILE)).toEqual({ x: 0, y: 0 })
    expect(pixelToCell('square', 40, 70, TILE)).toEqual({ x: 1, y: 2 })
    expect(pixelToCell('square', 31.9, 31.9, TILE)).toEqual({ x: 0, y: 0 })
  })
})

describe('round trip: a click on a cell centre selects that cell', () => {
  for (const topology of ['square', 'hex'] as const) {
    it(`${topology}: pixelToCell(cellCenter(x,y)) === (x,y) across a grid`, () => {
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 12; x++) {
          const c = cellCenter(topology, x, y, TILE)
          expect(pixelToCell(topology, c.x, c.y, TILE)).toEqual({ x, y })
        }
      }
    })
  }
})

describe('hex layout geometry', () => {
  it('sizes a hex so it is exactly TILE wide (SQRT3 * size = TILE)', () => {
    expect(hexSize(TILE) * Math.sqrt(3)).toBeCloseTo(TILE)
  })

  it('places tile (0,0) fully in the positive quadrant', () => {
    const c = cellCenter('hex', 0, 0, TILE)
    const corners = hexCorners(c.x, c.y, hexSize(TILE))
    for (let i = 0; i < corners.length; i += 2) {
      expect(corners[i]!).toBeGreaterThanOrEqual(-1e-9)
      expect(corners[i + 1]!).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('staggers odd rows right of even rows by half a hex width', () => {
    const even = cellCenter('hex', 0, 0, TILE)
    const odd = cellCenter('hex', 0, 1, TILE)
    expect(odd.x - even.x).toBeCloseTo((hexSize(TILE) * Math.sqrt(3)) / 2)
    expect(odd.y).toBeGreaterThan(even.y)
  })

  it('hexCorners returns six finite corners centred on the point', () => {
    const corners = hexCorners(100, 50, hexSize(TILE))
    expect(corners).toHaveLength(12)
    let sx = 0
    let sy = 0
    for (let i = 0; i < corners.length; i += 2) {
      expect(Number.isFinite(corners[i]!)).toBe(true)
      expect(Number.isFinite(corners[i + 1]!)).toBe(true)
      sx += corners[i]!
      sy += corners[i + 1]!
    }
    expect(sx / 6).toBeCloseTo(100)
    expect(sy / 6).toBeCloseTo(50)
  })
})

describe('cellPolygon', () => {
  it('square: the four axis-aligned corners of the tile box', () => {
    expect(cellPolygon('square', 1, 2, TILE)).toEqual([
      1 * TILE,
      2 * TILE,
      2 * TILE,
      2 * TILE,
      2 * TILE,
      3 * TILE,
      1 * TILE,
      3 * TILE,
    ])
  })

  it('hex: six corners around the hex centre', () => {
    expect(cellPolygon('hex', 3, 4, TILE)).toHaveLength(12)
  })
})

describe('mapPixelExtent', () => {
  it('square: width×height tiles exactly', () => {
    expect(mapPixelExtent('square', 24, 24, TILE)).toEqual({ width: 24 * TILE, height: 24 * TILE })
  })

  it('hex: encloses every cell centre with room for its corners', () => {
    const w = 10
    const h = 10
    const extent = mapPixelExtent('hex', w, h, TILE)
    const s = hexSize(TILE)
    // Pointy-top: horizontal reach to the flat side is half a hex width; vertical
    // reach to the top/bottom point is the corner radius s.
    const halfW = (Math.sqrt(3) * s) / 2
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = cellCenter('hex', x, y, TILE)
        expect(c.x).toBeGreaterThanOrEqual(-1e-9)
        expect(c.y).toBeGreaterThanOrEqual(-1e-9)
        // full hex fits inside the extent
        expect(c.x + halfW).toBeLessThanOrEqual(extent.width + 1e-9)
        expect(c.y + s).toBeLessThanOrEqual(extent.height + 1e-9)
      }
    }
  })
})

describe('visibleCellBounds', () => {
  const map = { width: 24, height: 24 }
  const view = { x: -100, y: -60, scale: 1.5 }

  it('square reproduces the prior culling window exactly', () => {
    const vw = 800
    const vh = 600
    expect(visibleCellBounds('square', map, view, vw, vh, TILE)).toEqual({
      minX: Math.max(0, Math.floor(-view.x / view.scale / TILE) - 1),
      minY: Math.max(0, Math.floor(-view.y / view.scale / TILE) - 1),
      maxX: Math.min(map.width - 1, Math.ceil((vw - view.x) / view.scale / TILE) + 1),
      maxY: Math.min(map.height - 1, Math.ceil((vh - view.y) / view.scale / TILE) + 1),
    })
  })

  it('hex bounds contain every hex whose centre is on screen', () => {
    const vw = 400
    const vh = 300
    const b = visibleCellBounds('hex', map, view, vw, vh, TILE)
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const c = cellCenter('hex', x, y, TILE)
        const sx = c.x * view.scale + view.x
        const sy = c.y * view.scale + view.y
        if (sx >= 0 && sx <= vw && sy >= 0 && sy <= vh) {
          expect(x).toBeGreaterThanOrEqual(b.minX)
          expect(x).toBeLessThanOrEqual(b.maxX)
          expect(y).toBeGreaterThanOrEqual(b.minY)
          expect(y).toBeLessThanOrEqual(b.maxY)
        }
      }
    }
  })

  it('clamps to the map on both axes', () => {
    const b = visibleCellBounds('hex', map, { x: 0, y: 0, scale: 1 }, 100000, 100000, TILE)
    expect(b.minX).toBe(0)
    expect(b.minY).toBe(0)
    expect(b.maxX).toBe(map.width - 1)
    expect(b.maxY).toBe(map.height - 1)
  })
})

describe('authored maps render + route input without errors', () => {
  const maps = [
    { name: 'STARTING_MAP (square)', map: STARTING_MAP, topology: 'square' as const },
    { name: 'STARTING_MAP_HEX (hex)', map: STARTING_MAP_HEX, topology: 'hex' as const },
  ]

  for (const { name, map, topology } of maps) {
    it(`${name}: every cell has finite, in-extent geometry that round-trips`, () => {
      const extent = mapPixelExtent(topology, map.width, map.height, TILE)
      expect(extent.width).toBeGreaterThan(0)
      expect(extent.height).toBeGreaterThan(0)
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const c = cellCenter(topology, x, y, TILE)
          expect(Number.isFinite(c.x)).toBe(true)
          expect(Number.isFinite(c.y)).toBe(true)
          expect(c.x).toBeGreaterThanOrEqual(-1e-9)
          expect(c.y).toBeGreaterThanOrEqual(-1e-9)
          expect(c.x).toBeLessThanOrEqual(extent.width + 1e-9)
          expect(c.y).toBeLessThanOrEqual(extent.height + 1e-9)
          // A click at the cell's centre selects that same cell.
          expect(pixelToCell(topology, c.x, c.y, TILE)).toEqual({ x, y })
          const poly = cellPolygon(topology, x, y, TILE)
          expect(poly.every((n) => Number.isFinite(n))).toBe(true)
        }
      }
    })
  }
})
