import type { Coord, FactionId, MapSize, ResourcePool } from '@aop/shared'
import type { AiTuning } from './ai'
import type { BoardOrder } from './battleBoard'
import type { CombatStatsData } from './combat'
import type { ContentCatalog } from './content'
import type { TileType } from './map'
import type { StandingOrder } from './tactics'
import type { GameSetup, GameState, GameStatus, TroopStack } from './types'
import { tileKey, visibleTilesWithAllies } from './visibility'

/**
 * Fog-of-war player view — the anti-cheat boundary (docs/MULTIPLAYER.md §7).
 *
 * In multiplayer, clients NEVER receive a `GameState`; the `get-player-view`
 * Edge Function returns a `PlayerView` produced by {@link playerView}. The type
 * is deliberately structurally distinct from `GameState` (no `rngState`, no
 * `config.seed`, `rules` instead of `config`) so engine code that needs the
 * authoritative truth — `applyAction`, `createGame`, `replay` — cannot be handed
 * a view by accident: passing a `PlayerView` where a `GameState` is expected is a
 * compile error.
 *
 * Everything stripped here is stripped for a reason spelled out in §7 / §11:
 *
 * - `rngState` and `config.seed` — either one lets a client predict every future
 *   combat roll and encounter outcome, so neither ever leaves the server.
 * - Enemy captains/cities/encounters outside the viewer's current vision.
 * - Enemy city interiors (buildings/garrison/recruit pools) and treasuries.
 * - Enemy captains' standing orders, movement, XP, skills and ship upgrades —
 *   knowing a defender's standing orders would break interactive attacks (§7).
 *   A captain's OWN standing/board orders are not hidden information to its
 *   own owner, though — they are write-only *from the client* only because
 *   the view never echoed them back (#285); this filter now discloses a
 *   captain's current orders on its own row, so a client can seed its order
 *   presets from what is actually saved instead of always starting blank.
 *
 * Allied seats (#137) extend only the viewer's *current vision*: their live
 * sightlines are unioned in, so the viewer sees the tiles and units (as bare
 * hulls) their allies see. An ally's treasury, city interiors, and captain
 * manifests/orders/XP stay stripped exactly as an enemy's would — an alliance
 * shares eyes, never books. The union is live: on {@link areAllied} turning
 * false (a broken alliance) those sightlines vanish on the next view.
 */
export interface PlayerView {
  /** The seat identity this view was rendered for (engine player id, e.g. `seat-0`). */
  viewerId: string
  round: number
  currentPlayerIndex: number
  status: GameStatus
  winnerId: string | null
  /**
   * Balance data the client legitimately needs for local optimistic play and
   * odds previews (§9). Identical for every seat and already shipped in the
   * client bundle — but note `config.seed` and `config.mapDefinition` are
   * deliberately absent: the seed is the origin of `rngState`.
   */
  rules: ViewRules
  /** Map extent, so the client can size its grid without seeing unexplored terrain. */
  mapWidth: number
  mapHeight: number
  /** Only tiles this seat has ever explored; unexplored tiles are omitted entirely. */
  tiles: ViewTile[]
  players: ViewPlayer[]
  cities: ViewCity[]
  captains: ViewCaptain[]
  encounters: ViewEncounter[]
  /**
   * The viewer's own alliance relationships (#136/#137). Only the viewer's
   * pairs and proposals are disclosed — a third-party alliance between two other
   * seats never appears here, so the graph doesn't leak who else has allied.
   */
  alliances: ViewAlliances
  /**
   * Always `null`. Present so the shape stays obviously distinct from
   * `GameState`, and as a guard against a view being fed back in as truth.
   */
  rngState: null
}

/** The viewer's alliance state, viewer-scoped (see {@link PlayerView.alliances}). */
export interface ViewAlliances {
  /** Seats currently allied with the viewer. */
  allies: string[]
  /** Seats the viewer has proposed to, still awaiting their acceptance. */
  outgoingProposals: string[]
  /** Seats that have proposed to the viewer, awaiting the viewer's acceptance. */
  incomingProposals: string[]
}

export interface ViewRules {
  setup: GameSetup
  mapSize: MapSize
  combatStats?: CombatStatsData
  content?: ContentCatalog
  aiTuning?: AiTuning
}

export interface ViewTile {
  coord: Coord
  type: TileType
  island: number
  /** True if within current vision this instant; false if only remembered (explored). */
  visible: boolean
}

/** An enemy is identity-only (name + faction are public from the lobby); own row carries the treasury. */
export interface ViewPlayer {
  id: string
  name: string
  faction: FactionId
  isAI: boolean
  eliminated: boolean
  /**
   * Diplomatic standing (#138) — public for every seat, like name and faction:
   * an oathbreaker's mark is common knowledge, and clients need it to know
   * whether a proposal to (or from) a seat can succeed at all.
   */
  reputation: number
  /** Present only on the viewer's own row. */
  resources?: ResourcePool
}

export interface ViewCity {
  id: string
  ownerId: string
  name: string
  position: Coord
  /** Interiors — present only for the viewer's own cities (§7: enemy interiors never). */
  buildings?: string[]
  garrison?: Record<string, number>
  unitAvailability?: Record<string, number>
  builtThisRound?: boolean
}

