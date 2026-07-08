import type { Captain, CityState, GameMap } from '@aop/engine'
import type { Coord } from '@aop/shared'
import { useEffect, useRef, type RefObject } from 'react'
import { cssToken } from './colorTokens'
import { TILE_COLOR } from './MapCanvas'

/**
 * Whole-map overview (#346): a small DOM canvas over the Pixi map showing the
 * full extent, fog-respecting city/fleet markers, and a live rectangle for the
 * main camera's viewport. Click to recenter the camera. Purely a navigation aid
 * — it reads the same props the map does and the shared camera ref, and never
 * touches the engine.
 */

const MINIMAP_W = 150
const FOG = cssToken('--color-fog', '#0b1a26')
const OWN_CITY = cssToken('--color-gold', '#c9a227')
const ENEMY_CITY = cssToken('--map-enemy-city', '#9aa0a6')
const OWN_SHIP = cssToken('--color-success', '#3be2a1')
const ENEMY_SHIP = cssToken('--color-alert-border', '#e23b3b')

interface MinimapProps {
  map: GameMap
  cities: CityState[]
  captains: Captain[]
  viewerId: string
  exploredKeys: Set<string>
  visibleKeys: Set<string>
  /** The live main-camera ref (world offset in CSS px + scale), read every frame. */
  cameraRef: RefObject<{ x: number; y: number; scale: number }>
  /** The Pixi map container, for its CSS viewport size. */
  containerRef: RefObject<HTMLDivElement | null>
  /** World tile size in px (MapCanvas TILE), so the viewport rect maps correctly. */
  tileSize: number
  onJump: (tile: Coord) => void
}

export function Minimap({
  map,
  cities,
  captains,
  viewerId,
  exploredKeys,
  visibleKeys,
  cameraRef,
  containerRef,
  tileSize,
  onJump,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const scale = MINIMAP_W / map.width
  const height = map.height * scale

  // Repaint the base map + markers whenever the world or fog changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = MINIMAP_W
    canvas.height = height
    ctx.clearRect(0, 0, MINIMAP_W, height)
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const explored = exploredKeys.has(`${x},${y}`)
        const tile = map.tiles[y * map.width + x]!
        ctx.fillStyle = explored ? TILE_COLOR[tile.type] : FOG
        // +0.75 overdraw closes the sub-pixel seams that would otherwise grid it.
        ctx.fillRect(x * scale, y * scale, scale + 0.75, scale + 0.75)
      }
    }
    const dot = (pos: Coord, color: string, r: number) => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(pos.x * scale + scale / 2, pos.y * scale + scale / 2, r, 0, Math.PI * 2)
      ctx.fill()
    }
    for (const city of cities) {
      const own = city.ownerId === viewerId
      if (!own && !exploredKeys.has(`${city.position.x},${city.position.y}`)) continue
      dot(city.position, own ? OWN_CITY : ENEMY_CITY, 2.5)
    }
    for (const cap of captains) {
      const own = cap.ownerId === viewerId
      if (!own && !visibleKeys.has(`${cap.position.x},${cap.position.y}`)) continue
      dot(cap.position, own ? OWN_SHIP : ENEMY_SHIP, 2)
    }
  }, [map, cities, captains, viewerId, exploredKeys, visibleKeys, scale, height])

  // Track the main camera every frame and position the viewport rectangle.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const rect = viewportRef.current
      const container = containerRef.current
      const cam = cameraRef.current
      if (rect && container && cam) {
        const left = (-cam.x / cam.scale / tileSize) * scale
        const top = (-cam.y / cam.scale / tileSize) * scale
        const w = (container.clientWidth / cam.scale / tileSize) * scale
        const h = (container.clientHeight / cam.scale / tileSize) * scale
        const cl = Math.max(0, Math.min(MINIMAP_W, left))
        const ct = Math.max(0, Math.min(height, top))
        rect.style.left = `${cl}px`
        rect.style.top = `${ct}px`
        rect.style.width = `${Math.max(4, Math.min(MINIMAP_W - cl, w))}px`
        rect.style.height = `${Math.max(4, Math.min(height - ct, h))}px`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cameraRef, containerRef, tileSize, scale, height])

  function jump(e: React.MouseEvent<HTMLDivElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    const pxPerTile = r.width / map.width
    const tx = Math.floor((e.clientX - r.left) / pxPerTile)
    const ty = Math.floor((e.clientY - r.top) / pxPerTile)
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return
    onJump({ x: tx, y: ty })
  }

  return (
    <div
      className="map-minimap"
      style={{ width: MINIMAP_W, height }}
      onClick={jump}
      role="presentation"
    >
      <canvas ref={canvasRef} style={{ width: MINIMAP_W, height }} />
      <div ref={viewportRef} className="map-minimap__viewport" />
    </div>
  )
}
