import type { GridTopology, TileType } from '@aop/engine'
import { tileAutotileId, tileContentId } from './mapSprites'

/** Render-only semantic zoom bands. Camera scale changes presentation, never visibility. */
export type PresentationBand = 'overview' | 'tactical' | 'detail'

/**
 * The approved 0.40x and 1.50x transitions expressed as on-screen pixels for
 * MapCanvas's 32 px tile. The dead zones are deliberately asymmetric by
 * direction: a band must cross the far edge before it changes back.
 */
export const PRESENTATION_THRESHOLDS = {
  overviewToTacticalPx: 12.8,
  tacticalToDetailPx: 48,
  overviewHysteresisPx: 1.6,
  detailHysteresisPx: 3.2,
} as const

export interface PresentationLayers {
  terrainTiles: boolean
  terrainDecals: 'none' | 'sparse' | 'rich'
  fullEntityArt: boolean
  rangeAndRoutes: boolean
  waterGlints: boolean
  waterCaustics: boolean
  layeredSurf: boolean
}

export const PRESENTATION_LAYERS: Readonly<Record<PresentationBand, PresentationLayers>> = {
  overview: {
    terrainTiles: false,
    terrainDecals: 'none',
    fullEntityArt: false,
    rangeAndRoutes: false,
    waterGlints: false,
    waterCaustics: false,
    layeredSurf: false,
  },
  tactical: {
    terrainTiles: true,
    terrainDecals: 'sparse',
    fullEntityArt: true,
    rangeAndRoutes: true,
    waterGlints: true,
    waterCaustics: false,
    layeredSurf: true,
  },
  detail: {
    terrainTiles: true,
    terrainDecals: 'rich',
    fullEntityArt: true,
    rangeAndRoutes: true,
    waterGlints: true,
    waterCaustics: true,
    layeredSurf: true,
  },
}

/** Real bidirectional hysteresis: previous band owns its dead zone. */
export function presentationBand(
  onScreenTilePx: number,
  previous?: PresentationBand,
): PresentationBand {
  const px = Number.isFinite(onScreenTilePx) ? Math.max(0, onScreenTilePx) : 0
  const {
    overviewToTacticalPx: overviewCut,
    tacticalToDetailPx: detailCut,
    overviewHysteresisPx: overviewSlop,
    detailHysteresisPx: detailSlop,
  } = PRESENTATION_THRESHOLDS

  if (!previous) {
    if (px < overviewCut) return 'overview'
    if (px < detailCut) return 'tactical'
    return 'detail'
  }

  if (previous === 'overview') {
    if (px < overviewCut + overviewSlop) return 'overview'
    return px >= detailCut + detailSlop ? 'detail' : 'tactical'
  }
  if (previous === 'detail') {
    if (px > detailCut - detailSlop) return 'detail'
    return px <= overviewCut - overviewSlop ? 'overview' : 'tactical'
  }
  if (px <= overviewCut - overviewSlop) return 'overview'
  if (px >= detailCut + detailSlop) return 'detail'
  return 'tactical'
}

/** FNV-1a plus an integer avalanche; pure across engines and process lifetimes. */
export function stableCoordinateHash(x: number, y: number, content = ''): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= x | 0
  hash = Math.imul(hash, 0x9e3779b1)
  hash ^= y | 0
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

export function stableCoordinateUnit(x: number, y: number, content = ''): number {
  return stableCoordinateHash(x, y, content) / 0x1_0000_0000
}

export function stableCoordinateVariant(
  x: number,
  y: number,
  variants: number,
  content = '',
): number {
  if (!Number.isInteger(variants) || variants <= 0) {
    throw new Error(`variants must be a positive integer, got ${variants}`)
  }
  return stableCoordinateHash(x, y, content) % variants
}

export const TERRAIN_ART = {
  landBases: [
    '/art/world-map-v2/terrain/land-base-a.webp',
    '/art/world-map-v2/terrain/land-base-b.webp',
    '/art/world-map-v2/terrain/land-base-c.webp',
  ],
  forestDecals: [
    '/art/world-map-v2/terrain/forest-a.webp',
    '/art/world-map-v2/terrain/forest-b.webp',
  ],
  clearingDecal: '/art/world-map-v2/terrain/clearing.webp',
  highlandDecal: '/art/world-map-v2/terrain/highland.webp',
  portOverlays: [
    '/art/world-map-v2/terrain/port-straight.webp',
    '/art/world-map-v2/terrain/port-l.webp',
  ],
} as const

export type TerrainDecal =
  | { kind: 'forest'; variant: 0 | 1 }
  | { kind: 'clearing'; variant: 0 }
  | { kind: 'highland'; variant: 0 }

export type TerrainNeighborKind = 'land' | 'water' | 'unknown' | 'map-edge'

export interface TerrainNeighbor {
  index: number
  direction: string
  x: number
  y: number
  kind: TerrainNeighborKind
}

export interface TerrainNeighborClassification {
  neighbors: TerrainNeighbor[]
  water: TerrainNeighbor[]
  land: TerrainNeighbor[]
  unknown: TerrainNeighbor[]
  mapEdges: TerrainNeighbor[]
  shoreAdjacent: boolean
  preferredWater: TerrainNeighbor | null
}

