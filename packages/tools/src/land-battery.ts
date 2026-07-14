/**
 * Land-conquest sim battery (#475 lineage) — operator entry point.
 *
 * Runs the same deterministic full-content AI-vs-AI battery as
 * `apps/web/src/landConquest.test.ts` (which guards regression floors in CI)
 * but as a standalone report: per-size capture/pacing metrics for tuning
 * sessions and map-scaling work, without editing the test.
 *
 * Run from the repo root with:
 *
 *     pnpm --filter @aop/tools exec tsx src/land-battery.ts [sizes] [seeds] [maxRounds]
 *
 * e.g. `... src/land-battery.ts small,medium 24 30` (the defaults) reproduces
 * the CI battery; `... src/land-battery.ts xlarge 8 40` probes a size/cap. The
 * pseudo-size `authored` runs the fixed STARTING_MAP_HEX board instead of a
 * generated one — the same wiring as `conquestReachable.test.ts`.
 */

import {
  AI_DIFFICULTIES,
  AI_PERSONALITIES,
  AI_TUNING,
  BUILDINGS,
  CAPTAIN_STAT_TUNING,
  CAPTAIN_XP_THRESHOLDS,
  CITY_DEFENSE_TUNING,
  ENCOUNTERS,
  FACTIONS,
  GAME_SETUP,
  INLAND_SETTLEMENTS,
  ITEM_DROPS,
  ITEMS,
  LAND_ENCOUNTERS,
  LAND_SITES,
  RECRUIT_REPLENISH_INTERVAL,
  RESOURCE_NODES,
  SHIP_CLASSES,
  SKILLS,
  STARTING_MAP_HEX,
  combatStatsData,
} from '@aop/content'
import {
  applyAction,
  createGame,
  currentPlayer,
  nextAiAction,
  type ContentCatalog,
  type GameConfig,
  type MapDefinition,
} from '@aop/engine'
import { FACTION_IDS, type FactionId, type MapSize } from '@aop/shared'

/** Same assembly as the client/edge `buildCatalog` (apps/web/src/catalog.ts). */
function buildCatalog(): ContentCatalog {
  return {
    buildings: BUILDINGS,
    units: Object.fromEntries(
      Object.values(FACTIONS).flatMap((faction) =>
        faction.units.map((unit) => [
          unit.id,
          {
            factionId: faction.id,
            tier: unit.tier,
            goldCost: unit.goldCost,
            weeklyGrowth: unit.weeklyGrowth,
            attack: unit.attack,
            defense: unit.defense,
            health: unit.health,
          },
        ]),
      ),
    ),
    ships: Object.fromEntries(
      SHIP_CLASSES.map((ship) => [
        ship.id,
        {
          hull: ship.hull,
          cannons: ship.cannons,
          speed: ship.speed,
          crewCapacity: ship.crewCapacity,
          upgrades: ship.upgrades,
        },
      ]),
    ),
    skills: Object.fromEntries(
      Object.values(SKILLS).map((skill) => [
        skill.id,
        {
          factionId: skill.factionId,
          tier: skill.tier,
          attackBonusPct: skill.attackBonusPct,
          defenseBonusPct: skill.defenseBonusPct,
        },
      ]),
    ),
    captainXpThresholds: [...CAPTAIN_XP_THRESHOLDS],
    encounters: ENCOUNTERS,
    resourceNodes: Object.fromEntries(
      Object.values(RESOURCE_NODES).map((node) => [node.id, { yield: node.yield }]),
    ),
    cityDefense: {
      militiaPerType: CITY_DEFENSE_TUNING.militiaPerType,
      turretCount: CITY_DEFENSE_TUNING.turretCount,
      neutralRosterFactionId: CITY_DEFENSE_TUNING.neutralRosterFactionId,
    },
    recruitReplenishInterval: RECRUIT_REPLENISH_INTERVAL,
    landSites: {
      sites: Object.fromEntries(
        Object.values(LAND_SITES.sites).map((s) => [
          s.id,
          { mode: s.mode, yield: s.yield, weight: s.weight },
        ]),
      ),
      spawnDensity: LAND_SITES.spawnDensity,
      minStartDistance: LAND_SITES.minStartDistance,
    },
    landEncounters: {
      nativeVillage: LAND_ENCOUNTERS.nativeVillage,
      hermit: LAND_ENCOUNTERS.hermit,
      banditCamp: LAND_ENCOUNTERS.banditCamp,
      spawnDensity: LAND_ENCOUNTERS.spawnDensity,
      minStartDistance: LAND_ENCOUNTERS.minStartDistance,
    },
    inlandSettlements: {
      density: INLAND_SETTLEMENTS.density,
      buildings: [...INLAND_SETTLEMENTS.buildings],
      minStartDistance: INLAND_SETTLEMENTS.minStartDistance,
    },
    captainStats: {
      attackPerPoint: CAPTAIN_STAT_TUNING.attackPerPoint,
      defensePerPoint: CAPTAIN_STAT_TUNING.defensePerPoint,
      speedMovementPerPoint: CAPTAIN_STAT_TUNING.speedMovementPerPoint,
    },
    items: {
      defs: Object.fromEntries(
        Object.values(ITEMS).map((item) => [
          item.id,
          {
            stats: {
              attack: item.statBonuses.attack ?? 0,
              defense: item.statBonuses.defense ?? 0,
              speed: item.statBonuses.speed ?? 0,
            },
            weight: item.weight,
          },
        ]),
      ),
      captainItemCap: ITEM_DROPS.captainItemCap,
      seaEncounterDropChance: ITEM_DROPS.seaEncounterDropChance,
      landHaulDropChance: ITEM_DROPS.landHaulDropChance,
      landEncounterDropChance: ITEM_DROPS.landEncounterDropChance,
    },
  }
}

