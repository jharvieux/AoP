import { mapPixelExtent } from './mapLayout'
import {
  advanceCameraTransition,
  cameraTranslationBounds,
  cancelCameraTransition,
  centerCameraOnTile,
  clampCamera,
  createCameraTransition,
  fitMapCamera,
  minimumCameraScale,
  zoomCameraAt,
  type CameraConfig,
} from './mapCamera'
import { describe, expect, it } from 'vitest'

function config(overrides: Partial<CameraConfig> = {}): CameraConfig {
  return {
    topology: 'square',
    mapWidth: 100,
    mapHeight: 100,
    tileSize: 32,
    viewportWidth: 1000,
    viewportHeight: 800,
    padding: 32,
    minimumScale: 0.4,
    absoluteMinimumScale: 0.08,
    maximumScale: 3,
    ...overrides,
  }
}

describe('map camera bounds', () => {
  it('limits a large square map to one padded edge instead of unlimited empty space', () => {
    const c = config()
    const bounds = cameraTranslationBounds(1, c)
    expect(bounds).toEqual({
      minX: 1000 - 32 - 3200,
      maxX: 32,
      minY: 800 - 32 - 3200,
      maxY: 32,
      centeredX: false,
      centeredY: false,
    })
    expect(clampCamera({ x: 50_000, y: -50_000, scale: 1 }, c)).toEqual({
      x: 32,
      y: 800 - 32 - 3200,
      scale: 1,
    })
  })

  it('centers a map that is smaller than the viewport on both axes', () => {
    const c = config({ mapWidth: 10, mapHeight: 8 })
    expect(clampCamera({ x: -900, y: 900, scale: 1 }, c)).toEqual({
      x: (1000 - 320) / 2,
      y: (800 - 256) / 2,
      scale: 1,
    })
  })

  it('centers a just-under-viewport map even when two edge pads would not fit', () => {
    const c = config({ mapWidth: 15, mapHeight: 15, viewportWidth: 500, viewportHeight: 500 })
    const bounds = cameraTranslationBounds(1, c)
    expect(bounds).toEqual({
      minX: 10,
      maxX: 10,
      minY: 10,
      maxY: 10,
      centeredX: true,
      centeredY: true,
    })
    expect(clampCamera({ x: -999, y: 999, scale: 1 }, c)).toEqual({ x: 10, y: 10, scale: 1 })
  })

  it('uses the complete staggered hex extent when fitting and bounding', () => {
    const c = config({ topology: 'hex', mapWidth: 17, mapHeight: 11 })
    const world = mapPixelExtent('hex', c.mapWidth, c.mapHeight, c.tileSize)
    const fitted = fitMapCamera(c)
    expect(fitted.x).toBeCloseTo((c.viewportWidth - world.width * fitted.scale) / 2)
    expect(fitted.y).toBeCloseTo((c.viewportHeight - world.height * fitted.scale) / 2)
    const bounds = cameraTranslationBounds(2, c)
    expect(bounds.minX).toBeCloseTo(c.viewportWidth - c.padding - world.width * 2)
    expect(bounds.centeredY).toBe(true)
    expect(bounds.minY).toBeCloseTo((c.viewportHeight - world.height * 2) / 2)
    expect(bounds.maxY).toBeCloseTo(bounds.minY)
  })

  it('recomputes bounds after portrait/landscape resize', () => {
    const portrait = config({ viewportWidth: 375, viewportHeight: 667 })
    const landscape = config({ viewportWidth: 844, viewportHeight: 390 })
    const atPortraitEdge = clampCamera({ x: -50_000, y: -50_000, scale: 1 }, portrait)
    const resized = clampCamera(atPortraitEdge, landscape)
    const landscapeBounds = cameraTranslationBounds(1, landscape)
    expect(resized.x).toBe(landscapeBounds.minX)
    expect(resized.y).toBeGreaterThanOrEqual(landscapeBounds.minY)
    expect(resized.y).toBeLessThanOrEqual(landscapeBounds.maxY)
  })

  it('keeps scale inside the size-aware minimum and fixed maximum', () => {
    const c = config({ mapWidth: 96, mapHeight: 96, viewportWidth: 375, viewportHeight: 667 })
    const floor = minimumCameraScale(c)
    expect(floor).toBeCloseTo((375 - 64) / (96 * 32))
    expect(clampCamera({ x: 0, y: 0, scale: 0.001 }, c).scale).toBeCloseTo(floor)
    expect(clampCamera({ x: 0, y: 0, scale: 20 }, c).scale).toBe(3)
  })

  it('fits the map inside the requested pad', () => {
    const c = config({ mapWidth: 48, mapHeight: 64, viewportWidth: 390, viewportHeight: 844 })
    const fitted = fitMapCamera(c)
    expect(48 * 32 * fitted.scale).toBeLessThanOrEqual(390 - 64 + 0.001)
    expect(64 * 32 * fitted.scale).toBeLessThanOrEqual(844 - 64 + 0.001)
    expect(fitted.x).toBeGreaterThanOrEqual(32)
    expect(fitted.y).toBeGreaterThanOrEqual(32)
  })

  it('centers valid tiles while clamping edge tiles to the pad', () => {
    const c = config({ mapWidth: 48, mapHeight: 48 })
    const middle = centerCameraOnTile({ x: 0, y: 0, scale: 1 }, { x: 24, y: 24 }, c)
    expect(middle.x).toBe(500 - (24 * 32 + 16))
    expect(middle.y).toBe(400 - (24 * 32 + 16))
    const edge = centerCameraOnTile(middle, { x: -20, y: 99 }, c)
    expect(edge.x).toBe(32)
    expect(edge.y).toBe(800 - 32 - 48 * 32)
  })

  it('preserves the zoom anchor until a map edge requires clamping', () => {
    const c = config()
    const view = clampCamera({ x: -800, y: -600, scale: 1 }, c)
    const point = { x: 500, y: 400 }
    const worldBefore = {
      x: (point.x - view.x) / view.scale,
      y: (point.y - view.y) / view.scale,
    }
    const zoomed = zoomCameraAt(view, point, 1.5, c)
    expect((point.x - zoomed.x) / zoomed.scale).toBeCloseTo(worldBefore.x)
    expect((point.y - zoomed.y) / zoomed.scale).toBeCloseTo(worldBefore.y)
  })
})

