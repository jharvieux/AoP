import {
  findPath,
  mapTopology,
  tileIndex,
  type Captain,
  type CityState,
  type EncounterKind,
  type EncounterState,
  type GameMap,
} from '@aop/engine'
import { FACTIONS } from '@aop/content'
import { coordsEqual, type Coord, type FactionId } from '@aop/shared'
import {
  Assets,
  Container,
  Graphics,
  Sprite,
  Texture,
  type FillInput,
  type StrokeInput,
  type Ticker,
} from 'pixi.js'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { describeMapTile, moveCursor, panToKeepTileVisible } from './mapCursor'
import { cellCenter, cellPolygon, pixelToCell, visibleCellBounds } from './mapLayout'
import { Minimap } from './Minimap'
import { cityContentId, encounterContentId, resolveSpriteUrl, tileContentId } from './mapSprites'
import { easeInOutCubic, pathPixelAt, shipAnimDurationMs } from './shipAnimation'
import { useTheme } from './theme/ThemeContext'
import { createTextureLoader, type TextureLoader } from './textureLoader'
import { usePixiApp } from './usePixiApp'
import { cssToken } from './colorTokens'

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
// Resolved from the styles.css design tokens (#301) rather than hardcoded —
// Pixi/Canvas2D can't consume `var()`, so cssToken() reads the same
// custom properties the DOM uses.
export const TILE_COLOR = {
  deep: cssToken('--color-deep-water', '#1b4a6b'),
  shallows: cssToken('--map-shallows', '#2a6a8f'),
  land: cssToken('--map-land', '#4a7c3f'),
  port: cssToken('--color-gold', '#c9a227'),
} as const

