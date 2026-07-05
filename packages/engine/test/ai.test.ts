import { describe, expect, it } from 'vitest'
import {
  applyAction,
  captainsOf,
  createGame,
  currentPlayer,
  nextAiAction,
  replay,
  runAiTurn,
  type Action,
  type AiProfile,
  type CombatStatsData,
  type ContentCatalog,
  type GameConfig,
  type GameState,
} from '../src'
import {
  AI_DIFFICULTIES,
  AI_PERSONALITIES,
  AI_TUNING,
  COMBAT_TUNING,
  GAME_SETUP,
  TACTICS_TUNING,
} from './fixtures'

const STATS: CombatStatsData = {
  units: [
    { id: 'grunt', attack: 5, defense: 2, health: 12 },
    { id: 'elite', attack: 12, defense: 8, health: 40 },
  ],
  ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }],
  combat: COMBAT_TUNING,
  tactics: TACTICS_TUNING,
}

function config(p1Troops: number, p2Troops: number, unit = 'grunt'): GameConfig {
  return {
    seed: 3,
    mapSize: 'medium',
    setup: GAME_SETUP,
    players: [
      {
        id: 'p1',
        name: 'P1',
        faction: 'pirates',
        isAI: true,
        startingTroops: [{ unitId: unit, count: p1Troops }],
      },
      {
        id: 'p2',
        name: 'P2',
        faction: 'british',
        isAI: true,
        startingTroops: [{ unitId: unit, count: p2Troops }],
      },
    ],
    combatStats: STATS,
  }
}

function placeAdjacent(state: GameState): GameState {
  const p1 = captainsOf(state, 'p1')[0]!
  const p2 = captainsOf(state, 'p2')[0]!
  const spot = { x: p1.position.x + 1, y: p1.position.y }
  return {
    ...state,
    captains: state.captains.map((c) => (c.id === p2.id ? { ...c, position: spot } : c)),
  }
}

describe('nextAiAction', () => {
  it('is deterministic', () => {
    const state = createGame(config(5, 3))
    expect(nextAiAction(state, 'p1')).toEqual(nextAiAction(state, 'p1'))
  })

  it('attacks an adjacent, beatable enemy', () => {
    const state = placeAdjacent(createGame(config(8, 1)))
    const action = nextAiAction(state, 'p1')
    expect(action.type).toBe('attackCaptain')
  })

  it('advances on a beatable but distant enemy', () => {
    const state = createGame(config(8, 1))
    const action = nextAiAction(state, 'p1')
    expect(action.type).toBe('moveCaptain')
  })

  it('holds (ends turn) rather than charge a stronger enemy', () => {
    const state = createGame(config(1, 8))
    const action = nextAiAction(state, 'p1')
    expect(action.type).toBe('endTurn')
  })

  it('does not attack an adjacent stronger enemy', () => {
    const state = placeAdjacent(createGame(config(1, 8)))
    const action = nextAiAction(state, 'p1')
    expect(action.type).not.toBe('attackCaptain')
  })
})

