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
 * Conquest reachability (#453/#462). #453 found that with the real @aop/content
 * catalog and AI tuning, full-economy AI-vs-AI matches almost never captured a
 * city: the defender garrison grew without bound while a landing party was capped
 * by crew capacity, so the honest engage-ratio gate correctly refused every
 * hopeless assault. #461 added two economy levers (recruit pools replenish every 5
 * rounds; ×5 crew capacity) and moved conquest from 0 → rare (3 captures across a
 * 96-match battery). #462 is the follow-up: the operator's answer was *attrition
 * warfare*. A failed assault permanently thins a city's recruited garrison (the
 * militia/turrets are free and don't persist), and that damage carries between
 * assaults because pools replenish slowly — so an assault the AI can't win outright
 * is still worth launching if it meaningfully depletes the defenders. #462 taught
 * the planner to value that (see `AI_TUNING.attritionMinRatio`) and rebased the ship
 * capacities.
 *
 * This suite is the regression guard on that outcome. It drives real full-content
 * AI-vs-AI matches across a deterministic 96-match battery (the exact wiring #453's
 * investigation used) and asserts (a) conquest is materially more common than #461's
 * 3/96 baseline, and (b) the AI now launches assaults it does NOT win — the attrition
 * behavior, which was structurally impossible under the old absolute engage gate
 * (baseline: 0 repelled assaults). Because the engine is deterministic, the counts
 * are exact and reproducible, not flaky statistics.
 *
 * Measured on this battery (`main` @ #461 vs this branch, 25-round cap):
 *   baseline           captures  3 / 96, assaults  3, repelled  0
 *   +capacity only     captures  4 / 96, assaults  4, repelled  0
 *   +attrition (#462)  captures 13 / 96, assaults 29, repelled 16
 * i.e. the capacity bump alone barely moved the needle; teaching the AI to fight a
 * war of attrition is what lifted conquest (4.3× over baseline). Same-city multi-wave
 * sieges remain rare (the AI seldom sails a second loaded captain back to one
 * target — an offensive-logistics limit tracked separately, not a scoring bug).
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

interface MatchOutcome {
  /** Times a city changed owner. */
  captures: number
  /** Assaults the attacker lost — its captain was captured (the attrition-wave signal). */
  repelledAssaults: number
}

/** Drive a full AI-vs-AI match to the round cap. */
function runMatch(config: GameConfig, maxRounds: number): MatchOutcome {
  let state = createGame(config)
  let captures = 0
  let repelledAssaults = 0
  let safety = 0
  const safetyCap = maxRounds * state.players.length + 10
  while (state.status === 'active' && state.round <= maxRounds && safety++ < safetyCap) {
    const pid = currentPlayer(state).id
    let guard = 0
    while (state.status === 'active' && currentPlayer(state).id === pid && guard++ < 400) {
      const action = nextAiAction(state, pid)
      const before = state.cities.map((c) => c.ownerId)
      const capturedBefore = state.captains.filter((c) => c.captured).length
      state = applyAction(state, action)
      if (action.type === 'attackCity') {
        // A repelled assault captures the attacking captain (the cost of an
        // attrition wave); a won assault does not.
        if (state.captains.filter((c) => c.captured).length > capturedBefore) repelledAssaults++
      }
      const after = state.cities.map((c) => c.ownerId)
      for (let i = 0; i < after.length; i++) if (before[i] !== after[i]) captures++
      if (action.type === 'endTurn') break
    }
  }
  return { captures, repelledAssaults }
}

// A deterministic battery: 48 seeds, each pairing two adjacent factions, played in
// both seatings so no result rides on seat order — 96 matches. Capped at 25 rounds;
// every capture #453's harness observed lands by round ~17, in the early window the
// levers open, and the attrition count is already saturated by then.
function battery(): GameConfig[] {
  const configs: GameConfig[] = []
  for (let seed = 1; seed <= 48; seed++) {
    const a = FACTION_IDS[seed % FACTION_IDS.length]!
    const b = FACTION_IDS[(seed + 1) % FACTION_IDS.length]!
    configs.push(matchConfig(seed, a, b))
    configs.push(matchConfig(seed, b, a))
  }
  return configs
}

describe('conquest reachability in full-content AI-vs-AI matches (#453/#462)', () => {
  const outcomes = battery().map((config) => runMatch(config, 25))
  const totalCaptures = outcomes.reduce((sum, o) => sum + o.captures, 0)
  const totalRepelled = outcomes.reduce((sum, o) => sum + o.repelledAssaults, 0)

  it('conquest is materially more common than #461’s 3/96 baseline', () => {
    // Observed 13/96 on this branch; assert a floor comfortably above the 3/96
    // baseline with headroom for future balance nudges, so a regression back
    // toward "conquest barely happens" fails here.
    expect(totalCaptures).toBeGreaterThanOrEqual(8)
  })

  it('the AI launches attrition assaults it does not win (#462)', () => {
    // Impossible under the old absolute engage gate (it only assaulted when it
    // reliably won, so the baseline repelled-count was 0). A non-zero count is
    // the fingerprint of the attrition floor: the AI now spends captains to thin
    // garrisons it cannot yet beat outright.
    expect(totalRepelled).toBeGreaterThanOrEqual(1)
  })

  it('is deterministic — a match yields the identical outcome on every run', () => {
    const config = matchConfig(9, 'french', 'pirates')
    expect(JSON.stringify(runMatch(config, 25))).toBe(JSON.stringify(runMatch(config, 25)))
  })
})