const FOG_COLOR = cssToken('--color-fog', '#0b1a26')
const OWN_SHIP = cssToken('--color-success', '#3be2a1')
const ENEMY_SHIP = cssToken('--color-alert-border', '#e23b3b')
const OWN_CITY = cssToken('--color-gold', '#c9a227')
const ENEMY_CITY = cssToken('--map-enemy-city', '#9aa0a6')
const HIGHLIGHT_COLOR = cssToken('--color-white', '#ffffff')
const CURSOR_COLOR = cssToken('--map-cursor', '#ffe66d')
// Cosmetic hexagon tile boundary, hex maps only (#348). A faint hairline so the
// hex layout reads as a grid without competing with terrain art or the surf/fog.
const HEX_GRID_COLOR = cssToken('--map-hex-grid', '#0b1a26')
export const ENCOUNTER_COLOR = {
  merchant: cssToken('--color-merchant', '#e0b64f'),
  natives: cssToken('--map-encounter-natives', '#6fbf73'),
  settlers: cssToken('--map-encounter-settlers', '#c98bdb'),
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

// Coastline + tile-variety rendering (#347, #354). All rendering-only: a deterministic
// hash of integer tile coords picks each tile's variant, so two paints of the
// same tile agree and the engine's seeded RNG is never touched.
const SURF_COLOR = cssToken('--map-surf', '#bfe6f2')
const SURF_BAND = TILE * 0.16
const WATER_TYPES = new Set(['deep', 'shallows'])

// Texture scaling factor for crisper rendering (#354): source art is 128px,
// scaled 4x to TILE = 32. Increasing this trades memory for visual sharpness.
// At scale > 1, camera/culling math remains unchanged (world coords stay in
// 32-pixel grid), but sprites render at higher resolution. Scale = 1 is the
// baseline (current behavior); 1.5 or 2.0 gives noticeable sharpening on
// modern devices without re-tooling the entire coordinate system.
const TILE_TEXTURE_SCALE = 1

/** A stable [0,1) value per integer tile — the seed for that tile's rendering variant. */
function tileHash(x: number, y: number): number {
  let h = Math.imul(x + 1, 0x1f1f1f1f) ^ Math.imul(y + 1, 0x27d4eb2f)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 0xffffffff
}

/**
 * Marching-squares edge detection for autotiling coastlines (#354).
 * Land tiles bordering water get a bitmask variant (0-15) encoding which edges
 * touch water. Water tiles always return 0 (no autotiling).
 * Bitmask: bit 0 = north, bit 1 = east, bit 2 = south, bit 3 = west.
 * When new autotile variant art is added, `resolveSpriteUrl()` will use this
 * to pick edge-mask sprites keyed by terrain type + variant.
 */
function getAutotileVariant(map: GameMap, x: number, y: number): number {
  const tile = map.tiles[tileIndex(map, x, y)]
  if (!tile || WATER_TYPES.has(tile.type)) return 0
  // Land tile: check which orthogonal neighbors are water
  let variant = 0
  if (y > 0 && WATER_TYPES.has(map.tiles[tileIndex(map, x, y - 1)]!.type)) variant |= 1
  if (x < map.width - 1 && WATER_TYPES.has(map.tiles[tileIndex(map, x + 1, y)]!.type)) variant |= 2
  if (y < map.height - 1 && WATER_TYPES.has(map.tiles[tileIndex(map, x, y + 1)]!.type)) variant |= 4
  if (x > 0 && WATER_TYPES.has(map.tiles[tileIndex(map, x - 1, y)]!.type)) variant |= 8
  return variant
}

/**
 * Select a tile variant for rendering (#354). Combines autotile edge patterns
 * (for coast borders) with per-tile brightness variation (for terrain detail).
 * Returns a stable variant index [0-1) that can be used to pick distinct tile
 * art or blend alpha masks over a base sprite.
 */
function getTileVariant(map: GameMap, x: number, y: number): number {
  const autotile = getAutotileVariant(map, x, y)
  return autotile > 0 ? autotile / 16 : tileHash(x, y)
}

/** Parse a `#rrggbb` token to a packed 0xRRGGBB number, or null for any other format. */
function parseHexColor(c: string): number | null {
  if (c.length !== 7 || c[0] !== '#') return null
  const n = Number.parseInt(c.slice(1), 16)
  return Number.isNaN(n) ? null : n
}

/** Scale a packed color's brightness by `factor` (1 = unchanged), clamped per channel. */
function shadeColor(color: number, factor: number): number {
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v * factor)))
  return (
    (clamp((color >> 16) & 0xff) << 16) | (clamp((color >> 8) & 0xff) << 8) | clamp(color & 0xff)
  )
}

/**
 * A per-tile brightness multiplier around 1.0 (#347), so large stretches of one
 * terrain type stop reading as identical repeating squares. Deterministic from
 * the tile coords; the ±spread is deliberately small so the map still reads as
 * one terrain, just not a flat fill.
 */
function tileBrightness(x: number, y: number, spread: number): number {
  return 1 - spread + tileHash(x, y) * spread * 2
}

const isLandType = (t: string): boolean => t === 'land' || t === 'port'

/**
 * Paint a foam band on each edge of water tile (x,y) that borders land (#347),
 * so the coastline reads as a shoreline instead of a hard grid seam. Orthogonal
 * neighbours only — diagonal-only contacts don't get a band, which keeps the
 * surf reading as edges rather than corner dots.
 */
