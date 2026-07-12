import type { Coord, FactionId, MapSize, ResourcePool } from '@aop/shared'
import type { AiTuning } from './ai'
import type { BoardOrder } from './battleBoard'
import type { BattleReport, CombatStatsData } from './combat'
import type { ContentCatalog } from './content'
import type { GridTopology, TileType } from './map'
import type { StandingOrder } from './tactics'
import type { GameSetup, GameState, GameStatus, MarchOrder, SailOrder, TroopStack } from './types'
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
  /**
   * Grid topology (#348/#379), so the client reconstructs `GameMap` with the
   * right adjacency/distance model. Absent means `square` — matching
   * `GameMap.topology`'s own default and keeping old snapshots valid. Public
   * information (the lobby already picked it); no fog concern.
   */
  topology?: GridTopology
  /** Only tiles this seat has ever explored; unexplored tiles are omitted entirely. */
  tiles: ViewTile[]
  players: ViewPlayer[]
  cities: ViewCity[]
  captains: ViewCaptain[]
  /** Landing parties (#465), filtered exactly like captains: own always, enemy only in current vision. */
  parties: ViewParty[]
  encounters: ViewEncounter[]
  /** Land resource sites (#466) in current vision, with their claim marker. */
  landSites: ViewLandSite[]
  /** Land random encounters (#466) in current vision, filtered like sea encounters. */
  landEncounters: ViewEncounter[]
  /**
   * The viewer's own alliance relationships (#136/#137). Only the viewer's
   * pairs and proposals are disclosed — a third-party alliance between two other
   * seats never appears here, so the graph doesn't leak who else has allied.
   */
  alliances: ViewAlliances
  /**
   * Recent resolved battles (#320) visible to this seat (player, or spectator of
   * the match). Allows live-spectate and replay to show "View Battle" affordances
   * for battles that occurred between polls/snapshots. Server populates this from
   * `match_battle_log` or equivalent; client-facing only. Spectators see all battles
   * in the match; players see battles their captain participated in or battles visible
   * to them (if their standing allows viewing battle reports for others).
   */
  recentBattles?: ViewBattleRecord[]
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

/**
 * Recent battle record for spectate/playback (#320). Carried in {@link PlayerView}
 * so the client knows which battles have resolved since the last poll and can
 * display "View Battle" affordances for them (in ReplayScreen or live SpectateScreen).
 *
 * The `report` contains the full structured battle outcome (captains, damage, tactics
 * used, board log if applicable). The server sources this from `match_battle_log` or
 * replayed `BattleReport` attached to the matched `attackCaptain` action in the match log.
 */
export interface ViewBattleRecord {
  /** The action sequence number in `match_actions` this battle resolved at. */
  seq: number
  /** Attacker's captain id. */
  attackerCaptainId: string
  /** Defender's captain id. */
  defenderCaptainId: string
  /** The battle report (outcome summary, round-by-round detail, board log if applicable). */
  report: BattleReport
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
   * The viewer's own pre-committed doctrine for this captain (#285): write-only
   * from a client until now, so a returning client's presets (`CityScreen`'s
   * standing/board-orders panels) started from a blank slate every time even
   * when orders were already saved server-side. Own-seat disclosure only —
   * an enemy's orders stay stripped exactly as before (§7: knowing a
   * defender's standing orders would break interactive attacks).
   */
  standingOrders?: StandingOrder[]
  boardOrders?: BoardOrder[]
  /**
   * The captain's standing multi-turn sail order (#372), if any — own-seat
   * disclosure only, so a returning multiplayer client can draw its own ships'
   * destination flags and the paused-order banner. Never present on an enemy
   * captain: a rival's queued course is exactly the kind of intent §7 hides.
   */
  sailOrder?: SailOrder
  /**
   * Captured status (#309) is public information — unlike troops/XP/orders
   * above, this is disclosed for both own and enemy captains once in vision,
   * so every seat can see who is holding whom.
   */
  captured: boolean
  /** The seat currently holding this captain captive. Present only while `captured`. */
  capturedBy?: string
  /** Round at/after which the owner may rehire this captive (#309). Present only while `captured`. */
  captivityReturnRound?: number
}

/**
 * A landing party (#465) in a player view. Follows the ship rule (§7): an
 * enemy party in current vision is a sighting — identity and location only —
 * while the manifest (troops, movement) is own-seat disclosure.
 */
export interface ViewParty {
  id: string
  ownerId: string
  name: string
  position: Coord
  /** Own-party detail only; an enemy party in vision reveals nothing below. */
  troops?: TroopStack[]
  movementPoints?: number
  maxMovementPoints?: number
  /**
   * The party's standing march order (#482), if any — own-seat disclosure
   * only, like a captain's {@link ViewCaptain.sailOrder}: a rival's queued
   * route is exactly the kind of intent §7 hides.
   */
  marchOrder?: MarchOrder
}

export interface ViewEncounter {
  id: string
  kind: string
  position: Coord
  active: boolean
}

/** A land resource site (#466) in a player view — public terrain plus its current claim. */
export interface ViewLandSite {
  id: string
  kind: string
  position: Coord
  active: boolean
  /** The seat currently holding a hold site; absent when unclaimed or a spent haul site. */
  claimedBy?: string
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
    // Captured status (#309) is public — disclosed for own and enemy captains
    // alike, unlike the rest of an enemy captain's manifest.
    const capturedFields: Pick<ViewCaptain, 'captured' | 'capturedBy' | 'captivityReturnRound'> = {
      captured: cap.captured,
      ...(cap.capturedBy !== undefined ? { capturedBy: cap.capturedBy } : {}),
      ...(cap.captivityReturnRound !== undefined
        ? { captivityReturnRound: cap.captivityReturnRound }
        : {}),
    }
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
        ...(cap.sailOrder ? { sailOrder: cap.sailOrder } : {}),
        ...capturedFields,
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
        ...capturedFields,
      })
    }
  }

  const parties: ViewParty[] = []
  for (const party of state.parties) {
    if (party.ownerId === viewerId) {
      parties.push({
        id: party.id,
        ownerId: party.ownerId,
        name: party.name,
        position: party.position,
        troops: party.troops,
        movementPoints: party.movementPoints,
        maxMovementPoints: party.maxMovementPoints,
        ...(party.marchOrder ? { marchOrder: party.marchOrder } : {}),
      })
    } else if (visibleKeys.has(tileKey(party.position))) {
      // Enemy party in current vision: a force sighted ashore at a location —
      // nothing about its manifest or remaining movement.
      parties.push({
        id: party.id,
        ownerId: party.ownerId,
        name: party.name,
        position: party.position,
      })
    }
  }

  const encounters: ViewEncounter[] = state.encounters
    .filter((e) => e.active && visibleKeys.has(tileKey(e.position)))
    .map((e) => ({ id: e.id, kind: e.kind, position: e.position, active: e.active }))

  // Land content (#466): sites (active, in vision) carry their claim marker;
  // land encounters filter exactly like sea encounters.
  const landSites: ViewLandSite[] = state.landSites
    .filter((s) => s.active && visibleKeys.has(tileKey(s.position)))
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      position: s.position,
      active: s.active,
      ...(s.claimedBy !== undefined ? { claimedBy: s.claimedBy } : {}),
    }))
  const landEncounters: ViewEncounter[] = state.landEncounters
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
    ...(state.map.topology ? { topology: state.map.topology } : {}),
    tiles,
    players,
    cities,
    captains,
    parties,
    encounters,
    landSites,
    landEncounters,
    alliances,
    rngState: null,
  }
}