describe('runAiTurn', () => {
  it('terminates and hands the turn on', () => {
    const state = createGame(config(5, 5))
    const next = runAiTurn(state, 'p1')
    // Either the game ended or it is no longer p1's turn.
    expect(next.status === 'finished' || currentPlayer(next).id !== 'p1').toBe(true)
    expect(next.actionCount).toBeGreaterThan(0)
  })

  it('is deterministic across identical runs', () => {
    const a = runAiTurn(createGame(config(5, 5)), 'p1')
    const b = runAiTurn(createGame(config(5, 5)), 'p1')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

// Server-side AI turns (#133): the Supabase Edge Function drives `nextAiAction`
// one action at a time and appends each to `match_actions` individually, rather
// than storing one opaque "jump" from `runAiTurn`. Replaying that per-action log
// must reproduce the same state the server applied inline — the determinism /
// replay contract every human action already relies on (CLAUDE.md engine
// invariants; docs/MULTIPLAYER.md §5.3). This exercises it end-to-end for a
// genuine multi-action AI turn.
describe('AI turn action log (server-side, #133)', () => {
  /** Mirror the Edge Function's `runAiSeatTurn` loop: collect each action as it is applied. */
  function driveAiTurn(state: GameState, playerId: string): { log: Action[]; final: GameState } {
    const log: Action[] = []
    let current = state
    for (let i = 0; i < 1000; i++) {
      if (current.status !== 'active' || currentPlayer(current).id !== playerId) break
      const action = nextAiAction(current, playerId)
      log.push(action)
      current = applyAction(current, action)
      if (action.type === 'endTurn') break
    }
    return { log, final: current }
  }

  it('replays to the same state the server applied inline, action for action', () => {
    const cfg = withAi(config(6, 3), { p1: { personality: 'aggressive', difficulty: 'normal' } })
    const { log, final } = driveAiTurn(createGame(cfg), 'p1')

    // A real multi-action turn (advance then more), not just a bare endTurn —
    // otherwise the per-action replay claim would be vacuous.
    expect(log.length).toBeGreaterThan(1)
    expect(log[log.length - 1]!.type).toBe('endTurn')

    const replayed = replay(createGame(cfg), log)
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(final))
  })

  it('produces an identical action log on a second identical run (deterministic)', () => {
    const cfg = withAi(config(6, 3), { p1: { personality: 'aggressive', difficulty: 'normal' } })
    const a = driveAiTurn(createGame(cfg), 'p1')
    const b = driveAiTurn(createGame(cfg), 'p1')
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log))
  })
})

// --- Economy AI (#67): construction, recruit-vs-save, garrison/fleet, skills, upgrades ---

const ECON_CATALOG: ContentCatalog = {
  buildings: {
    townhall: { produces: { gold: 100 }, cost: {} },
    barracks: { produces: {}, cost: { gold: 150 }, requires: 'townhall', unlocksTier: 1 },
    distillery: { produces: { rum: 3 }, cost: { gold: 220 }, requires: 'townhall' },
    sawmill: { produces: { timber: 4 }, cost: { gold: 200 }, requires: 'townhall' },
    tradehouse: { produces: { gold: 60 }, cost: { gold: 350, timber: 15 }, requires: 'townhall' },
    shipyard: {
      produces: {},
      cost: { gold: 300 },
      requires: 'townhall',
      unlocksShipyard: true,
    },
  },
  units: {
    deckhand: {
      factionId: 'pirates',
      tier: 1,
      goldCost: 25,
      weeklyGrowth: 8,
      attack: 2,
      defense: 1,
      health: 6,
    },
  },
  ships: {
    sloop: {
      hull: 40,
      cannons: 6,
      speed: 5,
      crewCapacity: 4,
      upgrades: {
        hull: [{ goldCost: 150, amount: 15 }],
        cannons: [{ goldCost: 180, amount: 4 }],
      },
    },
  },
  skills: {
    'pirates-t1': { factionId: 'pirates', tier: 1, attackBonusPct: 10, defenseBonusPct: 0 },
    'pirates-t2': { factionId: 'pirates', tier: 2, attackBonusPct: 5, defenseBonusPct: 20 },
  },
  captainXpThresholds: [0, 150, 400, 800, 1400],
}

/**
 * p1 starts overwhelmingly weaker than p2 (mirrors the "holds" combat test), so
 * no attack/advance candidate ever outscores the economy decision under test.
 */
function econConfig(startingBuildings: string[] = ['townhall']): GameConfig {
  return {
    ...config(1, 999),
    setup: { ...GAME_SETUP, startingBuildings },
    content: ECON_CATALOG,
    aiTuning: AI_TUNING,
  }
}

function homeCity(state: GameState, playerId: string) {
  return state.cities.find((c) => c.ownerId === playerId)!
}

describe('economy AI', () => {
  it('builds the highest-utility affordable building when idle', () => {
    const state = createGame(econConfig())
    const city = homeCity(state, 'p1')
    // shipyard's flat unlock bonus (25) beats barracks' tier unlock (20), which
    // beats distillery/sawmill's raw production (18/16) — tradehouse needs
    // timber the player doesn't have yet, so it is not a candidate at all.
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'construct',
      playerId: 'p1',
      cityId: city.id,
      buildingId: 'shipyard',
    })
  })

  it('recruits the strongest affordable unit once a tier is unlocked', () => {
    let state = createGame(econConfig(['townhall', 'barracks']))
    const city = homeCity(state, 'p1')
    state = {
      ...state,
      cities: state.cities.map((c) =>
        c.id === city.id ? { ...c, builtThisRound: true, unitAvailability: { deckhand: 10 } } : c,
      ),
    }
    // Gold 1000, reserve 150, spend fraction 0.5 -> budget 425 -> floor(425/25)=17,
    // capped at the 10 available.
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'recruit',
      playerId: 'p1',
      cityId: city.id,
      unitId: 'deckhand',
      count: 10,
    })
  })

  it('does not recruit when gold is at or below the reserve', () => {
    let state = createGame(econConfig(['townhall', 'barracks']))
    const city = homeCity(state, 'p1')
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p1' ? { ...p, resources: { ...p.resources, gold: 150 } } : p,
      ),
      cities: state.cities.map((c) =>
        c.id === city.id ? { ...c, builtThisRound: true, unitAvailability: { deckhand: 10 } } : c,
      ),
    }
    expect(nextAiAction(state, 'p1').type).not.toBe('recruit')
  })

  it('loads surplus garrisoned troops onto a docked captain, keeping a defense reserve', () => {
    let state = createGame(econConfig(['townhall', 'barracks']))
    const city = homeCity(state, 'p1')
    const captain = captainsOf(state, 'p1')[0]!
    state = {
      ...state,
      cities: state.cities.map((c) =>
        c.id === city.id ? { ...c, builtThisRound: true, garrison: { deckhand: 10 } } : c,
      ),
      captains: state.captains.map((cap) =>
        cap.id === captain.id ? { ...cap, position: { ...city.position } } : cap,
      ),
    }
    // Sloop capacity 4, 1 grunt already aboard -> 3 room. 30% of 10 garrisoned
    // (3, rounded up) stays behind for defense, leaving room as the binding cap.
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'transferTroops',
      playerId: 'p1',
      cityId: city.id,
      captainId: captain.id,
      direction: 'toShip',
      unitId: 'deckhand',
      count: 3,
    })
  })

  it('spends an available skill pick on the highest combat bonus', () => {
    let state = createGame(econConfig())
    const captain = captainsOf(state, 'p1')[0]!
    state = {
      ...state,
      captains: state.captains.map((c) => (c.id === captain.id ? { ...c, xp: 200 } : c)),
    }
    // Level 2 (xp 200 >= threshold 150) grants one pick; pirates-t2's +25 total
    // bonus beats pirates-t1's +10.
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'chooseCaptainSkill',
      playerId: 'p1',
      captainId: captain.id,
      skillId: 'pirates-t2',
    })
  })

  it('buys the cheapest ship upgrade at a docked shipyard', () => {
    let state = createGame(econConfig(['townhall', 'shipyard']))
    const city = homeCity(state, 'p1')
    const captain = captainsOf(state, 'p1')[0]!
    state = {
      ...state,
      cities: state.cities.map((c) => (c.id === city.id ? { ...c, builtThisRound: true } : c)),
    }
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'upgradeShip',
      playerId: 'p1',
      cityId: city.id,
      captainId: captain.id,
      track: 'hull',
    })
  })

  it('plays combat-only (no economy actions) when no content catalog is configured', () => {
    const state = createGame(config(1, 999))
    expect(nextAiAction(state, 'p1').type).toBe('endTurn')
  })
})