function paintSurf(g: Graphics, map: GameMap, x: number, y: number): void {
  const foam = { color: SURF_COLOR, alpha: 0.45 }
  const px = x * TILE
  const py = y * TILE
  if (y > 0 && isLandType(map.tiles[tileIndex(map, x, y - 1)]!.type)) {
    g.rect(px, py, TILE, SURF_BAND).fill(foam)
  }
  if (y < map.height - 1 && isLandType(map.tiles[tileIndex(map, x, y + 1)]!.type)) {
    g.rect(px, py + TILE - SURF_BAND, TILE, SURF_BAND).fill(foam)
  }
  if (x > 0 && isLandType(map.tiles[tileIndex(map, x - 1, y)]!.type)) {
    g.rect(px, py, SURF_BAND, TILE).fill(foam)
  }
  if (x < map.width - 1 && isLandType(map.tiles[tileIndex(map, x + 1, y)]!.type)) {
    g.rect(px + TILE - SURF_BAND, py, SURF_BAND, TILE).fill(foam)
  }
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
  // Navigation controls (#346) the overlay buttons + minimap drive. Assigned by
  // the Pixi effect (which owns the camera math) so React handlers can pan/zoom
  // without reaching into the imperative draw loop.
  const controlsRef = useRef<{
    zoomBy: (factor: number) => void
    centerOn: (tile: Coord) => void
    centerOnFleet: () => void
  } | null>(null)
  // Flipped on every render (a new action, fog reveal, selection change, …)
  // so the ticker below knows to redraw; the pan/zoom handlers flip it too.
  const dirtyRef = useRef(true)
  dirtyRef.current = true
  // Shared with the pack-switch effect below so it can release the previous
  // pack's decoded textures without tearing down the whole Pixi scene (#245).
  const textureLoaderRef = useRef<TextureLoader<Texture> | null>(null)
  // Living map (#298): sprites and their "rest" position/kind recorded during
  // the last full draw(), so the always-on ambient tick below can nudge
  // alpha/position every frame — cheap property writes, no Graphics rebuild —
  // without waiting for the next dirty redraw.
  const ambientTileSpritesRef = useRef(
    new Map<string, { sprite: Sprite; kind: 'water' | 'port' }>(),
  )
  const shipSpritesRef = useRef(new Map<string, { sprite: Sprite; baseX: number; baseY: number }>())
  const hasSelectionRef = useRef(false)

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
        panToKeepTileVisible(
          view,
          next,
          TILE,
          container.clientWidth,
          container.clientHeight,
          mapTopology(map),
        ),
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
    const coast = new Graphics() // Coastline surf overlay (#347)
    const entities = new Graphics()
    const citySprites = new Container()
    const encounterSprites = new Container()
    const shipSprites = new Container()
    const fog = new Graphics() // Feathered fog overlay (#299)
    const highlight = new Graphics()
    // Living map (#298): a dedicated layer for the selected-captain/city
    // pulse, kept separate from `highlight`'s static keyboard-cursor rect so
    // the pulse's per-frame alpha animation doesn't also dim the cursor.
    const selectionPulse = new Graphics()
    // Draw order: flat-color fallback first, then sprite layers on top, so a
    // texture that finishes loading later simply covers its own fallback tile.
    // Fog overlay drawn after entities so it can feather over all content.
    world.addChild(
      tiles,
      tileSprites,
      coast,
      entities,
      citySprites,
      encounterSprites,
      shipSprites,
      fog,
      highlight,
      selectionPulse,
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

    // Navigation controls (#346): center the camera on a tile, on the viewer's
    // fleet, and zoom about the viewport center — the button/minimap analogs of
    // the existing pointer pan/zoom. All use CSS-pixel container dims, the same
    // space as `view` and the pointer handlers.
    const viewportSize = () => ({
      w: containerRef.current?.clientWidth ?? pixiApp.renderer.width,
      h: containerRef.current?.clientHeight ?? pixiApp.renderer.height,
    })
    function centerOn(tile: Coord) {
      const { w, h } = viewportSize()
      const c = cellCenter(mapTopology(propsRef.current.map), tile.x, tile.y, TILE)
      view.x = w / 2 - c.x * view.scale
      view.y = h / 2 - c.y * view.scale
      dirtyRef.current = true
    }
    controlsRef.current = {
      zoomBy: (factor) => {
        const { w, h } = viewportSize()
        zoomAt(w / 2, h / 2, view.scale * factor)
      },
      centerOn,
      centerOnFleet: () => {
        const { captains, viewerId, selectedCaptainId } = propsRef.current
        const mine = captains.filter((c) => c.ownerId === viewerId && !c.captured)
        if (mine.length === 0) return
        // Prefer the selected captain when it's the viewer's, else the first.
        const target = mine.find((c) => c.id === selectedCaptainId) ?? mine[0]!
        centerOn(target.position)
      },
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

      // Topology dispatch (#348): `centerOf`/`fillCell`/`strokeCell` are the one
      // geometry seam the whole draw pass flows through. For a square map they
      // reproduce the exact prior arithmetic (`x*TILE + TILE/2`, an axis-aligned
      // `rect`), so square rendering is byte-identical; for a hex map they place
      // and outline pointy-top hexes via mapLayout.
      const topology = mapTopology(map)
      const centerOf = (x: number, y: number) => cellCenter(topology, x, y, TILE)
      const fillCell = (g: Graphics, x: number, y: number, style: FillInput) => {
        if (topology === 'hex') g.poly(cellPolygon('hex', x, y, TILE)).fill(style)
        else g.rect(x * TILE, y * TILE, TILE, TILE).fill(style)
      }
      const strokeCell = (g: Graphics, x: number, y: number, style: StrokeInput) => {
        if (topology === 'hex') g.poly(cellPolygon('hex', x, y, TILE)).stroke(style)
        else g.rect(x * TILE, y * TILE, TILE, TILE).stroke(style)
      }

      const w = pixiApp.renderer.width
      const h = pixiApp.renderer.height
      const { minX, minY, maxX, maxY } = visibleCellBounds(topology, map, view, w, h, TILE)

      // Living map (#298): repopulated below as textured tile/ship sprites
      // are (re)assigned this pass, so the ambient tick always nudges exactly
      // what's currently on screen.
      ambientTileSpritesRef.current.clear()
      shipSpritesRef.current.clear()

      tiles.clear()
      coast.clear()
      fog.clear()
      tilePool.begin()
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const key = `${x},${y}`
          const explored = exploredKeys.has(key)
          if (!explored) {
            fillCell(tiles, x, y, FOG_COLOR)
            continue
          }
          const tile = map.tiles[tileIndex(map, x, y)]!
          // Coastline (#347): a soft surf band on any explored water tile edge
          // that meets land, so land/water boundaries read as coast, not a grid
          // line. Drawn on its own layer above the tiles, under the fog. Square
          // only — paintSurf/autotiling key off the 4 orthogonal square neighbors
          // and the axis-aligned tile box, neither of which maps to a hex cell;
          // hex maps get the cosmetic hex-boundary pass below instead (#348).
          if (topology === 'square' && WATER_TYPES.has(tile.type)) {
            paintSurf(coast, map, x, y)
          }
          // Autotile variant selection (#354): land tiles bordering water get an
          // edge-pattern ID (0-15) via marching squares; used to pick edge-mask art
          // when autotile sprites are available (see mapSprites.tileAutotileId).
          const autotileVariant = topology === 'square' ? getAutotileVariant(map, x, y) : 0
          const spriteUrl = resolveSpriteUrl(
            themeSpriteUrlRef.current,
            autotileVariant > 0
              ? `tile:${tile.type}:edge:${autotileVariant}`
              : tileContentId(tile.type),
            TILE_SPRITE_URL[tile.type],
          )
          const texture = spriteUrl ? getTexture(spriteUrl) : undefined
          if (texture) {
            const sprite = tilePool.get(key)
            sprite.texture = texture
            // Texture scaling (#354): scale texture for crisper rendering. At
            // TILE_TEXTURE_SCALE = 1, sprite size = TILE (32px). At 1.5 or 2.0,
            // sprites are larger, giving sharper detail on high-DPI devices while
            // keeping world coordinates and culling math unchanged.
            sprite.width = TILE * TILE_TEXTURE_SCALE
            sprite.height = TILE * TILE_TEXTURE_SCALE
            const tc = centerOf(x, y)
            sprite.position.set(tc.x, tc.y)
            sprite.alpha = 1 // Sprites always fully opaque; fog layer handles dimming (#299)
            // Per-tile brightness variety (#347): a subtle deterministic tint so
            // repeated terrain art doesn't read as identical squares. Ambient
            // shimmer (#298) rides alpha, so tint here is orthogonal to it.
            sprite.tint = shadeColor(0xffffff, tileBrightness(x, y, 0.08))
            if (tile.type === 'deep' || tile.type === 'shallows') {
              ambientTileSpritesRef.current.set(key, { sprite, kind: 'water' })
            } else if (tile.type === 'port') {
              ambientTileSpritesRef.current.set(key, { sprite, kind: 'port' })
            }
            continue
          }
          // Flat-color fallback, varied per tile the same way (#347).
          const base = parseHexColor(TILE_COLOR[tile.type])
          const color =
            base !== null ? shadeColor(base, tileBrightness(x, y, 0.1)) : TILE_COLOR[tile.type]
          fillCell(tiles, x, y, { color, alpha: 1 }) // Full alpha; fog applies dimming
        }
      }
      // Cosmetic hex tile boundary (#348), hex maps only: a faint hairline around
      // each explored hex so the layout reads as a hex grid. Square maps deliberately
      // draw no such lines (their grid reads from the terrain art / surf bands).
      // Drawn on the `coast` layer — above the tile sprites (so terrain art doesn't
      // hide it) but below entities/fog — which is otherwise unused on hex maps
      // (paintSurf is square-only), so it needs no extra layer.
      if (topology === 'hex') {
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            if (!exploredKeys.has(`${x},${y}`)) continue
            strokeCell(coast, x, y, { width: 1, color: HEX_GRID_COLOR, alpha: 0.25 })
          }
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
            // Explored-but-fogged: dim it. Grade the alpha by how many of the 8
            // neighbours are currently visible (#347/#299), so the fog fades in
            // smoothly toward the sighted region instead of stepping in two hard
            // bands that only reinforced the grid.
            let visibleNeighbors = 0
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue
                if (visibleKeys.has(`${x + dx},${y + dy}`)) visibleNeighbors++
              }
            }
            const edgeAlpha = Math.max(0.16, 0.52 - visibleNeighbors * 0.05)
            fillCell(fog, x, y, { color: FOG_COLOR, alpha: edgeAlpha })
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
        const ec = centerOf(enc.position.x, enc.position.y)
        const cx = ec.x
        const cy = ec.y
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
        const cc = centerOf(city.position.x, city.position.y)
        const cx = cc.x
        const cy = cc.y
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
        entities.rect(cx - (TILE - 12) / 2, cy - (TILE - 12) / 2, TILE - 12, TILE - 12)
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

        let center = centerOf(cap.position.x, cap.position.y)
        const anim = shipAnims.get(cap.id)
        if (anim) {
          const t = anim.durationMs > 0 ? anim.elapsedMs / anim.durationMs : 1
          if (t >= 1) {
            shipAnims.delete(cap.id)
          } else {
            // Interpolate in pixel space so a hex sail traces a straight visual
            // path across the row-parity stagger (#348); on a square map this is
            // identical to projecting pathPointAt's tile-space point.
            center = pathPixelAt(anim.path, easeInOutCubic(t), (c) => centerOf(c.x, c.y))
          }
        }

        const cx = center.x
        const cy = center.y
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
          shipSpritesRef.current.set(cap.id, { sprite, baseX: cx, baseY: cy })
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
      selectionPulse.clear()
      const selected = selectedCaptainId
        ? captains.find((c) => c.id === selectedCaptainId)
        : undefined
      hasSelectionRef.current = !!selected
      if (selected) {
        // Geometry only — the ambient tick below animates this layer's alpha
        // into a pulse (#298) every frame, not just on a dirty redraw.
        strokeCell(selectionPulse, selected.position.x, selected.position.y, {
          width: 3,
          color: HIGHLIGHT_COLOR,
        })
      }
      // Keyboard tile cursor (#247) — only drawn while the map has keyboard
      // focus, so pointer-only play isn't cluttered with a cursor no one asked for.
      if (hasFocusRef.current) {
        const c = cursorRef.current
        strokeCell(highlight, c.x, c.y, { width: 2, color: CURSOR_COLOR })
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
      // Screen → world px → grid coord under the map's topology (#348). Square is
      // the prior floor-divide; hex inverts the pointy-top layout via mapLayout.
      const cell = pixelToCell(
        mapTopology(map),
        (screenX - view.x) / view.scale,
        (screenY - view.y) / view.scale,
        TILE,
      )
      if (cell.x < 0 || cell.x >= map.width || cell.y < 0 || cell.y >= map.height) return
      propsRef.current.onTileClick(cell.x, cell.y)
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

    // Living map (#298): a small always-on layer, independent of the
    // dirty-redraw guard below — subtle water/port shimmer, gentle ship bob,
    // and a pulse on the selected captain/city. Every frame it only mutates
    // already-created sprites' `alpha`/`position` (never rebuilds Graphics
    // fill commands), so it stays cheap enough for the mobile budget even
    // though — unlike `draw()` — it runs whether or not anything is dirty.
    let ambientMs = 0
    function animateAmbient(deltaMs: number) {
      ambientMs += deltaMs
      const t = ambientMs / 1000
      for (const [key, { sprite, kind }] of ambientTileSpritesRef.current) {
        const [xs, ys] = key.split(',')
        const phase = Number(xs) * 0.6 + Number(ys) * 0.4
        const base = propsRef.current.visibleKeys.has(key) ? 1 : 0.5
        const swing = kind === 'water' ? 0.12 : 0.06
        const speed = kind === 'water' ? 1.6 : 0.8
        sprite.alpha = base * (1 - swing + swing * (0.5 + 0.5 * Math.sin(t * speed + phase)))
      }
      for (const [id, { sprite, baseX, baseY }] of shipSpritesRef.current) {
        let hash = 0
        for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
        const phase = (hash % 628) / 100
        sprite.position.set(baseX, baseY + Math.sin(t * 2 + phase) * 1.4)
      }
      selectionPulse.alpha = hasSelectionRef.current ? 0.5 + 0.5 * Math.sin(t * 3.4) : 0
    }

    // Only rebuild the tile/entity Graphics when something actually changed
    // (camera moved or game state updated) instead of every ticker frame
    // (#27) — on mid-range phones a redraw is real work (fill + culling loop
    // over every visible tile), and most frames while idle have nothing new
    // to show. A ship mid-sail (#297) is an exception: nothing else about the
    // scene changed, but the animation still needs a redraw every frame to
    // progress, so an in-flight `shipAnims` entry keeps ticking even when
    // `dirtyRef` is clean. The ambient tick above is exempt from this guard
    // entirely by design — that's the whole point of #298.
    function tick(ticker: Ticker) {
      animateAmbient(ticker.deltaMS)
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
      controlsRef.current = null
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

      {/* Navigation affordances (#346): zoom, recenter-on-fleet, and a minimap —
          all optional overlays over the Pixi canvas, driven via controlsRef. */}
      <div className="map-nav-controls">
        <button
          type="button"
          className="map-nav-button"
          aria-label="Zoom in"
          onClick={() => controlsRef.current?.zoomBy(1.25)}
        >
          +
        </button>
        <button
          type="button"
          className="map-nav-button"
          aria-label="Zoom out"
          onClick={() => controlsRef.current?.zoomBy(0.8)}
        >
          −
        </button>
        <button
          type="button"
          className="map-nav-button"
          aria-label="Center on fleet"
          title="Center on fleet"
          onClick={() => controlsRef.current?.centerOnFleet()}
        >
          ⌖
        </button>
      </div>

      <Minimap
        map={props.map}
        cities={props.cities}
        captains={props.captains}
        viewerId={props.viewerId}
        exploredKeys={props.exploredKeys}
        visibleKeys={props.visibleKeys}
        cameraRef={viewRef}
        containerRef={containerRef}
        tileSize={TILE}
        onJump={(tile) => controlsRef.current?.centerOn(tile)}
      />

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
