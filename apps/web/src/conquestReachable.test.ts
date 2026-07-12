import {
  AI_DIFFICULTIES,
  AI_PERSONALITIES,
  AI_TUNING,
  FACTIONS,
  GAME_SETUP,
  STARTING_MAP_HEX,
  combatStatsData,
} from '@aop/content'
import {
  applyAction,
  createGame,
  currentPlayer,
  nextAiAction,
  type GameConfig,
  type MapDefinition,
} from '@aop/engine'
import { FACTION_IDS, type FactionId } from '@aop/shared'
import { describe, expect, it } from 'vitest'
import { buildCatalog } from './catalog'

/**
 * Conquest reachability (#453). #453 found that with the real @aop/content
 * catalog and AI tuning, full-economy AI-vs-AI matches never captured a single
 * city across 48+ matches: the defender garrison grew without bound while a
 * landing party was capped by crew capacity, so the honest engage-ratio gate
 * correctly refused every hopeless assault. The operator's fix was two balance
 * levers — recruit pools replenish every 5 rounds instead of every round
 * (`RECRUIT_REPLENISH_INTERVAL`) and every ship's troop capacity ×5 (SHIP_CLASSES
 * `crewCapacity`) — which widen the early window in which a maxed landing party
 * can out-mass a still-growing garrison.
 *
 * This suite is the regression guard on that outcome: it drives real
 * full-content AI-vs-AI matches (the exact wiring the #453 investigation used —
 * `buildCatalog` + `combatStatsData` + the AI tuning tables) and asserts that at
 * least one AI city changes hands across a deterministic seed battery. Before
 * #453 this count was zero (conquest was structurally impossible); if a future
 * balance change pushes it back to zero, this fails. Because the engine is
 * deterministic, the count is exact and reproducible — not a flaky statistic.
 */

function starterTroops(faction: FactionId) {
  return [{ unitId: FACTIONS[faction].units[0]!.id, count: 6 }]
}

function matchConfig(seed: number, a: FactionId, b: FactionId): GameConfig {
  return {
    seed,
    mapSize: 'small',
    mapDefinition: STARTING_MAP_HEX as MapDefinition,
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

/** Drive a full AI-vs-AI match to the round cap, returning how many times a city changed owner. */
function cityCaptures(config: GameConfig, maxRounds: number): number {
  let state = createGame(config)
  let captures = 0
  let safety = 0
  const safetyCap = maxRounds * state.players.length + 10
  while (state.status === 'active' && state.round <= maxRounds && safety++ < safetyCap) {
    const pid = currentPlayer(state).id
    let guard = 0
    while (state.status === 'active' && currentPlayer(state).id === pid && guard++ < 400) {
      const action = nextAiAction(state, pid)
      const before = state.cities.map((c) => c.ownerId)
      state = applyAction(state, action)
      const after = state.cities.map((c) => c.ownerId)
      for (let i = 0; i < after.length; i++) if (before[i] !== after[i]) captures++
      if (action.type === 'endTurn') break
    }
  }
  return captures
}

// A deterministic battery: each seed pairs two adjacent factions, played in both
// seatings so no result rides on seat order. Capped at 25 rounds — every capture
// #453's harness observed lands by round ~17, in the early window the levers open.
function battery(): GameConfig[] {
  const configs: GameConfig[] = []
  for (let seed = 1; seed <= 12; seed++) {
    const a = FACTION_IDS[seed % FACTION_IDS.length]!
    const b = FACTION_IDS[(seed + 1) % FACTION_IDS.length]!
    configs.push(matchConfig(seed, a, b))
    configs.push(matchConfig(seed, b, a))
  }
  return configs
}

describe('conquest reachability in full-content AI-vs-AI matches (#453)', () => {
  it('at least one AI city is captured across the deterministic seed battery', () => {
    const total = battery().reduce((sum, config) => sum + cityCaptures(config, 25), 0)
    expect(total).toBeGreaterThanOrEqual(1)
  })

  it('is deterministic — a match yields the identical capture count on every run', () => {
    const config = matchConfig(9, 'french', 'pirates')
    expect(cityCaptures(config, 25)).toBe(cityCaptures(config, 25))
  })
})