// --- Personalities, difficulty, and alliances (#25) ---

/** Attach an AI profile to p1 (and optionally p2) plus the content tables the profile keys on. */
function withAi(
  base: GameConfig,
  profiles: Partial<Record<'p1' | 'p2', AiProfile>>,
  teams: Partial<Record<'p1' | 'p2', string>> = {},
): GameConfig {
  return {
    ...base,
    players: base.players.map((p) => {
      const id = p.id as 'p1' | 'p2'
      return {
        ...p,
        ...(profiles[id] ? { aiProfile: profiles[id] } : {}),
        ...(teams[id] !== undefined ? { team: teams[id] } : {}),
      }
    }),
    aiPersonalities: AI_PERSONALITIES,
    aiDifficulties: AI_DIFFICULTIES,
  }
}

describe('AI personalities (#25)', () => {
  // Equal troops on identical ships => strength ratio exactly 1.0, which sits
  // between the aggressive engage threshold (below 1) and the economic one (above 1).
  it('an aggressive AI attacks an even-strength adjacent enemy the economic AI declines', () => {
    const aggressive = placeAdjacent(
      createGame(withAi(config(5, 5), { p1: { personality: 'aggressive', difficulty: 'normal' } })),
    )
    expect(nextAiAction(aggressive, 'p1').type).toBe('attackCaptain')

    const economic = placeAdjacent(
      createGame(withAi(config(5, 5), { p1: { personality: 'economic', difficulty: 'normal' } })),
    )
    expect(nextAiAction(economic, 'p1').type).not.toBe('attackCaptain')
  })

  it('an aggressive AI advances on an even-strength distant enemy the economic AI ignores', () => {
    const aggressive = createGame(
      withAi(config(5, 5), { p1: { personality: 'aggressive', difficulty: 'normal' } }),
    )
    expect(nextAiAction(aggressive, 'p1').type).toBe('moveCaptain')

    const economic = createGame(
      withAi(config(5, 5), { p1: { personality: 'economic', difficulty: 'normal' } }),
    )
    expect(nextAiAction(economic, 'p1').type).toBe('endTurn')
  })

  it('an economic AI keeps a larger cash reserve than an aggressive one', () => {
    const decide = (personality: AiProfile['personality']) => {
      let state = createGame(
        withAi(econConfig(['townhall', 'barracks']), {
          p1: { personality, difficulty: 'normal' },
        }),
      )
      const city = homeCity(state, 'p1')
      state = {
        ...state,
        players: state.players.map((p) =>
          p.id === 'p1' ? { ...p, resources: { ...p.resources, gold: 200 } } : p,
        ),
        cities: state.cities.map((c) =>
          c.id === city.id ? { ...c, builtThisRound: true, unitAvailability: { deckhand: 10 } } : c,
        ),
      }
      return nextAiAction(state, 'p1')
    }
    // Gold 200: aggressive reserve is 90 (spends), economic reserve is 240 (holds).
    expect(decide('aggressive').type).toBe('recruit')
    expect(decide('economic').type).not.toBe('recruit')
  })
})

