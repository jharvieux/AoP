import type { GridTopology } from '@aop/engine'
import { describe, expect, it } from 'vitest'
import mapCanvasSource from './MapCanvas.tsx?raw'
import { clampCamera, type CameraConfig, type CameraView } from './mapCamera'
import { describeMapTile, moveCursor, panToKeepTileVisible } from './mapCursor'
import { cellPolygon } from './mapLayout'

const PIXEL_EPSILON = 1e-9
const HEX_96_CAMERA: CameraConfig = {
  topology: 'hex',
  mapWidth: 96,
  mapHeight: 96,
  tileSize: 32,
  viewportWidth: 800,
  viewportHeight: 600,
  padding: 32,
  minimumScale: 0.4,
  absoluteMinimumScale: 0.08,
  maximumScale: 3,
}

function expectTileInsideViewport(
  topology: GridTopology,
  view: CameraView,
  tile: { x: number; y: number },
  tileSize: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const polygon = cellPolygon(topology, tile.x, tile.y, tileSize)
  for (let index = 0; index < polygon.length; index += 2) {
    const screenX = polygon[index]! * view.scale + view.x
    const screenY = polygon[index + 1]! * view.scale + view.y
    expect(screenX).toBeGreaterThanOrEqual(-PIXEL_EPSILON)
    expect(screenX).toBeLessThanOrEqual(viewportWidth + PIXEL_EPSILON)
    expect(screenY).toBeGreaterThanOrEqual(-PIXEL_EPSILON)
    expect(screenY).toBeLessThanOrEqual(viewportHeight + PIXEL_EPSILON)
  }
}

describe('moveCursor', () => {
  it('moves one tile per arrow key', () => {
    expect(moveCursor({ x: 5, y: 5 }, 'ArrowUp', 10, 10)).toEqual({ x: 5, y: 4 })
    expect(moveCursor({ x: 5, y: 5 }, 'ArrowDown', 10, 10)).toEqual({ x: 5, y: 6 })
    expect(moveCursor({ x: 5, y: 5 }, 'ArrowLeft', 10, 10)).toEqual({ x: 4, y: 5 })
    expect(moveCursor({ x: 5, y: 5 }, 'ArrowRight', 10, 10)).toEqual({ x: 6, y: 5 })
  })

  it('clamps at the map edges instead of moving off it', () => {
    expect(moveCursor({ x: 0, y: 0 }, 'ArrowUp', 10, 10)).toEqual({ x: 0, y: 0 })
    expect(moveCursor({ x: 0, y: 0 }, 'ArrowLeft', 10, 10)).toEqual({ x: 0, y: 0 })
    expect(moveCursor({ x: 9, y: 9 }, 'ArrowDown', 10, 10)).toEqual({ x: 9, y: 9 })
    expect(moveCursor({ x: 9, y: 9 }, 'ArrowRight', 10, 10)).toEqual({ x: 9, y: 9 })
  })

  it('returns null for a non-arrow key so the caller ignores it', () => {
    expect(moveCursor({ x: 5, y: 5 }, 'Enter', 10, 10)).toBeNull()
    expect(moveCursor({ x: 5, y: 5 }, 'Tab', 10, 10)).toBeNull()
  })
})