export interface ViewCaptain {
  id: string
  ownerId: string
  name: string
  position: Coord
  shipClassId: string
  /** Own-captain detail only; an enemy captain in vision reveals nothing below. */
  troops?: TroopStack[]
  movementPoints?: number
  maxMovementPoints?: number
  xp?: number
  skills?: string[]
  shipUpgrades?: Record<string, number>
  /**
   * The owner's own saved defence plan (#285) — never present on an enemy
   * row (see the class doc). Absent, not `[]`, when the captain has never
   * set any, so a client can tell "no orders saved" apart from "saved an
   * empty plan" if that distinction ever matters.
   */
  standingOrders?: StandingOrder[]
  /** The owner's own saved board doctrine (#285); same absent-vs-empty rule as {@link standingOrders}. */
  boardOrders?: BoardOrder[]
}

export interface ViewEncounter {
  id: string
  kind: string
  position: Coord
  active: boolean
}

/**
 * Project `state` down to what the seat `viewerId` is permitted to see. Pure
 * function of `GameState` — the single filter used by `get-player-view` and, by
 * the same call, live spectating (§12). Must never read anything outside `state`.
 */
export function playerView(state: GameState, viewerId: string): PlayerView {
  const visibleKeys = new Set(visibleTilesWithAllies(state, viewerId).map(tileKey))
  const exploredKeys = new Set(state.exploredTiles[viewerId] ?? [])
  for (const key of visibleKeys) exploredKeys.add(key)

  const tiles: ViewTile[] = []
  for (const key of exploredKeys) {
    const [x, y] = key.split(',').map(Number) as [number, number]
    const tile = state.map.tiles[y * state.map.width + x]
    if (!tile) continue
    tiles.push({
      coord: { x, y },
      type: tile.type,
      island: tile.island,
      visible: visibleKeys.has(key),
    })
  }

  const players: ViewPlayer[] = state.players.map((p) =>
    p.id === viewerId
      ? {
          id: p.id,
          name: p.name,
          faction: p.faction,
          isAI: p.isAI,
          eliminated: p.eliminated,
          reputation: p.reputation,
          resources: p.resources,
        }
      : {
          id: p.id,
          name: p.name,
          faction: p.faction,
          isAI: p.isAI,
          eliminated: p.eliminated,
          reputation: p.reputation,
        },
  )

  const cities: ViewCity[] = []
  for (const c of state.cities) {
    if (c.ownerId === viewerId) {
      cities.push({
        id: c.id,
        ownerId: c.ownerId,
        name: c.name,
        position: c.position,
        buildings: c.buildings,
        garrison: c.garrison,
        unitAvailability: c.unitAvailability,
        builtThisRound: c.builtThisRound,
      })
    } else if (exploredKeys.has(tileKey(c.position))) {
      // An enemy city is a static structure: revealed once its tile is explored,
      // but the interior (buildings/garrison/recruits) is never disclosed.
      cities.push({ id: c.id, ownerId: c.ownerId, name: c.name, position: c.position })
    }
  }

  const captains: ViewCaptain[] = []
  for (const cap of state.captains) {
    if (cap.ownerId === viewerId) {
      captains.push({
        id: cap.id,
        ownerId: cap.ownerId,
        name: cap.name,
        position: cap.position,
        shipClassId: cap.shipClassId,
        troops: cap.troops,
        movementPoints: cap.movementPoints,
        maxMovementPoints: cap.maxMovementPoints,
        xp: cap.xp,
        skills: cap.skills,
        shipUpgrades: cap.shipUpgrades,
        ...(cap.standingOrders ? { standingOrders: cap.standingOrders } : {}),
        ...(cap.boardOrders ? { boardOrders: cap.boardOrders } : {}),
      })
    } else if (visibleKeys.has(tileKey(cap.position))) {
      // Enemy captain in current vision: you see a hull of a known class at a
      // location — nothing about its manifest, orders, XP or upgrades.
      captains.push({
        id: cap.id,
        ownerId: cap.ownerId,
        name: cap.name,
        position: cap.position,
        shipClassId: cap.shipClassId,
      })
    }
  }

  const encounters: ViewEncounter[] = state.encounters
    .filter((e) => e.active && visibleKeys.has(tileKey(e.position)))
    .map((e) => ({ id: e.id, kind: e.kind, position: e.position, active: e.active }))

  // Viewer-scoped alliance state: only pairs and proposals that touch the viewer
  // (never a third-party alliance between two other seats).
  const alliances: ViewAlliances = {
    allies: state.alliances.pairs
      .filter((p) => p.a === viewerId || p.b === viewerId)
      .map((p) => (p.a === viewerId ? p.b : p.a)),
    outgoingProposals: state.alliances.proposals
      .filter((p) => p.from === viewerId)
      .map((p) => p.to),
    incomingProposals: state.alliances.proposals
      .filter((p) => p.to === viewerId)
      .map((p) => p.from),
  }

  const rules: ViewRules = {
    setup: state.config.setup,
    mapSize: state.config.mapSize,
  }
  if (state.config.combatStats) rules.combatStats = state.config.combatStats
  if (state.config.content) rules.content = state.config.content
  if (state.config.aiTuning) rules.aiTuning = state.config.aiTuning

  return {
    viewerId,
    round: state.round,
    currentPlayerIndex: state.currentPlayerIndex,
    status: state.status,
    winnerId: state.winnerId,
    rules,
    mapWidth: state.map.width,
    mapHeight: state.map.height,
    tiles,
    players,
    cities,
    captains,
    encounters,
    alliances,
    rngState: null,
  }
}