describe('AI difficulty (#25)', () => {
  it('a lower-difficulty AI can take a suboptimal move; a competent one takes the best', () => {
    // Force the blunder so the test is deterministic rather than probabilistic.
    const alwaysBlunder = { ...AI_DIFFICULTIES, easy: { blunderChance: 1, incomeMult: 1 } }
    const cfg = (difficulty: AiProfile['difficulty']): GameConfig => ({
      ...withAi(config(8, 1), { p1: { personality: 'opportunist', difficulty } }),
      aiDifficulties: alwaysBlunder,
    })
    // Best move against a distant, far-weaker enemy is to close in.
    expect(nextAiAction(createGame(cfg('normal')), 'p1').type).toBe('moveCaptain')
    // Blundering, the AI takes its runner-up: ending the turn.
    expect(nextAiAction(createGame(cfg('easy')), 'p1').type).toBe('endTurn')
  })

  it('is deterministic even when blundering', () => {
    const state = createGame(
      withAi(config(5, 3), { p1: { personality: 'opportunist', difficulty: 'easy' } }),
    )
    expect(nextAiAction(state, 'p1')).toEqual(nextAiAction(state, 'p1'))
  })

  it('grants a hard AI a resource bonus but never cheats easy/normal seats', () => {
    const players = config(1, 1).players.map((p) =>
      p.id === 'p1'
        ? { ...p, isAI: false, aiProfile: { personality: 'opportunist', difficulty: 'hard' } }
        : { ...p, isAI: false, aiProfile: { personality: 'opportunist', difficulty: 'normal' } },
    )
    const cfg: GameConfig = {
      ...config(1, 1),
      setup: { ...GAME_SETUP, startingBuildings: ['townhall'] },
      content: ECON_CATALOG,
      aiTuning: AI_TUNING,
      aiDifficulties: AI_DIFFICULTIES,
      players: players as GameConfig['players'],
    }
    // Play one full round so the round-start income lands.
    let state = createGame(cfg)
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' })
    const gold = (id: string) => state.players.find((p) => p.id === id)!.resources.gold
    // townhall income is 100 gold; start is 1000.
    expect(gold('p1')).toBe(1000 + Math.floor(100 * 1.25)) // hard bonus
    expect(gold('p2')).toBe(1000 + 100) // normal, no cheat
  })
})

describe('AI alliance awareness (#25)', () => {
  it('never targets an allied captain', () => {
    const cfg = {
      ...config(8, 1),
      players: config(8, 1).players.map((p) => ({ ...p, team: 'north' })),
    }
    const state = placeAdjacent(createGame(cfg))
    // p2 is an ally, so it is not an enemy and there is nothing to do.
    expect(nextAiAction(state, 'p1').type).toBe('endTurn')
  })

  it('still targets a non-allied captain', () => {
    const state = placeAdjacent(createGame(config(8, 1)))
    expect(nextAiAction(state, 'p1').type).toBe('attackCaptain')
  })
})
