import { EMPTY_RESOURCES, type Coord } from '@aop/shared'
import { pairsContain, seedAlliances } from './alliances'
import { replenishAvailability } from './economy'
import { spawnEncounters } from './encounters'
import { generateMap, tileIndex, type GameMap } from './map'
import { mapToDefinition } from './mapDefinition'
import { seedRng, type RngState } from './rng'
import { RULES_VERSION } from './rulesVersion'
import type {
  Captain,
  CityState,
  EncounterState,
  GameConfig,
  GameState,
  ResourceNodeState,
} from './types'
import { accumulateExploredTiles } from './visibility'

/** The port tile of a home island — where that seat's capital city sits. */
function portForIsland(map: GameMap, island: number): Coord {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[tileIndex(map, x, y)]!
      if (tile.type === 'port' && tile.island === island) return { x, y }
    }
  }
  throw new Error(`No port found for home island ${island}`)
}

export function createGame(config: GameConfig): GameState {
  if (config.players.length < 2) {
    throw new Error('A game needs at least 2 players')
  }
  if (config.players.length > 8) {
    throw new Error('A game supports at most 8 players')
  }
  const ids = new Set(config.players.map((p) => p.id))
  if (ids.size !== config.players.length) {
    throw new Error('Player ids must be unique')
  }

  const { setup, content } = config
  // An authored map (#62) stands in for generation; `seed` still drives every
  // other RNG draw, so replays stay deterministic either way. Clone
  // defensively so mutating the caller's object can't leak into GameState.
  // #468: `xlarge` (and any future size) may override the flat home-island
  // radius so its islands have meaningfully more interior land, not just a
  // bigger empty-sea canvas. Sizes absent from the override map fall through
  // to the flat radius unchanged, so pre-#468 generation stays byte-identical.
  const homeIslandRadius =
    setup.homeIslandRadiusOverrides?.[config.mapSize] ?? setup.homeIslandRadius
  const map = config.mapDefinition
    ? mapToDefinition(config.mapDefinition)
    : generateMap(
        config.seed,
        config.mapSize,
        config.players.length,
        homeIslandRadius,
        setup.homeIslandRingRadiusFactor,
        config.topology,
      )

  if (map.startPositions.length !== config.players.length) {
    throw new Error(
      `Map has ${map.startPositions.length} start positions but the game has ${config.players.length} players`,
    )
  }

  const captains: Captain[] = config.players.map((p, i) => ({
    id: `cap-${p.id}`,
    ownerId: p.id,
    name: `${p.name}'s Flagship`,
    position: { ...map.startPositions[i]! },
    shipClassId: setup.startingShipClass,
    movementPoints: setup.startingCaptainMovement,
    maxMovementPoints: setup.startingCaptainMovement,
    troops: (p.startingTroops ?? []).map((t) => ({ ...t })),
    xp: 0,
    skills: [],
    shipUpgrades: {},
    captured: false,
  }))

  const cities: CityState[] = config.players.map((p, i): CityState => {
    const base: CityState = {
      id: `${p.id}-capital`,
      ownerId: p.id,
      name: `${p.name}'s Capital`,
      position: portForIsland(map, i),
      buildings: [...setup.startingBuildings],
      builtThisRound: false,
      garrison: {},
      unitAvailability: {},
    }
    // Seed the opening recruit pool for whatever tiers the starting buildings unlock.
    return content
      ? { ...base, unitAvailability: replenishAvailability(base, p.faction, content) }
      : base
  })

  // Scatter random encounters from the seeded RNG (#23), then keep the advanced
  // RNG state so the encounter roll stream is baked into the match deterministically.
  // An authored map (#41 map editor) may instead carry a fixed encounter list —
  // used verbatim, with no RNG draw, so it doesn't disturb the seed's other rolls.
  let rngState: RngState = seedRng(config.seed)
  let encounters: EncounterState[] = []
  const authoredEncounters = config.mapDefinition?.encounters
  if (authoredEncounters && authoredEncounters.length > 0) {
    encounters = authoredEncounters.map((e, i) => ({
      id: `enc-${i}`,
      kind: e.kind,
      position: { ...e.position },
      active: true,
      respawnRound: null,
    }))
  } else if (content?.encounters) {
    const spawned = spawnEncounters(map, content.encounters, rngState, map.startPositions)
    encounters = spawned.encounters
    rngState = spawned.rng
  }

  // Resource nodes (#101) are author-placed only — no procedural fallback —
  // so this simply mirrors the authored-encounters list verbatim, no RNG draw.
  const resourceNodes: ResourceNodeState[] = (config.mapDefinition?.resourceNodes ?? []).map(
    (n, i) => ({
      id: `res-${i}`,
      kind: n.kind,
      position: { ...n.position },
      // Author-assigned default controller (#211); omit when unset so
      // GameState holds no stray optional keys.
      ...(n.ownerSeat !== undefined ? { ownerSeat: n.ownerSeat } : {}),
    }),
  )

  const withoutVision: GameState = {
    // Stamp the current RULES_VERSION regardless of what the caller passed
    // (#213) — it is not caller-settable, only asserted against.
    config: { ...config, rulesVersion: RULES_VERSION },
    map,
    round: 1,
    currentPlayerIndex: 0,
    players: config.players.map((p) => ({
      id: p.id,
      name: p.name,
      faction: p.faction,
      isAI: p.isAI,
      resources: { ...EMPTY_RESOURCES, gold: setup.startingGold },
      eliminated: false,
      reputation: setup.startingReputation,
      // AI behavior (#25) carries into runtime state; omit when unset so
      // GameState holds no stray optional keys.
      ...(p.aiProfile ? { aiProfile: p.aiProfile } : {}),
    })),
    // Alliance graph (#136): seed mutual alliances from same-team players, then
    // it is the source of truth (config.team is never re-read after this).
    alliances: seedAlliances(config.players),
    cities,
    captains,
    parties: [],
    encounters,
    resourceNodes,
    exploredTiles: {},
    rngState,
    actionCount: 0,
    status: 'active',
    winnerId: null,
  }

  return {
    ...withoutVision,
    exploredTiles: Object.fromEntries(
      config.players.map((p) => [p.id, accumulateExploredTiles(withoutVision, p.id)]),
    ),
  }
}

export function captainsOf(state: GameState, playerId: string): Captain[] {
  return state.captains.filter((c) => c.ownerId === playerId)
}

export function currentPlayer(state: GameState) {
  const player = state.players[state.currentPlayerIndex]
  if (!player) throw new Error(`Invalid currentPlayerIndex ${state.currentPlayerIndex}`)
  return player
}

/**
 * Whether two seats are allies (#136): distinct players joined by an active pair
 * in the {@link GameState.alliances} graph. A seat is never allied with itself.
 */
export function areAllied(state: GameState, a: string, b: string): boolean {
  if (a === b) return false
  return pairsContain(state.alliances.pairs, a, b)
}