interface PresentationMap {
  width: number
  height: number
  topology?: GridTopology | undefined
  tiles: readonly { type: TileType }[]
}

export interface TerrainKnowledge {
  isKnown?: ((x: number, y: number) => boolean) | undefined
}

const SQUARE_DIRECTIONS = [
  ['n', 0, -1],
  ['ne', 1, -1],
  ['e', 1, 0],
  ['se', 1, 1],
  ['s', 0, 1],
  ['sw', -1, 1],
  ['w', -1, 0],
  ['nw', -1, -1],
] as const

const HEX_EVEN_DIRECTIONS = [
  ['e', 1, 0],
  ['ne', 0, -1],
  ['nw', -1, -1],
  ['w', -1, 0],
  ['sw', -1, 1],
  ['se', 0, 1],
] as const

const HEX_ODD_DIRECTIONS = [
  ['e', 1, 0],
  ['ne', 1, -1],
  ['nw', 0, -1],
  ['w', -1, 0],
  ['sw', 0, 1],
  ['se', 1, 1],
] as const

export function topologyNeighbors(topology: GridTopology, x: number, y: number): TerrainNeighbor[] {
  const directions =
    topology === 'square'
      ? SQUARE_DIRECTIONS
      : y % 2 === 0
        ? HEX_EVEN_DIRECTIONS
        : HEX_ODD_DIRECTIONS
  return directions.map(([direction, dx, dy], index) => ({
    index,
    direction,
    x: x + dx,
    y: y + dy,
    kind: 'map-edge',
  }))
}

function isWater(type: TileType): boolean {
  return type === 'deep' || type === 'shallows'
}

/** Topology-aware presentation neighbors; map edges are never invented water. */
export function classifyTerrainNeighbors(
  map: PresentationMap,
  x: number,
  y: number,
  knowledge: TerrainKnowledge = {},
): TerrainNeighborClassification {
  const topology = map.topology ?? 'square'
  const neighbors = topologyNeighbors(topology, x, y).map((neighbor) => {
    if (neighbor.x < 0 || neighbor.x >= map.width || neighbor.y < 0 || neighbor.y >= map.height) {
      return neighbor
    }
    if (knowledge.isKnown && !knowledge.isKnown(neighbor.x, neighbor.y)) {
      return { ...neighbor, kind: 'unknown' as const }
    }
    const type = map.tiles[neighbor.y * map.width + neighbor.x]!.type
    return { ...neighbor, kind: isWater(type) ? ('water' as const) : ('land' as const) }
  })
  const water = neighbors.filter((neighbor) => neighbor.kind === 'water')
  const land = neighbors.filter((neighbor) => neighbor.kind === 'land')
  const unknown = neighbors.filter((neighbor) => neighbor.kind === 'unknown')
  const mapEdges = neighbors.filter((neighbor) => neighbor.kind === 'map-edge')
  const preferredWater =
    water.length === 0
      ? null
      : water[stableCoordinateVariant(x, y, water.length, `port-water:${topology}`)]!
  return {
    neighbors,
    water,
    land,
    unknown,
    mapEdges,
    shoreAdjacent: water.length > 0,
    preferredWater,
  }
}

export interface TerrainPresentation {
  baseVariant: number
  decal: TerrainDecal | null
  tacticalDecal: boolean
  shoreAdjacent: boolean
  portOverlayVariant: 0 | 1 | null
  portFacing: TerrainNeighbor | null
}

/**
 * Scenic terrain vocabulary selected from coordinates and the visible tile's
 * own content only. Nothing here reads GameState, fogged entities, engine RNG,
 * time, or mutable process state.
 */
export function terrainPresentationAt(
  map: PresentationMap,
  x: number,
  y: number,
  knowledge: TerrainKnowledge = {},
): TerrainPresentation {
  const tile = map.tiles[y * map.width + x]
  if (!tile) throw new Error(`terrain coordinate out of bounds: ${x},${y}`)
  const topology = map.topology ?? 'square'
  const classification = classifyTerrainNeighbors(map, x, y, knowledge)
  const regionX = Math.floor(x / 4)
  const regionY = Math.floor(y / 4)
  const region = stableCoordinateUnit(regionX, regionY, `terrain-region:${topology}`)
  const local = stableCoordinateUnit(x, y, `terrain-decal:${tile.type}:${topology}`)
  const prominence = stableCoordinateUnit(x, y, `terrain-prominence:${topology}`)

  // One parity owns a stable anchor base; the other parity independently picks
  // either companion. Orthogonal neighbors can therefore never repeat, while
  // diagonal/region motifs do not collapse into a visible three-cell cadence.
  const anchor = stableCoordinateVariant(0, 0, 3, `terrain-base-anchor:${topology}`)
  const baseVariant =
    (x + y) % 2 === 0
      ? anchor
      : (anchor + 1 + stableCoordinateVariant(x, y, 2, `terrain-base:${topology}`)) % 3

  let decal: TerrainDecal | null = null
  if (tile.type === 'land' && !classification.shoreAdjacent) {
    if (region < 0.4 && local < 0.76) {
      decal = {
        kind: 'forest',
        variant: stableCoordinateVariant(x, y, 2, `forest:${topology}`) as 0 | 1,
      }
    } else if (region > 0.82 && local < 0.56) {
      decal = { kind: 'highland', variant: 0 }
    } else if (local < 0.12) {
      decal = { kind: 'clearing', variant: 0 }
    }
  }

  return {
    baseVariant,
    decal,
    tacticalDecal: decal !== null && prominence > 0.58,
    shoreAdjacent: classification.shoreAdjacent,
    portOverlayVariant:
      tile.type === 'port'
        ? (stableCoordinateVariant(x, y, 2, `port-overlay:${topology}`) as 0 | 1)
        : null,
    portFacing: tile.type === 'port' ? classification.preferredWater : null,
  }
}