function starterTroops(faction: FactionId) {
  return [{ unitId: FACTIONS[faction].units[0]!.id, count: 6 }]
}

/** `authored` = the fixed STARTING_MAP_HEX board (conquestReachable.test.ts wiring). */
type BatterySize = MapSize | 'authored'

function matchConfig(seed: number, size: BatterySize, a: FactionId, b: FactionId): GameConfig {
  return {
    seed,
    mapSize: size === 'authored' ? 'small' : size,
    ...(size === 'authored' ? { mapDefinition: STARTING_MAP_HEX as MapDefinition } : {}),
    setup: GAME_SETUP,
    combatStats: combatStatsData(),
    content: buildCatalog(),
    aiTuning: AI_TUNING,
    aiPersonalities: AI_PERSONALITIES,
    aiDifficulties: AI_DIFFICULTIES,
    players: [
      {
        id: 'p1',
        name: a,
        faction: a,
        isAI: true,
        startingTroops: starterTroops(a),
        aiProfile: { personality: 'opportunist', difficulty: 'normal' },
      },
      {
        id: 'p2',
        name: b,
        faction: b,
        isAI: true,
        startingTroops: starterTroops(b),
        aiProfile: { personality: 'opportunist', difficulty: 'normal' },
      },
    ],
  }
}

interface LandOutcome {
  captures: number
  capturesByParty: number
  partyLosses: number
  seaRepelled: number
  disembarks: number
  /** City flips of player capitals (vs neutral inland settlements). */
  capitalCaptures: number
  /** Round of the first city flip, or null if the match saw none. */
  firstCaptureRound: number | null
  /** Most assaults by one (attacker, city) pair — the multi-wave-siege signal (#471). */
  bestSameCityAssaults: number
}

