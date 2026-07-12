import {
  findPath,
  mapTopology,
  tileIndex,
  type Captain,
  type CityState,
  type EncounterKind,
  type EncounterState,
  type GameMap,
  type LandingParty,
} from '@aop/engine'
import { FACTIONS } from '@aop/content'
import { coordsEqual, type Coord, type FactionId } from '@aop/shared'
import {
  Assets,
  BlurFilter,
  Container,
  Graphics,
  Sprite,
  Texture,
  type FillInput,
  type StrokeInput,
  type Ticker,
} from 'pixi.js'
import { useEffect, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react'
import { describeMapTile, moveCursor, panToKeepTileVisible } from './mapCursor'
import { cellCenter, cellPolygon, pixelToCell, visibleCellBounds } from './mapLayout'
import { loopStrokeRuns, smoothLoop, traceRegionLoops } from './paintedWorld'
import { Minimap } from './Minimap'
import { cityContentId, encounterContentId, resolveSpriteUrl, tileContentId } from './mapSprites'
import { arrowheadAngle, pathToDotSegments, turnBoundaryIndices } from './pathPreview'
import type { RangeOverlay } from './shipRange'
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
// Dotted course preview (#375): this-turn legs vs. legs that only happen on a
// later turn, once movement refreshes.
const COURSE_NOW_COLOR = cssToken('--map-course-now', '#e0b64f')
const COURSE_LATER_COLOR = cssToken('--map-course-later', '#5c7a94')
// Ship movement-range shading (#371): reachable water, an engageable enemy/city,
// and a reachable neutral encounter — muted to sit under the entity sprites.
const RANGE_ALLY_COLOR = cssToken('--map-range-ally', '#3f7d54')
const RANGE_ENEMY_COLOR = cssToken('--map-range-enemy', '#a6402f')
const RANGE_NEUTRAL_COLOR = cssToken('--map-range-neutral', '#b8912f')
// Painted-world coastline treatment (#393): a sand rim on the land side of the
// traced coast, a darker shoreline hairline, and a wide translucent foam band
// on the water side.
const SAND_COLOR = cssToken('--map-sand', '#cdb87e')
const SHORE_COLOR = cssToken('--map-shore', '#2c4a33')
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

// Painted-world rendering (#392/#393): all rendering-only — a deterministic
// hash of integer tile coords drives every per-cell variation, so two paints of
// the same tile agree and the engine's seeded RNG is never touched.
const SURF_COLOR = cssToken('--map-surf', '#bfe6f2')
const WATER_TYPES = new Set(['deep', 'shallows'])
// Fraction of explored water cells that carry a drifting sun-glint sprite; the
// ambient ticker (#298) oscillates their alpha so the ocean reads as moving.
const GLINT_DENSITY = 0.14
// Slow caustic blobs (#405): a sparser water subset than the glints, selected
// from the TOP of the hash range so the two sets never overlap (glints take
// `tileHash < GLINT_DENSITY`, caustics `tileHash > CAUSTIC_MIN_HASH`).
const CAUSTIC_MIN_HASH = 0.95
// Terrain washes over land (#404): darker discs over "forest" cells and a
// lighter warm-green over "clearing" cells, thresholds aligned with the
// existing speckle cutoff so vegetation and flecks agree.
const FOREST_WASH_COLOR = 0x2f5426
const CLEARING_WASH_COLOR = 0x9ab873

/** A stable [0,1) value per integer tile — the seed for that tile's rendering variant. */
function tileHash(x: number, y: number): number {
  let h = Math.imul(x + 1, 0x1f1f1f1f) ^ Math.imul(y + 1, 0x27d4eb2f)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 0xffffffff
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
 * A white → transparent diagonal gradient texture (#402). Painted once into an
 * offscreen canvas because Texture.WHITE is uniform and can't by itself encode a
 * light *direction*; a Sprite of this texture tinted warm and blended soft-light
 * gives the whole map one consistent top-left light. Static — generated once at
 * scene setup, never per frame.
 */
function makeLightTexture(): Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return Texture.from(canvas)
}

// The uncharted world (#394): everything outside the explored region — fogged
// map cells and the void beyond the map edge alike — renders as one darker
// shade of the same ocean, so the frontier is a soft lightening of the sea
// rather than a wall of black hexes.
const UNCHARTED_SHADE = 0.5

/**
 * The painted-world terrain geometry (#393/#394) for one (map, exploredKeys)
 * pair: smoothed coastline loops of the explored landmass, and the smoothed
 * outline of the whole explored region (the "known world" — everything outside
 * it renders as uniform uncharted sea, including beyond the map's edge).
 * Rebuilt only when exploration changes — tracing walks the whole grid, far
 * too much for a per-frame pan redraw.
 */
interface PaintedGeometry {
  coastLoops: { points: number[]; hole: boolean }[]
  exploredLoops: { points: number[]; hole: boolean }[]
}

function buildPaintedGeometry(map: GameMap, exploredKeys: Set<string>): PaintedGeometry {
  const topology = mapTopology(map)
  const exploredLand = (x: number, y: number): boolean =>
    exploredKeys.has(`${x},${y}`) && isLandType(map.tiles[tileIndex(map, x, y)]!.type)
  const coast = traceRegionLoops(topology, map.width, map.height, TILE, exploredLand)
  const explored = traceRegionLoops(topology, map.width, map.height, TILE, (x, y) =>
    exploredKeys.has(`${x},${y}`),
  )
  return {
    coastLoops: coast.map((l) => ({ points: smoothLoop(l.points, 2), hole: l.hole })),
    exploredLoops: explored.map((l) => ({ points: smoothLoop(l.points, 2), hole: l.hole })),
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

/**
 * Imperative camera controls (#346) the Pixi effect assigns once the scene is
 * live. Exposed to the parent via {@link MapCanvasProps.controlsRef} so out-of-
 * canvas UI (the city roster, #373) can recenter without reaching into the draw
 * loop.
 */
export interface MapControls {
  zoomBy: (factor: number) => void
  centerOn: (tile: Coord) => void
  centerOnFleet: () => void
}

export interface MapCanvasProps {
  map: GameMap
  captains: Captain[]
  cities: CityState[]
  encounters: EncounterState[]
  /** Landing parties ashore (#465). Optional so read-only consumers predating parties need no change. */
  parties?: LandingParty[] | undefined
  viewerId: string
  visibleKeys: Set<string>
  exploredKeys: Set<string>
  selectedCaptainId: string | null
  /** The selected landing party (#465), pulsed like the selected ship. */
  selectedPartyId?: string | null | undefined
  onTileClick: (x: number, y: number) => void
  /**
   * Movement-range shading for the selected ship (#371): three `"x,y"` key
   * lists (reachable water / engageable enemy / reachable encounter) the range
   * layer fills. Omitted or empty draws nothing.
   */
  rangeOverlay?: RangeOverlay | undefined
  /**
   * Confirm a multi-turn course (#372/#375): fired when a touch user taps an
   * out-of-range water tile a second time. Omitted disables the touch confirm
   * (the sticky preview just clears on the second tap instead).
   */
  onSetCourse?: (cell: Coord) => void
  /** Owning player id -> faction id, so ships can pick a faction-specific sprite (#115). */
  factionOf: (ownerId: string) => FactionId
  /** Filled with the live camera controls (#346/#373) so the parent can recenter. */
  controlsRef?: MutableRefObject<MapControls | null>
}

export function MapCanvas(props: MapCanvasProps) {
  const deepPacked = parseHexColor(TILE_COLOR.deep) ?? 0x1b4a6b
  const { containerRef, app, error } = usePixiApp({
    background: `#${shadeColor(deepPacked, UNCHARTED_SHADE).toString(16).padStart(6, '0')}`,
  })
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
  const controlsRef = useRef<MapControls | null>(null)
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
  // Slow water caustics (#405): recorded per on-screen blob so the ambient tick
  // can drift each one and oscillate its alpha on a much longer period than the
  // glints — no Graphics rebuild, just property writes.
  const causticSpritesRef = useRef(
    new Map<string, { sprite: Sprite; baseX: number; baseY: number }>(),
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

  // Naval course preview (#375): the tile a dotted route preview should sail
  // to, from whichever selected captain owns the current turn. Mouse hover
  // (`hoverCellRef`) is live and mouse-only; touch has no hover, so a tap sets
  // a sticky `touchPreviewRef` instead — tapping the same tile again clears it
  // (a real "confirm" arrives once #372's sail orders exist to dispatch).
  // Keyboard's existing `cursor` above doubles as a third preview source when
  // the map has focus — see draw()'s previewTarget pick, which prioritizes
  // live mouse hover, then the keyboard cursor, then a sticky touch tap.
  const hoverCellRef = useRef<Coord | null>(null)
  const touchPreviewRef = useRef<Coord | null>(null)
  const [touchPreviewHint, setTouchPreviewHint] = useState<string | null>(null)

  function announceTile(tile: Coord) {
    const { map, captains, cities, encounters, parties, viewerId } = props
    setAnnouncement(
      describeMapTile({
        tile,
        terrain: map.tiles[tileIndex(map, tile.x, tile.y)]!.type,
        captains,
        cities,
        encounters,
        ...(parties ? { parties } : {}),
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
    // Painted world (#392/#394): the canvas background is the dark uncharted
    // sea. `knownSea` paints the smoothed explored region in the full ocean
    // color with a soft halo, so the frontier of the known world is a curve of
    // light fading into darkness — never a wall of fog cells. Land renders as
    // tile art inside `landGroup`, whose stencil mask is the smoothed traced
    // coastline, so islands have organic silhouettes no matter how blocky the
    // cell art underneath is.
    const knownSea = new Graphics()
    // Slow caustic layer (#405): big soft light blobs over open water, one blur
    // pass on the whole container (not per sprite), composited soft-light so it
    // reads as light playing under the surface. Sits above the dark ocean fill
    // and below land/fog, so fog dimming still grades over it correctly.
    const caustics = new Container()
    caustics.blendMode = 'soft-light'
    caustics.filters = [new BlurFilter({ strength: 10, quality: 2 })]
    const landGroup = new Container()
    const landMask = new Graphics()
    const tileSprites = new Container() // land/port tile art, clipped by landMask
    const landDetail = new Graphics() // flat fallback + terrain speckles, clipped too
    landGroup.addChild(tileSprites, landDetail)
    landGroup.mask = landMask
    // Shallows wash: soft overlapping discs over shallow-water cells, drawn
    // above the land group so the wash laps a few pixels onto the traced
    // coast — reads as wet sand / surf zone rather than a cell boundary.
    const wash = new Graphics()
    const glintSprites = new Container() // drifting sun glints on open water (#392)
    const coast = new Graphics() // sand rim + shoreline + foam along the traced loops (#393)
    // Movement-range shading (#371): reachable water + engageable targets, under
    // the entity sprites so a shaded ship/city still reads clearly on top.
    const range = new Graphics()
    const entities = new Graphics()
    const citySprites = new Container()
    const encounterSprites = new Container()
    const shipSprites = new Container()
    const fog = new Graphics() // Feathered fog overlay (#299/#394)
    // Dotted course preview (#375), above fog so it reads clearly over dimmed
    // explored-but-not-visible water — the preview is a planning aid, not
    // something that should itself respect the viewer's live fog of war.
    const pathPreview = new Graphics()
    const highlight = new Graphics()
    // Living map (#298): a dedicated layer for the selected-captain/city
    // pulse, kept separate from `highlight`'s static keyboard-cursor rect so
    // the pulse's per-frame alpha animation doesn't also dim the cursor.
    const selectionPulse = new Graphics()
    // Fog overlay drawn after entities so it can feather over all content.
    world.addChild(
      knownSea,
      caustics,
      landMask,
      landGroup,
      wash,
      glintSprites,
      coast,
      range,
      entities,
      citySprites,
      encounterSprites,
      shipSprites,
      fog,
      pathPreview,
      highlight,
      selectionPulse,
    )
    pixiApp.stage.addChild(world)

    // Screen-fixed overlays (#401/#402): added to the stage above `world`, so
    // they never pan or zoom. `light` is a single soft-light gradient sprite
    // that gives the whole map one consistent top-left light direction;
    // `vignette` darkens the frame edge so the world reads as receding into the
    // uncharted dark rather than stopping at a flat plane. Both are laid out
    // (sized/redrawn) only on renderer resize — never per frame.
    const lightTexture = makeLightTexture()
    const light = new Sprite(lightTexture)
    light.tint = 0xfff8e0
    light.alpha = 0.06
    light.blendMode = 'soft-light'
    const vignette = new Graphics()
    pixiApp.stage.addChild(light, vignette)

    function layoutScreenOverlays() {
      const sw = pixiApp.renderer.screen.width
      const sh = pixiApp.renderer.screen.height
      light.width = sw
      light.height = sh
      // Fake a radial gradient with concentric inset rings whose alpha falls off
      // by ~15% of the shorter side — Pixi Graphics has no native gradient, the
      // same layered-stroke trick knownSea's halo uses.
      vignette.clear()
      const rings = 6
      const step = (Math.min(sw, sh) * 0.15) / rings
      for (let i = 0; i < rings; i++) {
        const inset = i * step
        vignette.rect(inset, inset, sw - inset * 2, sh - inset * 2).stroke({
          width: step * 1.1,
          color: FOG_COLOR,
          alpha: 0.5 * (1 - i / rings),
          alignment: 1, // inside the screen rect (Pixi v8: 1 = inside)
        })
      }
    }
    layoutScreenOverlays()

    // Terrain geometry cache (#393). GameScreen/playerViewBoard build a fresh
    // exploredKeys Set on every state update, so keying on Set identity would
    // retrace the whole grid every action. Exploration is monotonic per viewer
    // (visibility.ts only ever adds explored tiles), so (map, size, viewer) is
    // a complete content key: same map, same viewer, and same count means the
    // same set of explored cells.
    let painted: {
      map: GameMap
      size: number
      viewerId: string
      geom: PaintedGeometry
    } | null = null
    function paintedGeometry(map: GameMap, exploredKeys: Set<string>): PaintedGeometry {
      const viewerId = propsRef.current.viewerId
      if (
        !painted ||
        painted.map !== map ||
        painted.size !== exploredKeys.size ||
        painted.viewerId !== viewerId
      ) {
        painted = {
          map,
          size: exploredKeys.size,
          viewerId,
          geom: buildPaintedGeometry(map, exploredKeys),
        }
      }
      return painted.geom
    }

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
    const glintPool = new SpritePool(glintSprites)
    const causticPool = new SpritePool(caustics)
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
    // Mirror to the parent's ref (#373) so out-of-canvas UI can recenter too.
    if (propsRef.current.controlsRef) propsRef.current.controlsRef.current = controlsRef.current

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
        parties = [],
        viewerId,
        visibleKeys,
        exploredKeys,
        selectedCaptainId,
        selectedPartyId,
        rangeOverlay,
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
      causticSpritesRef.current.clear()
      shipSpritesRef.current.clear()

      const geom = paintedGeometry(map, exploredKeys)

      knownSea.clear()
      landMask.clear()
      landDetail.clear()
      wash.clear()
      coast.clear()
      fog.clear()
      tilePool.begin()
      glintPool.begin()
      causticPool.begin()

      // The known world (#394): fill the explored region with the full ocean
      // color over the darker uncharted background, ringed by two soft halo
      // strokes so exploration's frontier fades out instead of stepping.
      const unchartedColor = shadeColor(deepPacked, UNCHARTED_SHADE)
      for (const loop of geom.exploredLoops) {
        if (loop.hole) continue
        knownSea.poly(loop.points).stroke({ width: TILE * 1.2, color: deepPacked, alpha: 0.18 })
        knownSea.poly(loop.points).stroke({ width: TILE * 0.55, color: deepPacked, alpha: 0.3 })
        knownSea.poly(loop.points).fill(deepPacked)
      }
      for (const loop of geom.exploredLoops) {
        // Enclosed unexplored pockets go back to uncharted dark.
        if (loop.hole) knownSea.poly(loop.points).fill(unchartedColor)
      }

      // Landmass silhouette + coastline (#393): the traced, smoothed loops.
      // Holes (water enclosed by land) are skipped from the mask so lake cells
      // simply stay ocean-colored; their shoreline still gets stroked below.
      for (const loop of geom.coastLoops) {
        if (!loop.hole) landMask.poly(loop.points).fill(0xffffff)
      }
      for (const loop of geom.coastLoops) {
        // Water side first: a wide translucent foam band, then a tighter sand
        // rim, then a crisp shoreline — layered strokes centred on the same
        // curve read as a beach gradient without any per-cell art. The foam and
        // sand are stroked in short overlapping runs (#403) whose alpha is
        // jittered per-run by `tileHash` of the run's first point, so the surf
        // breathes unevenly along the shore instead of reading as one uniform
        // outline. The shore hairline stays a single uniform loop so the
        // silhouette stays crisp.
        for (const run of loopStrokeRuns(loop.points, 6)) {
          const jitter = 0.7 + tileHash(Math.round(run[0]!), Math.round(run[1]!)) * 0.6
          coast
            .poly(run, false)
            .stroke({ width: TILE * 0.5, color: SURF_COLOR, alpha: 0.16 * jitter })
          coast
            .poly(run, false)
            .stroke({ width: TILE * 0.24, color: SAND_COLOR, alpha: 0.55 * jitter })
        }
        coast.poly(loop.points).stroke({ width: 1.5, color: SHORE_COLOR, alpha: 0.6 })
      }

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const key = `${x},${y}`
          if (!exploredKeys.has(key)) continue
          const tile = map.tiles[tileIndex(map, x, y)]!

          if (WATER_TYPES.has(tile.type)) {
            // Shallows wash (#392): soft overlapping discs merge into one
            // organic shoal region — no cell seams. Two radii layer a brighter
            // core inside a wider fade.
            if (tile.type === 'shallows') {
              const c = centerOf(x, y)
              const washColor = parseHexColor(TILE_COLOR.shallows) ?? 0x2a6a8f
              wash.circle(c.x, c.y, TILE * 0.92).fill({ color: washColor, alpha: 0.28 })
              wash.circle(c.x, c.y, TILE * 0.6).fill({ color: washColor, alpha: 0.3 })
            }
            // Sun glints (#392): a sparse deterministic subset of water cells
            // carries a small light streak whose alpha the ambient tick
            // oscillates — the ocean moves without any per-frame Graphics work.
            if (tileHash(x, y) < GLINT_DENSITY) {
              const sprite = glintPool.get(key)
              sprite.texture = Texture.WHITE
              sprite.width = TILE * (0.18 + tileHash(y, x) * 0.2)
              sprite.height = 1.6
              sprite.rotation = -0.35 + tileHash(x + 1, y) * 0.7
              const c = centerOf(x, y)
              sprite.position.set(
                c.x + (tileHash(x, y + 1) - 0.5) * TILE * 0.8,
                c.y + (tileHash(x + 2, y) - 0.5) * TILE * 0.8,
              )
              sprite.tint = 0xdff1fa
              ambientTileSpritesRef.current.set(key, { sprite, kind: 'water' })
            }
            // Slow caustics (#405): a sparser subset than the glints (disjoint
            // by hash range) carries a big soft blob the ambient tick drifts and
            // fades on a long period — the ocean's large-scale "light under the
            // surface". The container's blur + soft-light do the rest.
            if (tileHash(x, y) > CAUSTIC_MIN_HASH) {
              const sprite = causticPool.get(key)
              sprite.texture = Texture.WHITE
              sprite.width = TILE * 2.5
              sprite.height = TILE * 2.5
              sprite.tint = 0xeaf4fb
              const c = centerOf(x, y)
              sprite.position.set(c.x, c.y)
              causticSpritesRef.current.set(key, { sprite, baseX: c.x, baseY: c.y })
            }
            continue
          }

          // Land/port tile art, clipped to the traced coastline by landGroup's
          // mask — the art supplies interior texture, the mask the silhouette.
          const spriteUrl = resolveSpriteUrl(
            themeSpriteUrlRef.current,
            tileContentId(tile.type),
            TILE_SPRITE_URL[tile.type],
          )
          const texture = spriteUrl ? getTexture(spriteUrl) : undefined
          if (texture) {
            const sprite = tilePool.get(key)
            sprite.texture = texture
            // Slightly oversized so hex packing (row pitch 0.87×TILE) leaves no
            // gaps between the square art tiles inside the mask.
            sprite.width = TILE * 1.16
            sprite.height = TILE * 1.16
            const tc = centerOf(x, y)
            sprite.position.set(tc.x, tc.y)
            sprite.alpha = 1 // Fog layer handles dimming (#299)
            // Per-tile brightness variety (#347) so repeated art doesn't read
            // as identical squares; kept subtle to avoid seams at overlaps.
            sprite.tint = shadeColor(0xffffff, tileBrightness(x, y, 0.06))
            if (tile.type === 'port') {
              ambientTileSpritesRef.current.set(key, { sprite, kind: 'port' })
            }
          } else {
            // Flat-color fallback, same silhouette via the mask.
            const base = parseHexColor(TILE_COLOR[tile.type])
            const color =
              base !== null ? shadeColor(base, tileBrightness(x, y, 0.1)) : TILE_COLOR[tile.type]
            fillCell(landDetail, x, y, { color, alpha: 1 })
          }
          // Terrain washes (#404): the same soft-disc trick the shallows wash
          // uses, over land and clipped by landGroup's coastline mask, so large
          // islands break into organic forest/clearing patches instead of one
          // uniform green. Adjacent same-hash cells overlap (radius > cell
          // pitch) and merge with no visible cell boundary. Drawn before the
          // speckles so the flecks sit on top of the forest wash.
          if (tile.type === 'land') {
            const c = centerOf(x, y)
            const hash = tileHash(x, y)
            if (hash > 0.55) {
              landDetail
                .circle(c.x, c.y, TILE * 0.9)
                .fill({ color: FOREST_WASH_COLOR, alpha: 0.25 })
              landDetail
                .circle(c.x, c.y, TILE * 0.55)
                .fill({ color: FOREST_WASH_COLOR, alpha: 0.25 })
            } else if (hash < 0.2) {
              landDetail
                .circle(c.x, c.y, TILE * 0.85)
                .fill({ color: CLEARING_WASH_COLOR, alpha: 0.14 })
            }
          }
          // Terrain speckles (#393): sparse darker flecks so large landmasses
          // read as vegetated ground, not a repeated texture.
          if (tile.type === 'land' && tileHash(x, y) > 0.55) {
            const c = centerOf(x, y)
            const dx = (tileHash(x + 3, y) - 0.5) * TILE * 0.7
            const dy = (tileHash(x, y + 3) - 0.5) * TILE * 0.7
            landDetail
              .circle(c.x + dx, c.y + dy, 1.2 + tileHash(y, x + 1) * 1.4)
              .fill({ color: 0x2f5426, alpha: 0.5 })
          }
        }
      }
      tilePool.end()
      glintPool.end()
      causticPool.end()

      // Movement-range shading (#371): a translucent fill + outline per tile in
      // each of the three overlay sets. Rebuilt every draw, but the draw only
      // runs on a dirty tick (selection/state change), never per idle frame.
      range.clear()
      if (rangeOverlay) {
        const paintRange = (keys: string[], color: string) => {
          for (const k of keys) {
            const [rx, ry] = k.split(',').map(Number) as [number, number]
            fillCell(range, rx, ry, { color, alpha: 0.22 })
            strokeCell(range, rx, ry, { width: 1.5, color, alpha: 0.45 })
          }
        }
        paintRange(rangeOverlay.green, RANGE_ALLY_COLOR)
        paintRange(rangeOverlay.red, RANGE_ENEMY_COLOR)
        paintRange(rangeOverlay.yellow, RANGE_NEUTRAL_COLOR)
      }

      // Explored-but-fogged dimming (#299). The unexplored world needs no fog
      // fills at all anymore — it simply isn't painted into `knownSea`.
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const key = `${x},${y}`
          if (!exploredKeys.has(key)) continue
          if (visibleKeys.has(key)) continue
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
          const edgeAlpha = Math.max(0.14, 0.45 - visibleNeighbors * 0.045)
          fillCell(fog, x, y, { color: FOG_COLOR, alpha: edgeAlpha })
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
        // Grounding shadow (#394) so the sprite reads as an object on the
        // water, not a decal floating over it.
        entities.ellipse(cx, cy + TILE * 0.26, TILE * 0.3, TILE * 0.1).fill({
          color: 0x000000,
          alpha: 0.22,
        })
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
        // Grounding shadow (#394), drawn whether art or fallback renders above.
        entities.ellipse(cx, cy + TILE * 0.3, TILE * 0.42, TILE * 0.13).fill({
          color: 0x000000,
          alpha: 0.28,
        })
        if (texture) {
          const sprite = cityPool.get(city.id)
          sprite.texture = texture
          // Sized up (#394) so a settlement reads as a landmark, not another
          // terrain cell; anchored center like every pooled sprite.
          sprite.width = TILE * 1.05
          sprite.height = TILE * 1.05
          sprite.position.set(cx, cy)
          continue
        }
        // Fallback flat swatch (no city art loaded yet): faction primaryColor (#428) as the
        // base, with an own-city highlight ring on top so own-vs-enemy stays legible even
        // when two factions' colors are close.
        const cityFaction = FACTIONS[factionOf(city.ownerId)]
        entities.rect(cx - (TILE - 12) / 2, cy - (TILE - 12) / 2, TILE - 12, TILE - 12)
        entities.fill(cityFaction?.primaryColor ?? (own ? OWN_CITY : ENEMY_CITY))
        if (own) {
          entities.rect(cx - (TILE - 12) / 2, cy - (TILE - 12) / 2, TILE - 12, TILE - 12)
          entities.stroke({ width: 2, color: HIGHLIGHT_COLOR, alpha: 0.9 })
        }
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
        // Hull shadow on the water (#394); the ambient bob rides above it.
        entities.ellipse(cx, cy + TILE * 0.24, TILE * 0.28, TILE * 0.09).fill({
          color: 0x000000,
          alpha: 0.25,
        })
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
        // Fallback flat circle (no ship art loaded yet): faction primaryColor (#428) as the
        // base, with an own-ship highlight ring on top so own-vs-enemy stays legible even
        // when two factions' colors are close.
        entities.circle(cx, cy, TILE / 2.6)
        entities.fill(faction?.primaryColor ?? (own ? OWN_SHIP : ENEMY_SHIP))
        if (own) {
          entities.circle(cx, cy, TILE / 2.6)
          entities.stroke({ width: 2, color: HIGHLIGHT_COLOR, alpha: 0.9 })
        }
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

      // Landing parties (#465): a flat triangular banner token — the same
      // faction-color fallback vocabulary ships (circle) and cities (square)
      // use, no art needed. Own parties always; enemy only in current vision,
      // exactly like ships.
      for (const party of parties) {
        const key = `${party.position.x},${party.position.y}`
        const own = party.ownerId === viewerId
        if (!own && !visibleKeys.has(key)) continue
        const pc = centerOf(party.position.x, party.position.y)
        entities.ellipse(pc.x, pc.y + TILE * 0.22, TILE * 0.24, TILE * 0.08).fill({
          color: 0x000000,
          alpha: 0.25,
        })
        const r = TILE * 0.3
        const points = [pc.x, pc.y - r, pc.x + r, pc.y + r * 0.8, pc.x - r, pc.y + r * 0.8]
        const partyFaction = FACTIONS[factionOf(party.ownerId)]
        entities.poly(points)
        entities.fill(partyFaction?.primaryColor ?? (own ? OWN_SHIP : ENEMY_SHIP))
        if (own) {
          entities.poly(points)
          entities.stroke({ width: 2, color: HIGHLIGHT_COLOR, alpha: 0.9 })
        }
      }

      pathPreview.clear()
      highlight.clear()
      selectionPulse.clear()
      const selected = selectedCaptainId
        ? captains.find((c) => c.id === selectedCaptainId)
        : undefined
      const selectedParty = selectedPartyId
        ? parties.find((p) => p.id === selectedPartyId)
        : undefined
      hasSelectionRef.current = !!selected || !!selectedParty

      // Dotted course preview (#375): mouse hover wins live, else the keyboard
      // cursor while the map has focus, else a sticky touch tap — see the
      // hoverCellRef/touchPreviewRef doc comment above for why there are three.
      const previewTarget =
        hoverCellRef.current ??
        (hasFocusRef.current ? cursorRef.current : null) ??
        touchPreviewRef.current
      if (
        selected &&
        previewTarget &&
        !coordsEqual(previewTarget, selected.position) &&
        previewTarget.x >= 0 &&
        previewTarget.x < map.width &&
        previewTarget.y >= 0 &&
        previewTarget.y < map.height
      ) {
        const path = findPath(map, selected.position, previewTarget)
        if (path && path.length >= 2) {
          const segments = pathToDotSegments(
            path,
            selected.movementPoints,
            selected.maxMovementPoints,
          )
          const boundaries = new Set(
            turnBoundaryIndices(path.length, selected.movementPoints, selected.maxMovementPoints),
          )
          for (const seg of segments) {
            const tile = path[seg.index]!
            const c = centerOf(tile.x, tile.y)
            const color = seg.thisTurn ? COURSE_NOW_COLOR : COURSE_LATER_COLOR
            pathPreview.circle(c.x, c.y, TILE * 0.09).fill({ color, alpha: 0.9 })
            if (boundaries.has(seg.index)) {
              pathPreview.circle(c.x, c.y, TILE * 0.18).stroke({ width: 1.5, color, alpha: 0.9 })
            }
          }
          // Arrowhead (#375): a filled triangle at the destination, pointing
          // along the final leg's direction.
          const lastTile = path[path.length - 1]!
          const prevTile = path[path.length - 2]!
          const tip = centerOf(lastTile.x, lastTile.y)
          const tail = centerOf(prevTile.x, prevTile.y)
          const angle = arrowheadAngle(tail, tip)
          const arrowLen = TILE * 0.4
          const arrowWidth = TILE * 0.28
          const baseX = tip.x - Math.cos(angle) * arrowLen
          const baseY = tip.y - Math.sin(angle) * arrowLen
          const perpX = -Math.sin(angle) * (arrowWidth / 2)
          const perpY = Math.cos(angle) * (arrowWidth / 2)
          const arrowColor = segments[segments.length - 1]!.thisTurn
            ? COURSE_NOW_COLOR
            : COURSE_LATER_COLOR
          pathPreview
            .poly([tip.x, tip.y, baseX + perpX, baseY + perpY, baseX - perpX, baseY - perpY])
            .fill({ color: arrowColor, alpha: 0.95 })
        }
      }

      // Destination flags (#372): every own ship steering a standing sail order
      // flies a small pennant on the tile it's making for; a paused (interrupted)
      // order flies it in the alert color so a halted voyage stands out at a
      // glance. Drawn in the preview layer so it stays legible over fog.
      for (const cap of captains) {
        if (cap.ownerId !== viewerId || !cap.sailOrder) continue
        const dest = cap.sailOrder.destination
        const fc = centerOf(dest.x, dest.y)
        const flagColor = cap.sailOrder.interrupted ? ENEMY_SHIP : COURSE_NOW_COLOR
        const poleTop = fc.y - TILE * 0.42
        pathPreview
          .moveTo(fc.x, fc.y)
          .lineTo(fc.x, poleTop)
          .stroke({ width: 2, color: flagColor, alpha: 0.95 })
        pathPreview
          .poly([
            fc.x,
            poleTop,
            fc.x + TILE * 0.26,
            poleTop + TILE * 0.09,
            fc.x,
            poleTop + TILE * 0.18,
          ])
          .fill({ color: flagColor, alpha: 0.95 })
      }

      if (selected) {
        // Geometry only — the ambient tick below animates this layer's alpha
        // into a pulse (#298) every frame, not just on a dirty redraw.
        strokeCell(selectionPulse, selected.position.x, selected.position.y, {
          width: 3,
          color: HIGHLIGHT_COLOR,
        })
      }
      if (selectedParty) {
        strokeCell(selectionPulse, selectedParty.position.x, selectedParty.position.y, {
          width: 3,
          color: HIGHLIGHT_COLOR,
        })
      }
      // Hover cell outline (#393): with the always-on grid gone, the cell
      // shape appears under the mouse where it's actionable — the painted
      // terrain stays clean everywhere else.
      const hover = hoverCellRef.current
      if (hover && exploredKeys.has(`${hover.x},${hover.y}`)) {
        strokeCell(highlight, hover.x, hover.y, {
          width: 1.5,
          color: HIGHLIGHT_COLOR,
          alpha: 0.4,
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

    // Screen → world px → grid coord under the map's topology (#348), or
    // `null` off-map. Square is the prior floor-divide; hex inverts the
    // pointy-top layout via mapLayout. Shared by tap-to-act (selectTileAt),
    // mouse hover, and touch's course-preview tap (#375).
    function cellAtPoint(screenX: number, screenY: number): Coord | null {
      const map = propsRef.current.map
      const cell = pixelToCell(
        mapTopology(map),
        (screenX - view.x) / view.scale,
        (screenY - view.y) / view.scale,
        TILE,
      )
      if (cell.x < 0 || cell.x >= map.width || cell.y < 0 || cell.y >= map.height) return null
      return cell
    }

    function selectTileAt(screenX: number, screenY: number) {
      const cell = cellAtPoint(screenX, screenY)
      if (cell) propsRef.current.onTileClick(cell.x, cell.y)
    }

    /**
     * Touch's course-preview tap (#375/#372): a tap on an empty, out-of-range
     * water tile sets a sticky preview (mouse gets this live from hover
     * instead); tapping that same tile again confirms the multi-turn course via
     * `onSetCourse`. Taps on anything already handled by #376's any-distance
     * targeting (a captain, city, or active encounter) are left alone — those
     * open their own confirm sheet, which is itself the confirmation step.
     *
     * Returns true if it *consumed* the tap (showed or confirmed a course), so
     * the caller skips the normal `onTileClick` dispatch — that's what keeps the
     * first tap from also committing the sail order the second tap is meant to.
     */
    function updateTouchPreview(cell: Coord | null): boolean {
      const { captains, cities, encounters, selectedCaptainId, map, onSetCourse } = propsRef.current
      const selected = selectedCaptainId
        ? captains.find((c) => c.id === selectedCaptainId)
        : undefined
      const occupied =
        !!cell &&
        (captains.some((c) => c.position.x === cell.x && c.position.y === cell.y) ||
          cities.some((c) => c.position.x === cell.x && c.position.y === cell.y) ||
          encounters.some((e) => e.active && e.position.x === cell.x && e.position.y === cell.y))
      if (!cell || !selected || occupied) {
        touchPreviewRef.current = null
        setTouchPreviewHint(null)
        dirtyRef.current = true
        return false
      }
      const path = findPath(map, selected.position, cell)
      const outOfRange = !!path && path.length - 1 > selected.movementPoints
      const isSecondTap = !!touchPreviewRef.current && coordsEqual(touchPreviewRef.current, cell)
      if (!outOfRange) {
        // In range: a normal one-tap move — let `onTileClick` handle it.
        touchPreviewRef.current = null
        setTouchPreviewHint(null)
        dirtyRef.current = true
        return false
      }
      if (!isSecondTap) {
        touchPreviewRef.current = cell
        setTouchPreviewHint(
          onSetCourse ? 'Course preview — tap again to set course' : 'Out of range this turn',
        )
        dirtyRef.current = true
        return true
      }
      // Second tap on the same out-of-range tile: confirm the course.
      touchPreviewRef.current = null
      setTouchPreviewHint(null)
      dirtyRef.current = true
      onSetCourse?.(cell)
      return true
    }

    function onPointerDown(e: PointerEvent) {
      canvas.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, toCanvasPoint(e))
      moved = false
      // A mouse press (button down to drag/click) supersedes the live hover
      // preview until the button comes back up and hover resumes (#375).
      if (e.pointerType === 'mouse' && hoverCellRef.current) {
        hoverCellRef.current = null
        dirtyRef.current = true
      }
      if (pointers.size === 1) {
        const p = pointers.values().next().value!
        dragStart = { x: p.x, y: p.y, viewX: view.x, viewY: view.y }
      } else {
        dragStart = undefined
        pinchPrevDist = undefined
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!pointers.has(e.pointerId)) {
        // Plain hover (#375): no pointer is down, so this can't be a drag or
        // pinch — mouse only, since touch never fires pointermove without a
        // preceding pointerdown that would already be in `pointers`.
        if (e.pointerType === 'mouse') {
          const p = toCanvasPoint(e)
          const cell = cellAtPoint(p.x, p.y)
          const prev = hoverCellRef.current
          if (prev?.x !== cell?.x || prev?.y !== cell?.y) {
            hoverCellRef.current = cell
            dirtyRef.current = true
          }
        }
        return
      }
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

    function onPointerLeave() {
      if (hoverCellRef.current) {
        hoverCellRef.current = null
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
      if (wasTap && point) {
        // Touch's two-tap course preview consumes the tap when it shows or
        // confirms a course (#375/#372), so the first tap never also dispatches.
        if (e.pointerType === 'touch' && updateTouchPreview(cellAtPoint(point.x, point.y))) return
        selectTileAt(point.x, point.y)
      }
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
      layoutScreenOverlays()
      dirtyRef.current = true
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)
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
      // Slow caustics (#405): drift each blob a few px along a per-tile direction
      // over a ~20s period and oscillate its alpha on a much longer, out-of-sync
      // period than the glints, so the ocean's large-scale light keeps moving at
      // rest. Placement is deterministic; only the wall-clock phase animates.
      for (const [key, { sprite, baseX, baseY }] of causticSpritesRef.current) {
        const [xs, ys] = key.split(',')
        const hash = tileHash(Number(xs), Number(ys))
        const angle = hash * Math.PI * 2
        const drift = Math.sin(t * 0.31 + hash * 6.28) * 4
        sprite.position.set(baseX + Math.cos(angle) * drift, baseY + Math.sin(angle) * drift)
        sprite.alpha = 0.05 * (0.55 + 0.45 * Math.sin(t * 0.17 + hash * 6.28))
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
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
      if (pixiApp.renderer) pixiApp.renderer.off('resize', onResize)
      if (pixiApp.stage) pixiApp.stage.removeChild(world, light, vignette)
      world.destroy({ children: true })
      light.destroy()
      vignette.destroy()
      lightTexture.destroy(true)
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

      {touchPreviewHint && (
        <div className="map-course-hint" role="status">
          {touchPreviewHint}
        </div>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
