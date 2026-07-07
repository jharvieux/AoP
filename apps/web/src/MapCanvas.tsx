import {
  findPath,
  tileIndex,
  type Captain,
  type CityState,
  type EncounterKind,
  type EncounterState,
  type GameMap,
} from '@aop/engine'
import { FACTIONS } from '@aop/content'
import { coordsEqual, type Coord, type FactionId } from '@aop/shared'
import { Assets, Container, Graphics, Sprite, Texture, type Ticker } from 'pixi.js'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { describeMapTile, moveCursor, panToKeepTileVisible } from './mapCursor'
import { cityContentId, encounterContentId, resolveSpriteUrl, tileContentId } from './mapSprites'
import { easeInOutCubic, pathPointAt, shipAnimDurationMs } from './shipAnimation'
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

// A single move spends at most `captain.movementPoints` (default 5 — see
// startingCaptainMovement in @aop/content's tuning) tiles of path, so any detected jump
// longer than this is a fogged-reappearance or a state snapshot, not a move to animate
// (#297) — sail the ordinary case, snap instantly for anything this large.
const MAX_ANIMATED_PATH_TILES = 40

/** Every default (non-theme-pack-override) sprite URL the map can draw, so they can be
 * warmed into the texture cache before first paint (#300) instead of popping in tile by
 * tile as the camera first reaches them. Theme-pack overrides are `data:` URLs decided at
 * runtime and are out of scope here — they're already in memory, just not yet decoded. */
function defaultArtUrls(): string[] {
  const urls = new Set<string>()
  for (const url of Object.values(TILE_SPRITE_URL)) {
    if (url) urls.add(url)
  }
  urls.add(CITY_SPRITE_URL.own)
  urls.add(CITY_SPRITE_URL.enemy)
  for (const url of Object.values(ENCOUNTER_SPRITE_URL)) urls.add(url)
  for (const faction of Object.values(FACTIONS)) {
    if (faction.shipSpriteUrl) urls.add(faction.shipSpriteUrl)
    for (const url of Object.values(faction.shipSpriteUrlsByClass ?? {})) {
      if (url) urls.add(url)
    }
  }
  return [...urls]
}

/** One ship's in-flight sail animation (#297): `path` is the tile-by-tile route from
 * `findPath`, `elapsedMs` accumulates ticker delta time, and rendering interpolates along
 * `path` by `elapsedMs / durationMs` (eased) rather than snapping straight to the last tile. */
interface ShipAnim {
  path: Coord[]
  elapsedMs: number
  durationMs: number
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
  const { containerRef, app, error } = usePixiApp({ background: TILE_COLOR.deep })
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
    const fog = new Graphics() // Feathered fog overlay (#299)
    const highlight = new Graphics()
    // Draw order: flat-color fallback first, then sprite layers on top, so a
    // texture that finishes loading later simply covers its own fallback tile.
    // Fog overlay drawn after entities so it can feather over all content.
    world.addChild(
      tiles,
      tileSprites,
      entities,
      citySprites,
      encounterSprites,
      shipSprites,
      fog,
      highlight,
    )
    pixiApp.stage.addChild(world)

    const textureLoader = createTextureLoader<Texture>(Assets, () => {
      dirtyRef.current = true
    })
    textureLoaderRef.current = textureLoader
    // Warm the whole default art set up front (#300) so the common case — panning into a
    // tile/city/encounter/ship whose texture was never requested before — is already a
    // cache hit instead of a flat-color-then-pop.
    void textureLoader.preload(defaultArtUrls())
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

    // Ship-sail animation state (#297), keyed by captain id. `lastCaptainPos` is the last
    // authoritative (GameState) tile seen for that captain, used to detect a move and
    // reconstruct its path; `shipAnims` holds the in-flight interpolation for captains
    // currently mid-sail. Both are plain closure state (like `pointers` above), not React
    // refs — this effect only re-runs when `app` changes.
    const lastCaptainPos = new Map<string, Coord>()
    const shipAnims = new Map<string, ShipAnim>()

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

