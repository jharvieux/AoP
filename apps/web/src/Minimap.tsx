import {
  mapTopology,
  type Captain,
  type CityState,
  type GameMap,
  type LandingParty,
} from '@aop/engine'
import type { Coord } from '@aop/shared'
import { useEffect, useRef, type RefObject } from 'react'
import { cssToken } from './colorTokens'
import { shouldDrawCaptainDot } from './fleetVisibility'
import { cellCenter, cellPolygon, mapPixelExtent, pixelToCell } from './mapLayout'
import { TILE_COLOR } from './MapCanvas'

/**
 * Whole-map overview (#346): a small DOM canvas over the Pixi map showing the
 * full extent, fog-respecting city/fleet markers, and a live rectangle for the
 * main camera's viewport. Click to recenter the camera. Purely a navigation aid
 * — it reads the same props the map does and the shared camera ref, and never
 * touches the engine.
 *
 * Topology-aware (#348): square maps render as a grid of cells exactly as before
 * (positions computed in unit tile space via mapLayout, which reproduces the
 * prior `x*scale` arithmetic); hex maps render scaled pointy-top hexagons over
 * the same layout the main canvas uses. The viewport-rectangle math is
 * topology-independent — it maps main-camera world pixels through `worldPx /
 * tileSize` into the same unit space the minimap scales — so it needed no change
 * beyond taking the layout-derived scale/height.
 *
 * Landing parties (#476) get their own small square marker, fog-gated exactly
 * like a captain dot (own always, enemy only currently visible) — before this
 * they simply didn't appear on the minimap at all.
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
  /** Landing parties ashore (#465). Optional, like `MapCanvasProps.parties`,
   * so any consumer predating parties needs no change. */
  parties?: LandingParty[] | undefined
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
  parties = [],
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
  const topology = mapTopology(map)
  // Everything is laid out in "unit" tile space (tileSize = 1) and then scaled
  // into MINIMAP_W. For a square map this yields `scale = MINIMAP_W / map.width`
  // and `height = map.height * scale`, exactly as before.
  const extent = mapPixelExtent(topology, map.width, map.height, 1)
  const scale = MINIMAP_W / extent.width
  const height = extent.height * scale

  // Repaint the base map + markers whenever the world or fog changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = MINIMAP_W
    canvas.height = height
    // Painted world (#394): uncharted dark everywhere, explored cells painted
    // over it through a slight blur so the tiny map reads as regions, not a
    // grid of pixels. Markers below are drawn after the filter resets, sharp.
    ctx.fillStyle = FOG
    ctx.fillRect(0, 0, MINIMAP_W, height)
    ctx.filter = 'blur(0.6px)'
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!exploredKeys.has(`${x},${y}`)) continue
        const tile = map.tiles[y * map.width + x]!
        ctx.fillStyle = TILE_COLOR[tile.type]
        if (topology === 'hex') {
          const poly = cellPolygon('hex', x, y, 1)
          ctx.beginPath()
          ctx.moveTo(poly[0]! * scale, poly[1]! * scale)
          for (let i = 2; i < poly.length; i += 2) {
            ctx.lineTo(poly[i]! * scale, poly[i + 1]! * scale)
          }
          ctx.closePath()
          ctx.fill()
        } else {
          // +0.75 overdraw closes the sub-pixel seams that would otherwise grid it.
          ctx.fillRect(x * scale, y * scale, scale + 0.75, scale + 0.75)
        }
      }
    }
    ctx.filter = 'none'
    const dot = (pos: Coord, color: string, r: number) => {
      const c = cellCenter(topology, pos.x, pos.y, 1)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(c.x * scale, c.y * scale, r, 0, Math.PI * 2)
      ctx.fill()
    }
    // A small square, not a dot — legible at this scale as "not a ship"
    // without needing a second color per faction.
    const square = (pos: Coord, color: string, r: number) => {
      const c = cellCenter(topology, pos.x, pos.y, 1)
      ctx.fillStyle = color
      ctx.fillRect(c.x * scale - r, c.y * scale - r, r * 2, r * 2)
    }
    for (const city of cities) {
      const own = city.ownerId === viewerId
      if (!own && !exploredKeys.has(`${city.position.x},${city.position.y}`)) continue
      dot(city.position, own ? OWN_CITY : ENEMY_CITY, 2.5)
    }
    for (const cap of captains) {
      // A pooled (rescued, ship-lost, unled) captain's position is the stale
      // beach it was rescued from (#523) — the engine already treats it as
      // inert (no vision, no targeting), so the minimap shouldn't draw it as
      // a live ship either.
      if (!shouldDrawCaptainDot(cap, parties)) continue
      const own = cap.ownerId === viewerId
      if (!own && !visibleKeys.has(`${cap.position.x},${cap.position.y}`)) continue
      dot(cap.position, own ? OWN_SHIP : ENEMY_SHIP, 2)
    }
    for (const party of parties) {
      const own = party.ownerId === viewerId
      if (!own && !visibleKeys.has(`${party.position.x},${party.position.y}`)) continue
      square(party.position, own ? OWN_SHIP : ENEMY_SHIP, 1.8)
    }
  }, [map, topology, cities, captains, parties, viewerId, exploredKeys, visibleKeys, scale, height])

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
    // CSS-displayed size may differ from the canvas's internal MINIMAP_W×height,
    // so rescale the click into canvas-internal px, then invert the layout.
    const sx = ((e.clientX - r.left) * (MINIMAP_W / r.width)) / scale
    const sy = ((e.clientY - r.top) * (height / r.height)) / scale
    const cell = pixelToCell(topology, sx, sy, 1)
    if (cell.x < 0 || cell.y < 0 || cell.x >= map.width || cell.y >= map.height) return
    onJump({ x: cell.x, y: cell.y })
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
