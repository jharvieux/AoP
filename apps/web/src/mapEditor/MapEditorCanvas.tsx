import type { Coord } from '@aop/shared'
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { ENCOUNTER_COLOR, TILE_COLOR } from '../MapCanvas'
import { cssToken } from '../colorTokens'
import type { EditorDraft } from './types'

/**
 * The map editor's paint surface (#41). Deliberately a plain 2D `<canvas>`,
 * not the Pixi-based `MapCanvas` gameplay uses: there's no fog of war, no
 * captains/cities, and authored maps top out at 96x96 tiles, so a full
 * redraw per edit is cheap and the WebGL/ticker machinery `MapCanvas` needs
 * for live matches would be pure overhead here. Shares `MapCanvas`'s tile
 * and encounter color palette so the same colors mean the same thing in
 * both the editor and gameplay.
 */

const TILE = 22
const START_COLOR = cssToken('--color-success', '#3be2a1')
const RESOURCE_COLOR = {
  gold: cssToken('--color-gold', '#c9a227'),
  timber: cssToken('--map-resource-timber', '#8a5a2b'),
  iron: cssToken('--map-enemy-city', '#9aa0a6'),
  rum: cssToken('--map-resource-rum', '#b23bd8'),
} as const
const RESOURCE_LABEL = { gold: 'G', timber: 'T', iron: 'I', rum: 'R' } as const
const MARKER_TEXT_COLOR = cssToken('--color-text-on-gold', '#1a1408')

export interface MapEditorCanvasProps {
  draft: EditorDraft
  /** Fired once per distinct tile the pointer touches while down. `isDown`
   * is true only for the initial press, so callers can gate one-shot tools
   * (flood fill) separately from continuous ones (brush/eraser/placement). */
  onTileAt: (coord: Coord, isDown: boolean) => void
  /** Fired on right-click to cycle ownerSeat of a resource marker. (#283) */
  onRightClickTile?: (coord: Coord) => void
}

export function MapEditorCanvas({ draft, onTileAt, onRightClickTile }: MapEditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draggingRef = useRef(false)
  const lastCoordRef = useRef<Coord | null>(null)
  const onTileAtRef = useRef(onTileAt)
  const onRightClickTileRef = useRef(onRightClickTile)
  onTileAtRef.current = onTileAt
  onRightClickTileRef.current = onRightClickTile

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (let y = 0; y < draft.height; y++) {
      for (let x = 0; x < draft.width; x++) {
        const tile = draft.tiles[y * draft.width + x]!
        ctx.fillStyle = TILE_COLOR[tile.type]
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE)
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let x = 0; x <= draft.width; x++) {
      ctx.beginPath()
      ctx.moveTo(x * TILE, 0)
      ctx.lineTo(x * TILE, draft.height * TILE)
      ctx.stroke()
    }
    for (let y = 0; y <= draft.height; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * TILE)
      ctx.lineTo(draft.width * TILE, y * TILE)
      ctx.stroke()
    }

    draft.resourceMarkers.forEach((marker) => {
      const cx = marker.position.x * TILE + TILE / 2
      const cy = marker.position.y * TILE + TILE / 2
      ctx.fillStyle = RESOURCE_COLOR[marker.kind]
      ctx.fillRect(cx - TILE / 3, cy - TILE / 3, (TILE / 3) * 2, (TILE / 3) * 2)
      ctx.fillStyle = MARKER_TEXT_COLOR
      ctx.font = `${TILE / 2.2}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(RESOURCE_LABEL[marker.kind], cx, cy + 1)
      // Display ownerSeat as a small number in the corner (#283)
      if (marker.ownerSeat !== undefined) {
        ctx.font = `${TILE / 3}px sans-serif`
        ctx.fillStyle = RESOURCE_COLOR[marker.kind]
        ctx.fillText(String(marker.ownerSeat + 1), cx + TILE / 4, cy - TILE / 4)
      }
    })

    draft.encounters.forEach((enc) => {
      const cx = enc.position.x * TILE + TILE / 2
      const cy = enc.position.y * TILE + TILE / 2
      const r = TILE / 2.8
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fillStyle = ENCOUNTER_COLOR[enc.kind]
      ctx.fill()
    })

    draft.startPositions.forEach((pos, i) => {
      const cx = pos.x * TILE + TILE / 2
      const cy = pos.y * TILE + TILE / 2
      ctx.beginPath()
      ctx.arc(cx, cy, TILE / 2.6, 0, Math.PI * 2)
      ctx.fillStyle = START_COLOR
      ctx.fill()
      ctx.fillStyle = MARKER_TEXT_COLOR
      ctx.font = `bold ${TILE / 2.2}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), cx, cy + 1)
    })
  }, [draft])

  function coordFromEvent(e: { clientX: number; clientY: number }): Coord | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * draft.width)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * draft.height)
    if (x < 0 || y < 0 || x >= draft.width || y >= draft.height) return null
    return { x, y }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    canvasRef.current?.setPointerCapture(e.pointerId)
    draggingRef.current = true
    const coord = coordFromEvent(e)
    if (!coord) return
    lastCoordRef.current = coord
    onTileAtRef.current(coord, true)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!draggingRef.current) return
    const coord = coordFromEvent(e)
    if (!coord) return
    const last = lastCoordRef.current
    if (last && last.x === coord.x && last.y === coord.y) return
    lastCoordRef.current = coord
    onTileAtRef.current(coord, false)
  }

  function handlePointerUp() {
    draggingRef.current = false
    lastCoordRef.current = null
  }

  function handleContextMenu(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault()
    const coord = coordFromEvent(e)
    if (!coord) return
    onRightClickTileRef.current?.(coord)
  }

  return (
    <canvas
      ref={canvasRef}
      width={draft.width * TILE}
      height={draft.height * TILE}
      className="map-editor-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={handleContextMenu}
    />
  )
}