function runMatch(config: GameConfig, maxRounds: number): LandOutcome {
  let state = createGame(config)
  const outcome: LandOutcome = {
    captures: 0,
    capturesByParty: 0,
    partyLosses: 0,
    seaRepelled: 0,
    disembarks: 0,
    capitalCaptures: 0,
    firstCaptureRound: null,
    bestSameCityAssaults: 0,
  }
  const assaultsPerTarget = new Map<string, number>()
  let safety = 0
  const safetyCap = maxRounds * state.players.length + 10
  while (state.status === 'active' && state.round <= maxRounds && safety++ < safetyCap) {
    const pid = currentPlayer(state).id
    let guard = 0
    while (state.status === 'active' && currentPlayer(state).id === pid && guard++ < 600) {
      const action = nextAiAction(state, pid)
      const before = state.cities.map((c) => c.ownerId)
      const capturedBefore = state.captains.filter((c) => c.captured).length
      const partiesBefore = state.parties.length
      state = applyAction(state, action)
      if (action.type === 'disembark') outcome.disembarks++
      if (action.type === 'attackCity' || action.type === 'partyAssaultCity') {
        const key = `${action.playerId}:${action.targetCityId}`
        const waves = (assaultsPerTarget.get(key) ?? 0) + 1
        assaultsPerTarget.set(key, waves)
        if (waves > outcome.bestSameCityAssaults) outcome.bestSameCityAssaults = waves
      }
      if (action.type === 'attackCity') {
        if (state.captains.filter((c) => c.captured).length > capturedBefore) outcome.seaRepelled++
      }
      if (action.type === 'partyAssaultCity' && state.parties.length < partiesBefore) {
        outcome.partyLosses++
      }
      const after = state.cities.map((c) => c.ownerId)
      let flipped = false
      let capitalFlipped = false
      for (let i = 0; i < after.length; i++) {
        if (before[i] === after[i]) continue
        flipped = true
        if (state.cities[i]!.id.endsWith('-capital')) capitalFlipped = true
      }
      if (flipped) {
        outcome.captures++
        outcome.firstCaptureRound ??= state.round
        if (capitalFlipped) outcome.capitalCaptures++
        if (action.type === 'partyAssaultCity') outcome.capturesByParty++
      }
      if (action.type === 'endTurn') break
    }
  }
  return outcome
}

const sizes = (process.argv[2] ?? 'small,medium').split(',') as BatterySize[]
const seedCount = Number(process.argv[3] ?? 24)
const maxRounds = Number(process.argv[4] ?? 30)

for (const size of sizes) {
  const outcomes: LandOutcome[] = []
  const started = Date.now()
  for (let seed = 1; seed <= seedCount; seed++) {
    const a = FACTION_IDS[seed % FACTION_IDS.length]!
    const b = FACTION_IDS[(seed + 1) % FACTION_IDS.length]!
    outcomes.push(runMatch(matchConfig(seed, size, a, b), maxRounds))
    outcomes.push(runMatch(matchConfig(seed, size, b, a), maxRounds))
  }
  const ms = Date.now() - started
  const sum = (f: (o: LandOutcome) => number) => outcomes.reduce((s, o) => s + f(o), 0)
  const firstRounds = outcomes
    .map((o) => o.firstCaptureRound)
    .filter((r): r is number => r !== null)
  const avgFirst =
    firstRounds.length > 0
      ? (firstRounds.reduce((s, r) => s + r, 0) / firstRounds.length).toFixed(1)
      : 'n/a'
  console.log(
    `${size.padEnd(8)} matches=${outcomes.length} rounds<=${maxRounds} ` +
      `captures=${sum((o) => o.captures)} byParty=${sum((o) => o.capturesByParty)} ` +
      `capitals=${sum((o) => o.capitalCaptures)} partyLosses=${sum((o) => o.partyLosses)} seaRepelled=${sum((o) => o.seaRepelled)} ` +
      `disembarkMatches=${outcomes.filter((o) => o.disembarks > 0).length} ` +
      `multiWaveMatches=${outcomes.filter((o) => o.bestSameCityAssaults >= 2).length} ` +
      `avgFirstCaptureRound=${avgFirst} wallClock=${(ms / 1000).toFixed(1)}s`,
  )
}
