import { tileIndex, type Captain, type CityState, type GameMap } from '@aop/engine'
import { Container, Graphics } from 'pixi.js'
import { useEffect, useRef } from 'react'
import { usePixiApp } from './usePixiApp'

/**
 * Renders the seeded world map (#6) and captains (#8) with a pan/zoom/pinch +
 * viewport-culling interaction layer (#7), plus per-player fog of war (#14).
 * Purely a view over engine state — game logic lives in GameScreen, which
 * interprets tile taps (select / move / attack).
 */

const TILE = 32
const MIN_SCALE = 0.4
const MAX_SCALE = 3

const TILE_COLOR = {
  deep: '#1b4a6b',
  shallows: '#2a6a8f',
  land: '#4a7c3f',
  port: '#c9a227',
} as const

const FOG_COLOR = '#0b1a26'
const OWN_SHIP = '#3be2a1'
const ENEMY_SHIP = '#e23b3b'
const OWN_CITY = '#c9a227'
const ENEMY_CITY = '#9aa0a6'

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
  map: GameMap
  captains: Captain[]
  cities: CityState[]
  viewerId: string
  visibleKeys: Set<string>
  exploredKeys: Set<string>
  selectedCaptainId: string | null
  onTileClick: (x: number, y: number) => void
}

export function MapCanvas(props: MapCanvasProps) {
  const { containerRef, app } = usePixiApp({ background: TILE_COLOR.deep })

  // Latest props + view are read by the render loop via refs, so per-action
  // re-renders never tear down the Pixi scene or reset the camera.
  const propsRef = useRef(props)
  propsRef.current = props
  const viewRef = useRef({ x: 40, y: 40, scale: 1 })

  useEffect(() => {
    if (!app) return
    const pixiApp = app

    const world = new Container()
    const tiles = new Graphics()
    const entities = new Graphics()
    const highlight = new Graphics()
    world.addChild(tiles, entities, highlight)
    pixiApp.stage.addChild(world)

    const view = viewRef.current
    const pointers = new Map<number, Point>()
    let dragStart: { x: number; y: number; viewX: number; viewY: number } | undefined
    let pinchPrevDist: number | undefined
    let moved = false

    const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

    function zoomAt(screenX: number, screenY: number, targetScale: number) {
      const clamped = clampScale(targetScale)
      const worldX = (screenX - view.x) / view.scale
      const worldY = (screenY - view.y) / view.scale
      view.scale = clamped
      view.x = screenX - worldX * clamped
      view.y = screenY - worldY * clamped
    }

    function draw() {
      const { map, captains, cities, viewerId, visibleKeys, exploredKeys, selectedCaptainId } =
        propsRef.current
      world.position.set(view.x, view.y)
      world.scale.set(view.scale)

      const w = pixiApp.renderer.width
      const h = pixiApp.renderer.height
      const minX = Math.max(0, Math.floor(-view.x / view.scale / TILE) - 1)
      const minY = Math.max(0, Math.floor(-view.y / view.scale / TILE) - 1)
      const maxX = Math.min(map.width - 1, Math.ceil((w - view.x) / view.scale / TILE) + 1)
      const maxY = Math.min(map.height - 1, Math.ceil((h - view.y) / view.scale / TILE) + 1)

      tiles.clear()
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const key = `${x},${y}`
          const explored = exploredKeys.has(key)
          const visibleNow = visibleKeys.has(key)
          if (!explored) {
            tiles.rect(x * TILE, y * TILE, TILE, TILE)
            tiles.fill(FOG_COLOR)
            continue
          }
          const tile = map.tiles[tileIndex(map, x, y)]!
          tiles.rect(x * TILE, y * TILE, TILE, TILE)
          tiles.fill({ color: TILE_COLOR[tile.type], alpha: visibleNow ? 1 : 0.5 })
        }
      }

      entities.clear()
      for (const city of cities) {
        const key = `${city.position.x},${city.position.y}`
        const own = city.ownerId === viewerId
        if (!own && !exploredKeys.has(key)) continue
        entities.rect(city.position.x * TILE + 6, city.position.y * TILE + 6, TILE - 12, TILE - 12)
        entities.fill(own ? OWN_CITY : ENEMY_CITY)
      }
      for (const cap of captains) {
        const key = `${cap.position.x},${cap.position.y}`
        const own = cap.ownerId === viewerId
        if (!own && !visibleKeys.has(key)) continue
        const cx = cap.position.x * TILE + TILE / 2
        const cy = cap.position.y * TILE + TILE / 2
        entities.circle(cx, cy, TILE / 2.6)
        entities.fill(own ? OWN_SHIP : ENEMY_SHIP)
      }

      highlight.clear()
      const selected = selectedCaptainId
        ? captains.find((c) => c.id === selectedCaptainId)
        : undefined
      if (selected) {
        highlight.rect(selected.position.x * TILE, selected.position.y * TILE, TILE, TILE)
        highlight.stroke({ width: 3, color: '#ffffff' })
      }
    }

    const canvas = pixiApp.canvas
    canvas.style.touchAction = 'none'

    const toCanvasPoint = (e: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    function selectTileAt(screenX: number, screenY: number) {
      const map = propsRef.current.map
      const tileX = Math.floor((screenX - view.x) / view.scale / TILE)
      const tileY = Math.floor((screenY - view.y) / view.scale / TILE)
      if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) return
      propsRef.current.onTileClick(tileX, tileY)
    }

    function onPointerDown(e: PointerEvent) {
      canvas.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, toCanvasPoint(e))
      moved = false
      if (pointers.size === 1) {
        const p = pointers.values().next().value!
        dragStart = { x: p.x, y: p.y, viewX: view.x, viewY: view.y }
      } else {
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
        if (pinchPrevDist !== undefined) zoomAt(mid.x, mid.y, view.scale * (dist / pinchPrevDist))
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
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, view.scale * Math.exp(-e.deltaY * 0.001))
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    // Redraw every tick (cheap with culling) so camera moves and state changes
    // both show without a separate invalidation path.
    pixiApp.ticker.add(draw)

    return () => {
      pixiApp.ticker.remove(draw)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      pixiApp.stage.removeChild(world)
      world.destroy({ children: true })
    }
  }, [app])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