    function draw(deltaMs: number) {
      // Advance in-flight sail animations before this frame's ship loop reads them, so a
      // freshly created one below (from a position change detected this same frame) starts
      // at elapsedMs=0 instead of already-advanced.
      for (const anim of shipAnims.values()) anim.elapsedMs += deltaMs

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
      fog.clear()
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
            sprite.alpha = 1 // Sprites always fully opaque; fog layer handles dimming
            continue
          }
          tiles.rect(x * TILE, y * TILE, TILE, TILE)
          tiles.fill({ color: TILE_COLOR[tile.type], alpha: 1 }) // Full alpha; fog applies dimming
        }
      }
      tilePool.end()

      // Render feathered fog overlay (#299): soft edges between unexplored/explored/visible.
      // For each explored tile, render a dimming layer if it's not currently visible.
      // We check neighboring tiles to feather the fog boundary — tiles at the edge of
      // the fog region render with decreased alpha for a smooth transition.
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const key = `${x},${y}`
          const explored = exploredKeys.has(key)
          const visibleNow = visibleKeys.has(key)

          if (!visibleNow && explored) {
            // Tile is explored but not currently visible: render dimming fog.
            // Count how many neighboring tiles are currently visible to determine edge proximity.
            let visibleNeighbors = 0
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue
                const nkey = `${x + dx},${y + dy}`
                if (visibleKeys.has(nkey)) visibleNeighbors++
              }
            }
            // At fog edges (adjacent to visible tiles), fade the fog alpha for a soft boundary.
            // Tiles surrounded by other explored tiles get full dimming (alpha ~0.5),
            // tiles at the edge get lighter dimming (alpha ~0.3) for smooth gradient.
            const edgeAlpha = visibleNeighbors > 0 ? 0.3 : 0.5
            fog.rect(x * TILE, y * TILE, TILE, TILE)
            fog.fill({ color: FOG_COLOR, alpha: edgeAlpha })
          }
        }
      }

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
      const liveCaptainIds = new Set<string>()
      for (const cap of captains) {
        liveCaptainIds.add(cap.id)
        const key = `${cap.position.x},${cap.position.y}`
        const own = cap.ownerId === viewerId
        if (!own && !visibleKeys.has(key)) continue

        // Detect a move since the last draw (#297): reconstruct the sea path just
        // travelled and animate along it instead of snapping straight to the new tile.
        // A missing/oversized path (fogged reappearance far away, first sighting, etc.)
        // falls back to an instant snap — see MAX_ANIMATED_PATH_TILES.
        const lastPos = lastCaptainPos.get(cap.id)
        if (lastPos && !coordsEqual(lastPos, cap.position)) {
          const path = findPath(map, lastPos, cap.position)
          if (path && path.length >= 2 && path.length <= MAX_ANIMATED_PATH_TILES) {
            shipAnims.set(cap.id, { path, elapsedMs: 0, durationMs: shipAnimDurationMs(path) })
          } else {
            shipAnims.delete(cap.id)
          }
        }
        lastCaptainPos.set(cap.id, cap.position)

        let renderX = cap.position.x
        let renderY = cap.position.y
        const anim = shipAnims.get(cap.id)
        if (anim) {
          const t = anim.durationMs > 0 ? anim.elapsedMs / anim.durationMs : 1
          if (t >= 1) {
            shipAnims.delete(cap.id)
          } else {
            const point = pathPointAt(anim.path, easeInOutCubic(t))
            renderX = point.x
            renderY = point.y
          }
        }

        const cx = renderX * TILE + TILE / 2
        const cy = renderY * TILE + TILE / 2
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
      // Drop tracking for captains that no longer exist at all (sunk, eliminated seat, …) —
      // mirrors SpritePool's own end()-time cleanup so this doesn't grow unbounded over a
      // long session.
      for (const id of [...lastCaptainPos.keys()]) {
        if (liveCaptainIds.has(id)) continue
        lastCaptainPos.delete(id)
        shipAnims.delete(id)
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
    // to show. A ship mid-sail (#297) is an exception: nothing else about the
    // scene changed, but the animation still needs a redraw every frame to
    // progress, so an in-flight `shipAnims` entry keeps ticking even when
    // `dirtyRef` is clean.
    function tick(ticker: Ticker) {
      const animating = shipAnims.size > 0
      if (!dirtyRef.current && !animating) return
      dirtyRef.current = false
      draw(ticker.deltaMS)
    }
    pixiApp.ticker.add(tick)

    return () => {
      // usePixiApp's own cleanup effect is registered before this one (it
      // runs first inside the component), so on unmount it destroys the Pixi
      // Application before this cleanup runs. `Application.destroy()`
      // synchronously nulls out `ticker`, `renderer`, and `stage` (#306) —
      // guard each before touching it, since `pixiApp` here is a stale
      // reference to that now-torn-down instance.
      if (pixiApp.ticker) pixiApp.ticker.remove(tick)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      if (pixiApp.renderer) pixiApp.renderer.off('resize', onResize)
      if (pixiApp.stage) pixiApp.stage.removeChild(world)
      world.destroy({ children: true })
    }
  }, [app])

  // #241: without this, a failed Application.init() (blacklisted GPU,
  // exhausted WebGL contexts, some WebViews) left `app` undefined forever and
  // this rendered an empty, unexplained div — the whole map invisible, with
  // no signal that anything had gone wrong.
  if (error) {
    return (
      <div className="map-canvas-error">
        <p>The map couldn&rsquo;t be displayed on this device.</p>
        <p className="map-canvas-error__detail">{error.message}</p>
      </div>
    )
  }

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
