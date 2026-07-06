import {
  tileIndex,
  type Captain,
  type CityState,
  type EncounterKind,
  type EncounterState,
  type GameMap,
} from '@aop/engine'
import { FACTIONS } from '@aop/content'
import type { Coord, FactionId } from '@aop/shared'
import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { describeMapTile, moveCursor, panToKeepTileVisible } from './mapCursor'
import { cityContentId, encounterContentId, resolveSpriteUrl, tileContentId } from './mapSprites'
import { useTheme } from './theme/ThemeContext'
import { createTextureLoader, type TextureLoader } from './textureLoader'
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

// Exported so the map editor canvas (#41) renders tiles/encounters with the
// same palette as gameplay — one visual vocabulary for "what a tile means".
export const TILE_COLOR = {
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
export const ENCOUNTER_COLOR = {
  merchant: '#e0b64f',
  natives: '#6fbf73',
  settlers: '#c98bdb',
} as const

// Generated art (#26). All four tile types now have usable art (#108's retry pass shipped
// `deep`/`port` after two prior attempts drifted into repeating decorative motifs and a
// baked-in watermark — see #108 for the full history). The switch that finally worked for
// `deep`: the DreamShaper checkpoint instead of sd-v1.5, plus dropping "isolated
// object/product shot" framing that had been pushing that checkpoint toward an app-icon
// composition. `TILE_COLOR` below is kept as the fallback for any tile type whose art
// fails to load.
const TILE_SPRITE_URL: Partial<Record<keyof typeof TILE_COLOR, string>> = {
  shallows: '/art/tiles/shallows.png',
  land: '/art/tiles/land.png',
  port: '/art/tiles/port.png',
  deep: '/art/tiles/deep.png',
}
const CITY_SPRITE_URL = {
  own: '/art/cities/own.png',
  enemy: '/art/cities/enemy.png',
} as const
const ENCOUNTER_SPRITE_URL: Record<EncounterKind, string> = {
  merchant: '/art/encounters/merchant.png',
  natives: '/art/encounters/natives.png',
  settlers: '/art/encounters/settlers.png',
}

// Ship sprites scale a little by class (#26/#89) so a galleon visibly reads bigger than a
// sloop on the map, not just a different paint job. Keyed by SHIP_CLASSES id in @aop/content;
// an unrecognized/missing class falls back to the sloop-era default size.
const SHIP_CLASS_SCALE: Partial<Record<string, number>> = {
  sloop: 0.65,
  brigantine: 0.75,
  frigate: 0.85,
  galleon: 0.95,
}

/** Get-or-create a pooled Sprite by a stable key, and drop any pool entries not
 * touched this frame — reused across redraws instead of destroyed/recreated on
 * every dirty tick (panning re-dirties every frame, so this matters for #27's
 * perf budget). */
class SpritePool {
  private readonly sprites = new Map<string, Sprite>()
  private readonly usedThisFrame = new Set<string>()

  constructor(private readonly parent: Container) {}

  begin() {
    this.usedThisFrame.clear()
  }

  get(key: string): Sprite {
    this.usedThisFrame.add(key)
    let sprite = this.sprites.get(key)
    if (!sprite) {
      sprite = new Sprite()
      sprite.anchor.set(0.5)
      this.sprites.set(key, sprite)
      this.parent.addChild(sprite)
    }
    return sprite
  }

  end() {
    for (const [key, sprite] of this.sprites) {
      if (this.usedThisFrame.has(key)) continue
      this.parent.removeChild(sprite)
      sprite.destroy()
      this.sprites.delete(key)
    }
  }
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
  map: GameMap
  captains: Captain[]
  cities: CityState[]
  encounters: EncounterState[]
  viewerId: string
  visibleKeys: Set<string>
  exploredKeys: Set<string>
  selectedCaptainId: string | null
  onTileClick: (x: number, y: number) => void
  /** Owning player id -> faction id, so ships can pick a faction-specific sprite (#115). */
  factionOf: (ownerId: string) => FactionId
}

export function MapCanvas(props: MapCanvasProps) {
  const { containerRef, app } = usePixiApp({ background: TILE_COLOR.deep })
  const { spriteUrl: themeSpriteUrl, pack: themePack, factionName } = useTheme()

  // Latest props + view are read by the render loop via refs, so per-action
  // re-renders never tear down the Pixi scene or reset the camera.
  const propsRef = useRef(props)
  propsRef.current = props
  // Theme pack overrides (#73) can change mid-session (applying a different
  // pack), so this is read the same way as propsRef — via a ref the ticker
  // checks each tick, not captured once when the Pixi scene is built below.
  const themeSpriteUrlRef = useRef(themeSpriteUrl)
  themeSpriteUrlRef.current = themeSpriteUrl
  const viewRef = useRef({ x: 40, y: 40, scale: 1 })
  // Flipped on every render (a new action, fog reveal, selection change, …)
  // so the ticker below knows to redraw; the pan/zoom handlers flip it too.
  const dirtyRef = useRef(true)
  dirtyRef.current = true
  // Shared with the pack-switch effect below so it can release the previous
  // pack's decoded textures without tearing down the whole Pixi scene (#245).
  const textureLoaderRef = useRef<TextureLoader<Texture> | null>(null)

  // Keyboard-only path onto the map (#247): the arrow-key tile cursor and its
  // offscreen announcement live in React state (driven by a plain onKeyDown
  // on the wrapper div, not the pointer-event listeners in the effect below),
  // and are mirrored into a ref so the imperative draw loop can read the
  // latest position without depending on it and re-running the whole effect.
  const [cursor, setCursor] = useState<Coord>({ x: 0, y: 0 })
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const [announcement, setAnnouncement] = useState('')
  // Only draw the cursor highlight while the map actually has keyboard focus
  // (see draw()'s use of this below), so mouse/touch play isn't cluttered.
  const hasFocusRef = useRef(false)

  function announceTile(tile: Coord) {
    const { map, captains, cities, encounters, viewerId } = props
    setAnnouncement(
      describeMapTile({
        tile,
        terrain: map.tiles[tileIndex(map, tile.x, tile.y)]!.type,
        captains,
        cities,
        encounters,
        viewerId,
        factionNameOf: (ownerId) => {
          const id = props.factionOf(ownerId)
          return factionName(id, FACTIONS[id].name)
        },
      }),
    )
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const { map } = props
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      props.onTileClick(cursor.x, cursor.y)
      announceTile(cursor)
      return
    }
    const next = moveCursor(cursor, e.key, map.width, map.height)
    if (!next) return
    e.preventDefault()
    setCursor(next)
    dirtyRef.current = true
    const view = viewRef.current
    const container = containerRef.current
    if (container) {
      Object.assign(
        view,
        panToKeepTileVisible(view, next, TILE, container.clientWidth, container.clientHeight),
      )
    }
    announceTile(next)
  }

  // Theme-pack sprite overrides are data: URLs loaded into the same
  // process-global Assets cache as static art; nothing unloads them on its
  // own. Release the previous pack's textures whenever the active pack
  // changes, and on unmount — React runs this cleanup before re-running the
  // effect body, so "previous pack's textures" is exactly what's stale here.
  useEffect(() => {
    return () => textureLoaderRef.current?.unloadThemeTextures()
  }, [themePack?.id])

  useEffect(() => {
    if (!app) return
    const pixiApp = app

    const world = new Container()
    const tiles = new Graphics()
    const tileSprites = new Container()
    const entities = new Graphics()
    const citySprites = new Container()
    const encounterSprites = new Container()
    const shipSprites = new Container()
    const highlight = new Graphics()
    // Draw order: flat-color fallback first, then sprite layers on top, so a
    // texture that finishes loading later simply covers its own fallback tile.
    world.addChild(
      tiles,
      tileSprites,
      entities,
      citySprites,
      encounterSprites,
      shipSprites,
      highlight,
    )
    pixiApp.stage.addChild(world)

    const textureLoader = createTextureLoader<Texture>(Assets, () => {
      dirtyRef.current = true
    })
    textureLoaderRef.current = textureLoader
    const getTexture = textureLoader.getTexture
    const tilePool = new SpritePool(tileSprites)
    const cityPool = new SpritePool(citySprites)
    const encounterPool = new SpritePool(encounterSprites)
    const shipPool = new SpritePool(shipSprites)

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
      dirtyRef.current = true
    }

    function draw() {
      const {
        map,
        captains,
        cities,
        encounters,
        viewerId,
        visibleKeys,
        exploredKeys,
        selectedCaptainId,
        factionOf,
      } = propsRef.current
      world.position.set(view.x, view.y)
      world.scale.set(view.scale)

      const w = pixiApp.renderer.width
      const h = pixiApp.renderer.height
      const minX = Math.max(0, Math.floor(-view.x / view.scale / TILE) - 1)
      const minY = Math.max(0, Math.floor(-view.y / view.scale / TILE) - 1)
      const maxX = Math.min(map.width - 1, Math.ceil((w - view.x) / view.scale / TILE) + 1)
      const maxY = Math.min(map.height - 1, Math.ceil((h - view.y) / view.scale / TILE) + 1)

      tiles.clear()
      tilePool.begin()
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
          const spriteUrl = resolveSpriteUrl(
            themeSpriteUrlRef.current,
            tileContentId(tile.type),
            TILE_SPRITE_URL[tile.type],
          )
          const texture = spriteUrl ? getTexture(spriteUrl) : undefined
          if (texture) {
            const sprite = tilePool.get(key)
            sprite.texture = texture
            sprite.width = TILE
            sprite.height = TILE
            sprite.position.set(x * TILE + TILE / 2, y * TILE + TILE / 2)
            sprite.alpha = visibleNow ? 1 : 0.5
            continue
          }
          tiles.rect(x * TILE, y * TILE, TILE, TILE)
          tiles.fill({ color: TILE_COLOR[tile.type], alpha: visibleNow ? 1 : 0.5 })
        }
      }
      tilePool.end()

      entities.clear()
      encounterPool.begin()
      // Encounters (#23): art sprite when available, a flat diamond otherwise —
      // only where currently in view, so fog hides them.
      for (const enc of encounters) {
        if (!enc.active) continue
        const key = `${enc.position.x},${enc.position.y}`
        if (!visibleKeys.has(key)) continue
        const cx = enc.position.x * TILE + TILE / 2
        const cy = enc.position.y * TILE + TILE / 2
        const spriteUrl = resolveSpriteUrl(
          themeSpriteUrlRef.current,
          encounterContentId(enc.kind),
          ENCOUNTER_SPRITE_URL[enc.kind],
        )
        const texture = spriteUrl ? getTexture(spriteUrl) : undefined
        if (texture) {
          const sprite = encounterPool.get(enc.id)
          sprite.texture = texture
          sprite.width = TILE * 0.75
          sprite.height = TILE * 0.75
          sprite.position.set(cx, cy)
          continue
        }
        const r = TILE / 3
        entities.poly([cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy])
        entities.fill(ENCOUNTER_COLOR[enc.kind])
      }
      encounterPool.end()

      cityPool.begin()
      for (const city of cities) {
        const key = `${city.position.x},${city.position.y}`
        const own = city.ownerId === viewerId
        if (!own && !exploredKeys.has(key)) continue
        const cx = city.position.x * TILE + TILE / 2
        const cy = city.position.y * TILE + TILE / 2
        const spriteUrl = resolveSpriteUrl(
          themeSpriteUrlRef.current,
          cityContentId(own),
          own ? CITY_SPRITE_URL.own : CITY_SPRITE_URL.enemy,
        )
        const texture = spriteUrl ? getTexture(spriteUrl) : undefined
        if (texture) {
          const sprite = cityPool.get(city.id)
          sprite.texture = texture
          sprite.width = TILE - 8
          sprite.height = TILE - 8
          sprite.position.set(cx, cy)
          continue
        }
        entities.rect(city.position.x * TILE + 6, city.position.y * TILE + 6, TILE - 12, TILE - 12)
        entities.fill(own ? OWN_CITY : ENEMY_CITY)
      }
      cityPool.end()

      shipPool.begin()
      for (const cap of captains) {
        const key = `${cap.position.x},${cap.position.y}`
        const own = cap.ownerId === viewerId
        if (!own && !visibleKeys.has(key)) continue
        const cx = cap.position.x * TILE + TILE / 2
        const cy = cap.position.y * TILE + TILE / 2
        const faction = FACTIONS[factionOf(cap.ownerId)]
        const defaultShipSpriteUrl =
          faction?.shipSpriteUrlsByClass?.[cap.shipClassId] ?? faction?.shipSpriteUrl
        // Ship overrides are keyed by ship class id, same content id the Theme
        // Packs editor already uses for ship name/sprite overrides — not
        // faction-specific, since ThemePack has no per-faction ship art slot.
        const shipSpriteUrl = resolveSpriteUrl(
          themeSpriteUrlRef.current,
          cap.shipClassId,
          defaultShipSpriteUrl,
        )
        const texture = shipSpriteUrl ? getTexture(shipSpriteUrl) : undefined
        if (texture) {
          const sprite = shipPool.get(cap.id)
          const size = TILE * (SHIP_CLASS_SCALE[cap.shipClassId] ?? 0.75)
          sprite.texture = texture
          sprite.width = size
          sprite.height = size
          sprite.position.set(cx, cy)
          continue
        }
        entities.circle(cx, cy, TILE / 2.6)
        entities.fill(own ? OWN_SHIP : ENEMY_SHIP)
      }
      shipPool.end()

      highlight.clear()
      const selected = selectedCaptainId
        ? captains.find((c) => c.id === selectedCaptainId)
        : undefined
      if (selected) {
        highlight.rect(selected.position.x * TILE, selected.position.y * TILE, TILE, TILE)
        highlight.stroke({ width: 3, color: '#ffffff' })
      }
      // Keyboard tile cursor (#247) — only drawn while the map has keyboard
      // focus, so pointer-only play isn't cluttered with a cursor no one asked for.
      if (hasFocusRef.current) {
        const c = cursorRef.current
        highlight.rect(c.x * TILE, c.y * TILE, TILE, TILE)
        highlight.stroke({ width: 2, color: '#ffe66d' })
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
        dirtyRef.current = true
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

    // Orientation change / on-screen keyboard dismissal resizes the canvas
    // (resizeTo: container in usePixiApp) without moving the camera or
    // touching props, so the dirty flag needs its own nudge here too.
    function onResize() {
      dirtyRef.current = true
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    pixiApp.renderer.on('resize', onResize)

    // Only rebuild the tile/entity Graphics when something actually changed
    // (camera moved or game state updated) instead of every ticker frame
    // (#27) — on mid-range phones a redraw is real work (fill + culling loop
    // over every visible tile), and most frames while idle have nothing new
    // to show.
    function tick() {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      draw()
    }
    pixiApp.ticker.add(tick)

    return () => {
      pixiApp.ticker.remove(tick)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      pixiApp.renderer.off('resize', onResize)
      pixiApp.stage.removeChild(world)
      world.destroy({ children: true })
    }
  }, [app])

  // containerRef's div is Pixi's exclusive mount point (it appends the
  // <canvas> into it outside React's tracking — see usePixiApp) — the a11y
  // wiring and live region below live on/in a wrapper div instead, so
  // React's reconciliation of its own children never has to contend with
  // the canvas Pixi appended.
  return (
    <div
      className="map-canvas-root"
      style={{ width: '100%', height: '100%', position: 'relative' }}
      role="application"
      aria-label="World map. Use arrow keys to move the tile cursor and Enter to act on it."
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => {
        hasFocusRef.current = true
        dirtyRef.current = true
        announceTile(cursor)
      }}
      onBlur={() => {
        hasFocusRef.current = false
        dirtyRef.current = true
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
