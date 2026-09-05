import type { GridTopology } from '@aop/engine'
import type { Coord } from '@aop/shared'
import { cellCenter, mapPixelExtent } from './mapLayout'

export const MAP_CAMERA_CHANGE_EVENT = 'aop:map-camera-change'
export const MAP_CAMERA_PADDING_PX = 32
export const MAP_CAMERA_TRANSITION_MS = 220

const MIN_TRANSITION_MS = 180
const MAX_TRANSITION_MS = 250

export interface CameraView {
  x: number
  y: number
  scale: number
}

export interface CameraConfig {
  topology: GridTopology
  mapWidth: number
  mapHeight: number
  tileSize: number
  viewportWidth: number
  viewportHeight: number
  padding: number
  minimumScale: number
  absoluteMinimumScale: number
  maximumScale: number
}

export interface CameraTranslationBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  centeredX: boolean
  centeredY: boolean
}

export interface CameraTransition {
  from: CameraView
  to: CameraView
  elapsedMs: number
  durationMs: number
}

function safePadding(viewport: number, requested: number): number {
  return Math.max(0, Math.min(requested, viewport / 2))
}

function axisBounds(viewport: number, content: number, padding: number) {
  const inset = safePadding(viewport, padding)
  if (content <= viewport) {
    const centered = (viewport - content) / 2
    return { min: centered, max: centered, centered: true }
  }
  return {
    min: viewport - inset - content,
    max: inset,
    centered: false,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function extent(config: CameraConfig) {
  return mapPixelExtent(config.topology, config.mapWidth, config.mapHeight, config.tileSize)
}

/**
 * The size-aware scale floor. Large boards may zoom out far enough to fit inside
 * the padded viewport; smaller boards retain the normal gameplay minimum.
 */
export function minimumCameraScale(config: CameraConfig): number {
  const world = extent(config)
  if (world.width <= 0 || world.height <= 0) return config.minimumScale
  const usableWidth = Math.max(
    1,
    config.viewportWidth - safePadding(config.viewportWidth, config.padding) * 2,
  )
  const usableHeight = Math.max(
    1,
    config.viewportHeight - safePadding(config.viewportHeight, config.padding) * 2,
  )
  const fit = Math.min(usableWidth / world.width, usableHeight / world.height)
  return Math.max(config.absoluteMinimumScale, Math.min(config.minimumScale, fit))
}

export function clampCameraScale(scale: number, config: CameraConfig): number {
  return clamp(scale, minimumCameraScale(config), config.maximumScale)
}

/** Translation limits for the map at a particular scale, including the edge pad. */
export function cameraTranslationBounds(
  scale: number,
  config: CameraConfig,
): CameraTranslationBounds {
  const world = extent(config)
  const x = axisBounds(config.viewportWidth, world.width * scale, config.padding)
  const y = axisBounds(config.viewportHeight, world.height * scale, config.padding)
  return {
    minX: x.min,
    maxX: x.max,
    minY: y.min,
    maxY: y.max,
    centeredX: x.centered,
    centeredY: y.centered,
  }
}

/** Clamp both zoom and translation; undersized maps stay centered on each axis. */
export function clampCamera(view: CameraView, config: CameraConfig): CameraView {
  const scale = clampCameraScale(view.scale, config)
  const bounds = cameraTranslationBounds(scale, config)
  return {
    x: clamp(view.x, bounds.minX, bounds.maxX),
    y: clamp(view.y, bounds.minY, bounds.maxY),
    scale,
  }
}

/** Zoom about a screen-space point, then apply the padded map bounds. */
export function zoomCameraAt(
  view: CameraView,
  screenPoint: Coord,
  targetScale: number,
  config: CameraConfig,
): CameraView {
  const current = clampCamera(view, config)
  const scale = clampCameraScale(targetScale, config)
  const worldX = (screenPoint.x - current.x) / current.scale
  const worldY = (screenPoint.y - current.y) / current.scale
  return clampCamera(
    {
      x: screenPoint.x - worldX * scale,
      y: screenPoint.y - worldY * scale,
      scale,
    },
    config,
  )
}

/** Center a tile using the current zoom, clamping edge tiles into the padded bounds. */
export function centerCameraOnTile(
  view: CameraView,
  tile: Coord,
  config: CameraConfig,
): CameraView {
  if (config.mapWidth <= 0 || config.mapHeight <= 0) return clampCamera(view, config)
  const x = clamp(Math.round(tile.x), 0, config.mapWidth - 1)
  const y = clamp(Math.round(tile.y), 0, config.mapHeight - 1)
  const center = cellCenter(config.topology, x, y, config.tileSize)
  return clampCamera(
    {
      x: config.viewportWidth / 2 - center.x * view.scale,
      y: config.viewportHeight / 2 - center.y * view.scale,
      scale: view.scale,
    },
    config,
  )
}

/** Fit the complete square/hex extent inside the padded viewport and center it. */
export function fitMapCamera(config: CameraConfig): CameraView {
  const world = extent(config)
  const insetX = safePadding(config.viewportWidth, config.padding)
  const insetY = safePadding(config.viewportHeight, config.padding)
  const rawScale =
    world.width > 0 && world.height > 0
      ? Math.min(
          Math.max(1, config.viewportWidth - insetX * 2) / world.width,
          Math.max(1, config.viewportHeight - insetY * 2) / world.height,
        )
      : config.minimumScale
  const scale = clampCameraScale(rawScale, config)
  return clampCamera(
    {
      x: (config.viewportWidth - world.width * scale) / 2,
      y: (config.viewportHeight - world.height * scale) / 2,
      scale,
    },
    config,
  )
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function viewAt(transition: CameraTransition, elapsedMs: number): CameraView {
  const progress = transition.durationMs <= 0 ? 1 : clamp(elapsedMs / transition.durationMs, 0, 1)
  const eased = easeInOutCubic(progress)
  return {
    x: transition.from.x + (transition.to.x - transition.from.x) * eased,
    y: transition.from.y + (transition.to.y - transition.from.y) * eased,
    scale: transition.from.scale + (transition.to.scale - transition.from.scale) * eased,
  }
}

/** Create a bounded-duration programmatic motion (the default is 220 ms). */
export function createCameraTransition(
  from: CameraView,
  to: CameraView,
  durationMs = MAP_CAMERA_TRANSITION_MS,
): CameraTransition {
  return {
    from: { ...from },
    to: { ...to },
    elapsedMs: 0,
    durationMs: clamp(durationMs, MIN_TRANSITION_MS, MAX_TRANSITION_MS),
  }
}

/** Advance without mutating the transition, returning null motion at completion. */
export function advanceCameraTransition(
  transition: CameraTransition,
  deltaMs: number,
): { view: CameraView; transition: CameraTransition | null } {
  const elapsedMs = Math.min(transition.durationMs, transition.elapsedMs + Math.max(0, deltaMs))
  return {
    view: viewAt(transition, elapsedMs),
    transition: elapsedMs >= transition.durationMs ? null : { ...transition, elapsedMs },
  }
}

/** Freeze a programmatic move at its exact current frame for direct-input cancellation. */
export function cancelCameraTransition(transition: CameraTransition): CameraView {
  return viewAt(transition, transition.elapsedMs)
}