export function terrainDecalUrl(decal: TerrainDecal): string {
  if (decal.kind === 'forest') return TERRAIN_ART.forestDecals[decal.variant]
  if (decal.kind === 'clearing') return TERRAIN_ART.clearingDecal
  return TERRAIN_ART.highlandDecal
}

export type TerrainUrlSource = 'theme-variant' | 'theme-base' | 'default'

export interface TerrainUrlResolution {
  url: string | undefined
  source: TerrainUrlSource
}

/** Theme variant -> theme base -> shipped default, in that exact order. */
export function resolveTerrainSprite(
  spriteUrl: (contentId: string) => string | undefined,
  tileType: 'land' | 'port',
  variant: number,
  defaultUrl: string | undefined,
): TerrainUrlResolution {
  if (variant > 0) {
    const themedVariant = spriteUrl(tileAutotileId(tileType, variant))
    if (themedVariant) return { url: themedVariant, source: 'theme-variant' }
  }
  const themedBase = spriteUrl(tileContentId(tileType))
  if (themedBase) return { url: themedBase, source: 'theme-base' }
  return { url: defaultUrl, source: 'default' }
}

/** Finite preload set; independent of map contents and hidden coordinates. */
export function terrainArtPreloadUrls(
  spriteUrl: (contentId: string) => string | undefined,
): string[] {
  const urls = new Set<string>()
  for (let variant = 0; variant < TERRAIN_ART.landBases.length; variant++) {
    const resolved = resolveTerrainSprite(
      spriteUrl,
      'land',
      variant,
      TERRAIN_ART.landBases[variant],
    )
    if (resolved.url) urls.add(resolved.url)
  }
  // Square has eight directed edges; hex consumes the first six. A theme may
  // provide any subset, with its base still winning over shipped dock overlays.
  for (let variant = 1; variant <= 8; variant++) {
    const resolved = resolveTerrainSprite(spriteUrl, 'port', variant, undefined)
    if (resolved.url) urls.add(resolved.url)
  }
  for (const url of TERRAIN_ART.forestDecals) urls.add(url)
  urls.add(TERRAIN_ART.clearingDecal)
  urls.add(TERRAIN_ART.highlandDecal)
  for (const url of TERRAIN_ART.portOverlays) urls.add(url)
  return [...urls].sort()
}

export type StrategicMarkerFamily = 'city' | 'fleet' | 'party' | 'encounter' | 'site'

export interface MarkerEligibility {
  family: StrategicMarkerFamily
  own?: boolean | undefined
  explored: boolean
  visible: boolean
  active?: boolean | undefined
  unavailable?: boolean | undefined
}

/** Mirrors existing fog truth using booleans already derived for the viewer. */
export function markerEligible(input: MarkerEligibility): boolean {
  if (input.unavailable || input.active === false) return false
  if (input.family === 'city') return input.own === true || input.explored
  if (input.family === 'fleet' || input.family === 'party') {
    return input.own === true || input.visible
  }
  return input.visible
}

const OVERVIEW_MARKER_RULES: Readonly<
  Record<StrategicMarkerFamily, { multiplier: number; min: number; max: number }>
> = {
  city: { multiplier: 1.8, min: 12, max: 18 },
  fleet: { multiplier: 1.5, min: 12, max: 16 },
  party: { multiplier: 1.25, min: 10, max: 14 },
  encounter: { multiplier: 1.1, min: 8, max: 12 },
  site: { multiplier: 1.1, min: 8, max: 12 },
}

/** Bounded screen-pixel marker diameter; hit testing remains tile-coordinate based. */
export function overviewMarkerScreenDiameter(
  family: StrategicMarkerFamily,
  onScreenTilePx: number,
): number {
  const rule = OVERVIEW_MARKER_RULES[family]
  return Math.min(rule.max, Math.max(rule.min, onScreenTilePx * rule.multiplier))
}

export function overviewMarkerWorldDiameter(
  family: StrategicMarkerFamily,
  tileSize: number,
  worldScale: number,
): number {
  if (worldScale <= 0 || !Number.isFinite(worldScale)) {
    throw new Error(`worldScale must be positive, got ${worldScale}`)
  }
  return overviewMarkerScreenDiameter(family, tileSize * worldScale) / worldScale
}
