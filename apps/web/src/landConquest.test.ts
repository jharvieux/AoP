import {
  AI_DIFFICULTIES,
  AI_PERSONALITIES,
  AI_TUNING,
  FACTIONS,
  GAME_SETUP,
  combatStatsData,
} from '@aop/content'
import { applyAction, createGame, currentPlayer, nextAiAction, type GameConfig } from '@aop/engine'
import { FACTION_IDS, type FactionId, type MapSize } from '@aop/shared'
import { describe, expect, it } from 'vitest'
import { buildCatalog } from './catalog'

/**
 * Land-conquest behavior (#475). The conquest battery in `conquestReachable.test.ts`
 * runs on the authored `STARTING_MAP_HEX`, whose home "islands" are single port
 * tiles with NO land — so a landing party can never come ashore there and the AI's
 * new party logic is completely inert (that battery's numbers are unchanged by
 * #475, which is the point: no regression on the sea-assault contract).
 *
 * This suite exercises the land vector on *generated* maps instead, whose home
 * islands are radius-2 land discs with the city on a land tile — the geography
 * where a party can land, march, and assault. It drives the same real full-content
 * AI-vs-AI setup across a deterministic 96-match battery and measures how the land
 * vector changes conquest.
 *
 * Measured on this battery (small+medium, 24 seeds × 2 seatings, 30-round cap):
 *   sea-only baseline (land vector off)  captures 89/96, 0 by party, 67 captains
 *                                        captured on failed assaults, 0 disembarks
 *   land vector on (#475)                captures 75/96, 25 by party, 44 captains
 *                                        captured, 62 party (troop-only) losses,
 *                                        56/96 matches disembark
 * The land vector trades ~14 raw captures for a 34% drop in captains captured
 * (67 → 44): the AI now spends cheap landing parties — not its captains — to grind
 * defended cities, and those parties finish a third of all captures. Fewer total
 * city-flips, markedly better captain economy — the honest trade a captain-
 * preserving land player makes. Because the engine is deterministic these counts
 * are exact and reproducible, not flaky statistics.
 */

function starterTroops(faction: FactionId) {
  return [{ unitId: FACTIONS[faction].units[0]!.id, count: 6 }]
}

function matchConfig(seed: number, size: MapSize, a: FactionId, b: FactionId): GameConfig {
  return {
    seed,
    mapSize: size,
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
  /** Captures where the flipping action was a land-side party assault. */
  capturesByParty: number
  /** Party assaults the party lost (destroyed) — the cheap attrition cost. */
  partyLosses: number
  /** Sea assaults the attacker lost — its captain captured (the expensive cost). */
  seaRepelled: number
  disembarks: number
}

function runMatch(config: GameConfig, maxRounds: number): LandOutcome {
  let state = createGame(config)
  let captures = 0
  let capturesByParty = 0
  let partyLosses = 0
  let seaRepelled = 0
  let disembarks = 0
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
      if (action.type === 'disembark') disembarks++
      if (action.type === 'attackCity') {
        if (state.captains.filter((c) => c.captured).length > capturedBefore) seaRepelled++
      }
      if (action.type === 'partyAssaultCity' && state.parties.length < partiesBefore) {
        partyLosses++
      }
      const after = state.cities.map((c) => c.ownerId)
      let flipped = false
      for (let i = 0; i < after.length; i++) if (before[i] !== after[i]) flipped = true
      if (flipped) {
        captures++
        if (action.type === 'partyAssaultCity') capturesByParty++
      }
      if (action.type === 'endTurn') break
    }
  }
  return { captures, capturesByParty, partyLosses, seaRepelled, disembarks }
}

function battery(): GameConfig[] {
  const configs: GameConfig[] = []
  const sizes: MapSize[] = ['small', 'medium']
  for (const size of sizes) {
    for (let seed = 1; seed <= 24; seed++) {
      const a = FACTION_IDS[seed % FACTION_IDS.length]!
      const b = FACTION_IDS[(seed + 1) % FACTION_IDS.length]!
      configs.push(matchConfig(seed, size, a, b))
      configs.push(matchConfig(seed, size, b, a))
    }
  }
  return configs
}

describe('AI land conquest on generated maps (#475)', () => {
  const outcomes = battery().map((config) => runMatch(config, 30))
  const totalCaptures = outcomes.reduce((s, o) => s + o.captures, 0)
  const capturesByParty = outcomes.reduce((s, o) => s + o.capturesByParty, 0)
  const partyLosses = outcomes.reduce((s, o) => s + o.partyLosses, 0)
  const matchesWithDisembark = outcomes.filter((o) => o.disembarks > 0).length

  it('conquest stays common with the land vector active', () => {
    // Sea assaults still carry most captures; the land vector must not tank
    // conquest. Observed 75/96 on this branch — assert a floor with headroom.
    expect(totalCaptures).toBeGreaterThanOrEqual(40)
  })

  it('landing parties participate materially in captures (#475)', () => {
    // The AI never emitted a party action before #475. Observed: parties take
    // 25 of the 96 battery's captured cities. Assert a floor well above zero so
    // a regression back to "AI ignores parties" fails here.
    expect(capturesByParty).toBeGreaterThanOrEqual(8)
  })

  it('spends parties, not captains, on failed attrition waves (#475)', () => {
    // The whole point of the land vector: a repelled land assault destroys only
    // the party. A non-zero party-loss count is the fingerprint that the AI is
    // grinding cities with expendable parties instead of feeding captains to the
    // turrets. Observed 62.
    expect(partyLosses).toBeGreaterThanOrEqual(1)
  })

  it('uses the land approach across many matches', () => {
    // Observed 56/96 matches see at least one disembark. Assert a broad floor.
    expect(matchesWithDisembark).toBeGreaterThanOrEqual(15)
  })

  it('is deterministic — a match yields the identical outcome on every run', () => {
    const config = matchConfig(9, 'medium', 'french', 'pirates')
    expect(JSON.stringify(runMatch(config, 30))).toBe(JSON.stringify(runMatch(config, 30)))
  })
})
