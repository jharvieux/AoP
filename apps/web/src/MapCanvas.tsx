import { nextFloat, seedRng } from '@aop/engine'
import { Container, Graphics } from 'pixi.js'
import { useEffect, useRef } from 'react'
import { usePixiApp } from './usePixiApp'

/**
 * Placeholder world map: a seeded scatter of island tiles on open sea,
 * rendered with Pixi (#7). Supports mouse-wheel + pinch zoom, mouse-drag +
 * touch pan, tap/click tile selection, and viewport culling so panning
 * around a large map stays cheap. Real map generation (#6) replaces
 * `tileKindAt` with actual mapgen data; captain map positions (#8) add
 * entities on top of this same interaction layer.
 */

const TILE = 48
const MIN_SCALE = 0.4
const MAX_SCALE = 3

type TileKind = 'sea' | 'shallows' | 'island' | 'gold'

/** Deterministic per-tile roll — independent of draw order, so any (x, y) can be queried without walking the grid (required for culling). */
function tileRoll(seed: number, x: number, y: number): number {
  const combined = (seed * 374761393 + x * 668265263 + y * 2147483647) >>> 0
  const [, roll] = nextFloat(seedRng(combined))
  return roll
}

function tileKindAt(seed: number, x: number, y: number): TileKind {
  const roll = tileRoll(seed, x, y)
  if (roll > 0.95) return 'gold'
  if (roll > 0.85) return 'island'
  if (roll > 0.8) return 'shallows'
  return 'sea'
}

const TILE_FILL: Partial<Record<TileKind, string>> = {
  shallows: '#2a6a8f',
  island: '#4a7c3f',
  gold: '#c9a227',
}

interface Point {
  x: number
  y: number
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export interface MapCanvasProps {
  seed: number
  cols?: number
  rows?: number
  onTileSelect?: (x: number, y: number) => void
}

export function MapCanvas({ seed, cols = 200, rows = 200, onTileSelect }: MapCanvasProps) {
  const { containerRef, app } = usePixiApp({ background: '#1b4a6b' })
  const onTileSelectRef = useRef(onTileSelect)
  onTileSelectRef.current = onTileSelect

  useEffect(() => {
    if (!app) return
    const pixiApp = app

    const world = new Container()
    const tiles = new Graphics()
    const highlight = new Graphics()
    world.addChild(tiles)
    world.addChild(highlight)
    pixiApp.stage.addChild(world)

    const view = { x: 0, y: 0, scale: 1 }
    let selectedTile: { x: number; y: number } | undefined
    const pointers = new Map<number, Point>()
    let dragStart: { x: number; y: number; viewX: number; viewY: number } | undefined
    let pinchPrevDist: number | undefined
    let moved = false

    function clampScale(scale: number): number {
      return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
    }

    /** Zooms while keeping the world point under (screenX, screenY) stationary. */
    function zoomAt(screenX: number, screenY: number, targetScale: number) {
      const clamped = clampScale(targetScale)
      const worldX = (screenX - view.x) / view.scale
      const worldY = (screenY - view.y) / view.scale
      view.scale = clamped
      view.x = screenX - worldX * clamped
      view.y = screenY - worldY * clamped
    }

    function applyTransform() {
      world.position.set(view.x, view.y)
      world.scale.set(view.scale)
    }

    /** Redraws only the tiles inside the current viewport — the whole point of culling. */
    function redrawTiles() {
      const w = pixiApp.renderer.width
      const h = pixiApp.renderer.height
      const worldLeft = -view.x / view.scale
      const worldTop = -view.y / view.scale
      const worldRight = (w - view.x) / view.scale
      const worldBottom = (h - view.y) / view.scale
      const minX = Math.max(0, Math.floor(worldLeft / TILE) - 1)
      const minY = Math.max(0, Math.floor(worldTop / TILE) - 1)
      const maxX = Math.min(cols - 1, Math.ceil(worldRight / TILE) + 1)
      const maxY = Math.min(rows - 1, Math.ceil(worldBottom / TILE) + 1)

      tiles.clear()
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const kind = tileKindAt(seed, x, y)
          const fill = TILE_FILL[kind]
          if (!fill) continue
          if (kind === 'shallows') {
            tiles.rect(x * TILE, y * TILE, TILE, TILE)
          } else {
            tiles.rect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8)
          }
          tiles.fill(fill)
        }
      }
    }

    function redrawHighlight() {
      highlight.clear()
      if (!selectedTile) return
      highlight.rect(selectedTile.x * TILE, selectedTile.y * TILE, TILE, TILE)
      highlight.stroke({ width: 3, color: '#ffffff' })
    }

    function selectTileAt(screenX: number, screenY: number) {
      const worldX = (screenX - view.x) / view.scale
      const worldY = (screenY - view.y) / view.scale
      const tileX = Math.floor(worldX / TILE)
      const tileY = Math.floor(worldY / TILE)
      if (tileX < 0 || tileX >= cols || tileY < 0 || tileY >= rows) return
      selectedTile = { x: tileX, y: tileY }
      redrawHighlight()
      onTileSelectRef.current?.(tileX, tileY)
    }

    const canvas = pixiApp.canvas
    canvas.style.touchAction = 'none'

    function toCanvasPoint(e: PointerEvent): Point {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    function onPointerDown(e: PointerEvent) {
      canvas.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, toCanvasPoint(e))
      moved = false
      if (pointers.size === 1) {
        const p = pointers.values().next().value!
        dragStart = { x: p.x, y: p.y, viewX: view.x, viewY: view.y }
      } else if (pointers.size === 2) {
        dragStart = undefined
        pinchPrevDist = undefined
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, toCanvasPoint(e))

      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const dist = distance(a!, b!)
        const mid = midpoint(a!, b!)
        if (pinchPrevDist !== undefined) {
          zoomAt(mid.x, mid.y, view.scale * (dist / pinchPrevDist))
          applyTransform()
        }
        pinchPrevDist = dist
        moved = true
        return
      }

      if (dragStart) {
        const p = pointers.values().next().value!
        const dx = p.x - dragStart.x
        const dy = p.y - dragStart.y
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true
        view.x = dragStart.viewX + dx
        view.y = dragStart.viewY + dy
        applyTransform()
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      const wasTap = pointers.size === 1 && !moved
      const point = pointers.get(e.pointerId)
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchPrevDist = undefined
      if (pointers.size === 0) dragStart = undefined
      if (wasTap && point) selectTileAt(point.x, point.y)
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.001)
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, view.scale * factor)
      applyTransform()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    // Tiles are re-culled every tick rather than only on gesture events —
    // cheap for a placeholder scatter, and keeps redraws correct across
    // canvas resizes without a separate ResizeObserver.
    pixiApp.ticker.add(redrawTiles)
    applyTransform()

    return () => {
      pixiApp.ticker.remove(redrawTiles)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      pixiApp.stage.removeChild(world)
      world.destroy({ children: true })
    }
  }, [app, seed, cols, rows])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