describe('programmatic camera transition', () => {
  it('eases from start to finish in the approved 220 ms duration', () => {
    const motion = createCameraTransition({ x: 0, y: 0, scale: 1 }, { x: 200, y: -100, scale: 2 })
    expect(motion.durationMs).toBe(220)
    const half = advanceCameraTransition(motion, 110)
    expect(half.view).toEqual({ x: 100, y: -50, scale: 1.5 })
    expect(half.transition).not.toBeNull()
    const done = advanceCameraTransition(half.transition!, 110)
    expect(done.view).toEqual({ x: 200, y: -100, scale: 2 })
    expect(done.transition).toBeNull()
  })

  it('clamps custom durations to the approved 180–250 ms window', () => {
    const from = { x: 0, y: 0, scale: 1 }
    const to = { x: 1, y: 1, scale: 2 }
    expect(createCameraTransition(from, to, 10).durationMs).toBe(180)
    expect(createCameraTransition(from, to, 900).durationMs).toBe(250)
  })

  it('cancels at the exact current frame instead of continuing toward the target', () => {
    const first = advanceCameraTransition(
      createCameraTransition({ x: 10, y: 20, scale: 1 }, { x: 210, y: -80, scale: 2 }),
      70,
    )
    const interrupted = cancelCameraTransition(first.transition!)
    expect(interrupted).toEqual(first.view)
    expect(interrupted).not.toEqual({ x: 210, y: -80, scale: 2 })
  })

  it('ignores negative ticker deltas', () => {
    const motion = createCameraTransition({ x: 5, y: 6, scale: 1 }, { x: 20, y: 30, scale: 2 })
    const frame = advanceCameraTransition(motion, -50)
    expect(frame.view).toEqual({ x: 5, y: 6, scale: 1 })
    expect(frame.transition?.elapsedMs).toBe(0)
  })
})
