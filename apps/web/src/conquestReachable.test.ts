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
 * #471 is the next follow-up. #462 lifted conquest but left a residual limit: no
 * attacker ever assaulted the same city twice (`bestSameCityAssaults == 1` across all
 * 96 matches, even at a 40-round cap), so the "war of attrition" — grind one garrison
 * down over several waves until it falls — never actually happened. The root cause was
 * a scoring gap, not offensive logistics: a loaded captain's attrition approach
 * (`combatMult` 0.5) scored below the economy verbs, so it lingered at sea instead of
 * pressing a reachable siege. `AI_TUNING.siegeStickinessBonus` adds a ratio-scaled
 * bonus that makes a loaded captain commit to the softest reachable enemy city (and
 * decays for free as that garrison rebuilds), so successive waves converge on one
 * target with no cross-turn planner memory.
 *
 * Measured on this battery (25-round cap; CAP=40 is identical — conquest saturates
 * by round 25), on the PRE-quadrupling 24x24 authored map with no land:
 *   baseline            captures  3 / 96, repelled  0, maxSameCityAssaults 1
 *   +capacity only      captures  4 / 96, repelled  0, maxSameCityAssaults 1
 *   +attrition (#462)   captures 13 / 96, repelled 16, maxSameCityAssaults 1
 *   +siege bonus (#471) captures 77 / 96, repelled 52, maxSameCityAssaults 2, 27 matches multi-wave
 * i.e. sustaining the siege is what finally makes ground-down cities fall — and it is
 * *more* cost-effective, not less: repelled-per-capture drops from 1.23 to 0.68, so the
 * extra captains spent convert into conquest rather than feeding the turrets.
 *
 * RE-PINNED for the 4x-area map quadrupling (operator directive, 2026-07-14).
 * The authored map is now 48x48 and each capital sits on a real radius-3
 * island (see @aop/content maps/startingMap.ts), so the land-assault vector —
 * structurally impossible on the old zero-land map (D-039) — is live HERE
 * too, and this battery now guards it: every match disembarks a landing
 * party, and parties finish a material share of the captures. Island spacing
 * was swept on this very battery (numbers in startingMap.ts's doc comment):
 * naive 2x-scaled corner spacing killed conquest outright (0 assaults of any
 * kind — flagships duel mid-sea while garrisons outgrow the attrition floor),
 * so the islands flank the centre at the measured spacing instead. Current
 * measured totals (25-round cap, flat-stats era #498/#506): captures 69/96
 * (24 by landing party), repelled sea assaults 18, party-only losses 181,
 * 72/96 matches multi-wave, 96/96 matches disembark.
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
  /** Captures whose flipping action was a land-side party assault (post-quadrupling). */
  capturesByParty: number
  /** Assaults the attacker lost — its captain was captured (the attrition-wave signal). */
  repelledAssaults: number
  /** Landing parties put ashore — the land vector firing at all. */
  disembarks: number
  /**
   * The most times any single (attacker, city) pair was assaulted in the match —
   * the multi-wave-siege signal (#471), counting BOTH assault vectors (sea
   * `attackCity` and land `partyAssaultCity`; both are real battles — the
   * reducer rejects invalid ones), so `>= 2` means the AI delivered a second
   * wave onto a city it had already assaulted, sustaining the siege rather
   * than taking a one-off shot.
   */
  bestSameCityAssaults: number
}

/** Drive a full AI-vs-AI match to the round cap. */
function runMatch(config: GameConfig, maxRounds: number): MatchOutcome {
  let state = createGame(config)
  let captures = 0
  let capturesByParty = 0
  let repelledAssaults = 0
  let disembarks = 0
  const assaultsPerTarget = new Map<string, number>()
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
      if (action.type === 'disembark') disembarks++
      if (action.type === 'attackCity' || action.type === 'partyAssaultCity') {
        const key = `${action.playerId}:${action.targetCityId}`
        assaultsPerTarget.set(key, (assaultsPerTarget.get(key) ?? 0) + 1)
      }
      if (action.type === 'attackCity') {
        // A repelled sea assault captures the attacking captain (the cost of an
        // attrition wave); a won assault does not.
        if (state.captains.filter((c) => c.captured).length > capturedBefore) repelledAssaults++
      }
      const after = state.cities.map((c) => c.ownerId)
      for (let i = 0; i < after.length; i++) {
        if (before[i] !== after[i]) {
          captures++
          if (action.type === 'partyAssaultCity') capturesByParty++
        }
      }
      if (action.type === 'endTurn') break
    }
  }
  return {
    captures,
    capturesByParty,
    repelledAssaults,
    disembarks,
    bestSameCityAssaults: Math.max(0, ...assaultsPerTarget.values()),
  }
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

describe('conquest reachability in full-content AI-vs-AI matches (#453/#462/#471)', () => {
  const outcomes = battery().map((config) => runMatch(config, 25))
  const totalCaptures = outcomes.reduce((sum, o) => sum + o.captures, 0)
  const totalByParty = outcomes.reduce((sum, o) => sum + o.capturesByParty, 0)
  const totalRepelled = outcomes.reduce((sum, o) => sum + o.repelledAssaults, 0)
  const maxSameCityAssaults = Math.max(...outcomes.map((o) => o.bestSameCityAssaults))
  const matchesWithMultiWave = outcomes.filter((o) => o.bestSameCityAssaults >= 2).length
  const matchesWithDisembark = outcomes.filter((o) => o.disembarks > 0).length

  it('conquest is materially more common than #461’s 3/96 baseline', () => {
    // #462 landed 13/96; #471's siege-commitment bonus took the pre-quadrupling
    // map to 77/96, and the quadrupled land-bearing layout measures 69/96.
    // Assert a floor well above 13 with headroom for future balance nudges, so
    // a regression back toward "conquest barely happens" fails here.
    expect(totalCaptures).toBeGreaterThanOrEqual(40)
  })

  it('the AI launches attrition assaults it does not win (#462)', () => {
    // Impossible under the old absolute engage gate (it only assaulted when it
    // reliably won, so the baseline repelled-count was 0). A non-zero count is
    // the fingerprint of the attrition floor: the AI now spends captains to thin
    // garrisons it cannot yet beat outright. Observed 18 post-quadrupling (the
    // captain-preserving land vector absorbs most attrition waves now).
    expect(totalRepelled).toBeGreaterThanOrEqual(1)
  })

  it('sustains multi-wave sieges on a single city (#471)', () => {
    // #462's residual limit: no attacker ever assaulted the same city twice —
    // a loaded captain's attrition approach scored below the economy verbs, so it
    // never delivered a follow-up wave. The siege-commitment bonus fixes that,
    // and post-quadrupling the waves are mostly landing parties: observed 72/96
    // matches sustain a second wave on one target. Assert the war-of-attrition
    // arc the design envisioned actually occurs.
    expect(maxSameCityAssaults).toBeGreaterThanOrEqual(2)
    expect(matchesWithMultiWave).toBeGreaterThanOrEqual(5)
  })

  it('the land vector is live on the authored map — parties land and take cities (D-039 fixed)', () => {
    // On the pre-quadrupling zero-land map every one of these was structurally
    // pinned to 0. Observed post-quadrupling: 96/96 matches disembark, parties
    // finish 24 of the 69 captures. Assert broad floors so the authored map
    // regressing to a conquest-inert or sea-only board fails here.
    expect(matchesWithDisembark).toBeGreaterThanOrEqual(50)
    expect(totalByParty).toBeGreaterThanOrEqual(5)
  })

  it('is deterministic — a match yields the identical outcome on every run', () => {
    const config = matchConfig(9, 'french', 'pirates')
    expect(JSON.stringify(runMatch(config, 25))).toBe(JSON.stringify(runMatch(config, 25)))
  })
})