describe('panToKeepTileVisible', () => {
  const view = { x: 0, y: 0, scale: 1 }

  it('is a no-op when the tile is already fully visible', () => {
    expect(panToKeepTileVisible(view, { x: 2, y: 2 }, 32, 800, 600)).toEqual({ x: 0, y: 0 })
  })

  it('pans right/down when the tile is past the right/bottom edge', () => {
    // Tile 30 at 32px/tile = pixel 960, past an 800-wide viewport.
    const result = panToKeepTileVisible(view, { x: 30, y: 0 }, 32, 800, 600)
    expect(result.x).toBeLessThan(0) // camera shifts left to bring it into view
    expect(result.y).toBe(0)
  })

  it('pans left/up when the tile is before the left/top edge', () => {
    const shiftedView = { x: -500, y: -500, scale: 1 }
    const result = panToKeepTileVisible(shiftedView, { x: 2, y: 2 }, 32, 800, 600)
    expect(result.x).toBeGreaterThan(shiftedView.x)
    expect(result.y).toBeGreaterThan(shiftedView.y)
  })

  it('accounts for zoom scale when computing the tile screen rect', () => {
    const zoomedView = { x: 0, y: 0, scale: 2 }
    // At 2x zoom, tile 20 (pixel 1280) is off an 800-wide viewport even though
    // it wouldn't be at 1x zoom (pixel 640).
    const result = panToKeepTileVisible(zoomedView, { x: 20, y: 0 }, 32, 800, 600)
    expect(result.x).toBeLessThan(0)
  })

  it('reveals tile (0,30) on a 96x96 hex map from y=-1000 at scale 1', () => {
    const hexView = clampCamera({ x: 0, y: -1000, scale: 1 }, HEX_96_CAMERA)
    const tile = { x: 0, y: 30 }
    const result = panToKeepTileVisible(
      hexView,
      tile,
      HEX_96_CAMERA.tileSize,
      HEX_96_CAMERA.viewportWidth,
      HEX_96_CAMERA.viewportHeight,
      HEX_96_CAMERA.topology,
    )
    const revealed = { ...hexView, ...result }

    expect(hexView).toEqual({ x: 0, y: -1000, scale: 1 })
    expect(result.y).toBeGreaterThan(hexView.y)
    expectTileInsideViewport(
      HEX_96_CAMERA.topology,
      revealed,
      tile,
      HEX_96_CAMERA.tileSize,
      HEX_96_CAMERA.viewportWidth,
      HEX_96_CAMERA.viewportHeight,
    )
  })

  it('honors the odd-row stagger at the hex map left edge', () => {
    const hexView = { x: -20, y: 0, scale: 1 }
    const tile = { x: 0, y: 1 }
    const result = panToKeepTileVisible(hexView, tile, 32, 800, 600, 'hex')
    const revealed = { ...hexView, ...result }

    expect(result.x).toBeCloseTo(-16)
    expectTileInsideViewport('hex', revealed, tile, 32, 800, 600)
  })

  it('uses scaled hex corners when zoomed', () => {
    const hexView = { x: 0, y: 0, scale: 2 }
    const tile = { x: 20, y: 1 }
    const result = panToKeepTileVisible(hexView, tile, 32, 800, 600, 'hex')
    const revealed = { ...hexView, ...result }

    expect(result.x).toBeLessThan(0)
    expectTileInsideViewport('hex', revealed, tile, 32, 800, 600)
  })

  it('keeps a revealed edge hex visible after normal camera clamping', () => {
    const view = clampCamera({ x: 0, y: 0, scale: 1 }, HEX_96_CAMERA)
    const tile = { x: 95, y: 95 }
    const position = panToKeepTileVisible(
      view,
      tile,
      HEX_96_CAMERA.tileSize,
      HEX_96_CAMERA.viewportWidth,
      HEX_96_CAMERA.viewportHeight,
      HEX_96_CAMERA.topology,
    )
    const clamped = clampCamera({ ...view, ...position }, HEX_96_CAMERA)

    expectTileInsideViewport(
      HEX_96_CAMERA.topology,
      clamped,
      tile,
      HEX_96_CAMERA.tileSize,
      HEX_96_CAMERA.viewportWidth,
      HEX_96_CAMERA.viewportHeight,
    )
  })

  it('preserves the square camera results exactly', () => {
    expect(panToKeepTileVisible(view, { x: 30, y: 0 }, 32, 800, 600, 'square')).toEqual({
      x: -192,
      y: 0,
    })
    expect(
      panToKeepTileVisible({ x: -500, y: -500, scale: 1 }, { x: 2, y: 2 }, 32, 800, 600),
    ).toEqual({ x: -64, y: -64 })
    expect(panToKeepTileVisible({ x: 0, y: 0, scale: 2 }, { x: 20, y: 0 }, 32, 800, 600)).toEqual({
      x: -544,
      y: 0,
    })
  })

  it('wires live topology through MapCanvas without bypassing cancellation or clamping', () => {
    expect(mapCanvasSource).toMatch(
      /keepTileVisible: \(tile\) => \{\s*stopCameraMotion\(\)\s*const \{ w, h \} = viewportSize\(\)\s*const position = panToKeepTileVisible\(\s*view,\s*tile,\s*TILE,\s*w,\s*h,\s*mapTopology\(propsRef\.current\.map\),?\s*\)\s*publishCamera\(\{ \.\.\.view, \.\.\.position \}\)/,
    )
  })
})

describe('describeMapTile', () => {
  const base = {
    tile: { x: 3, y: 4 },
    terrain: 'deep' as const,
    captains: [],
    cities: [],
    encounters: [],
    viewerId: 'p1',
    factionNameOf: () => 'Corsairs',
  }

  it('uses 1-based coordinates', () => {
    expect(describeMapTile(base)).toContain('column 4, row 5')
  })

  it('describes empty terrain when nothing occupies the tile', () => {
    expect(describeMapTile({ ...base, terrain: 'port' })).toContain('port')
  })

  it("labels the viewer's own captain as 'Your'", () => {
    const text = describeMapTile({
      ...base,
      captains: [{ position: { x: 3, y: 4 }, ownerId: 'p1' }],
    })
    expect(text).toContain('Your Corsairs ship')
  })

  it("labels another player's captain as 'Enemy'", () => {
    const text = describeMapTile({
      ...base,
      captains: [{ position: { x: 3, y: 4 }, ownerId: 'p2' }],
    })
    expect(text).toContain('Enemy Corsairs ship')
  })

  it('describes an owned vs. enemy city', () => {
    expect(
      describeMapTile({ ...base, cities: [{ position: { x: 3, y: 4 }, ownerId: 'p1' }] }),
    ).toContain('your city')
    expect(
      describeMapTile({ ...base, cities: [{ position: { x: 3, y: 4 }, ownerId: 'p2' }] }),
    ).toContain('enemy city')
  })

  it('describes an active encounter but ignores an inactive one', () => {
    const active = describeMapTile({
      ...base,
      encounters: [{ position: { x: 3, y: 4 }, kind: 'merchant', active: true }],
    })
    expect(active).toContain('merchant encounter')

    const inactive = describeMapTile({
      ...base,
      encounters: [{ position: { x: 3, y: 4 }, kind: 'merchant', active: false }],
    })
    expect(inactive).not.toContain('merchant')
    expect(inactive).toContain('open water')
  })

  it('ignores entities on other tiles', () => {
    const text = describeMapTile({
      ...base,
      captains: [{ position: { x: 0, y: 0 }, ownerId: 'p1' }],
    })
    expect(text).toContain('open water')
    expect(text).not.toContain('ship')
  })
})
