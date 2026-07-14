import { describe, expect, it } from 'vitest'
import {
  applyAction,
  availableSkillPicks,
  availableStatPoints,
  captainsOf,
  captainToCombatant,
  createGame,
  InvalidActionError,
  playerView,
  replay,
  type Action,
  type CaptainStat,
  type ContentCatalog,
  type GameConfig,
  type GameState,
} from '../src'
import { GAME_SETUP } from './fixtures'

/**
 * Captain stat points (#498): one point per level above 1, earned IN ADDITION
 * to the skill pick, spent via `chooseCaptainStat`. The pending count is
 * derived (`level − 1 − pointsSpent`) — no pending-choice state — and every
 * per-point effect (attack/defense percentage, speed movement) is content
 * data, never an engine constant. All of it must replay bit-exact.
 */

const CATALOG: ContentCatalog = {
  buildings: {},
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
  ships: { sloop: { hull: 40, cannons: 6, speed: 5, crewCapacity: 8, upgrades: {} } },
  skills: {
    'pirates-gunnery-1': { factionId: 'pirates', tier: 1, attackBonusPct: 10, defenseBonusPct: 0 },
  },
  captainXpThresholds: [0, 100, 250, 500],
  captainStats: { attackPctPerPoint: 2, defensePctPerPoint: 2, speedMovementPerPoint: 1 },
}

function testConfig(): GameConfig {
  return {
    seed: 42,
    mapSize: 'medium',
    setup: GAME_SETUP,
    content: CATALOG,
    players: [
      { id: 'p1', name: 'One', faction: 'pirates', isAI: false },
      { id: 'p2', name: 'Two', faction: 'british', isAI: false },
    ],
  }
}

/** The base state with p1's captain granted `xp` and pre-spent `stats`. */
function stateWithXp(
  xp: number,
  stats = { attack: 0, defense: 0, speed: 0 },
  items: string[] = [],
): GameState {
  const state = createGame(testConfig())
  return {
    ...state,
    captains: state.captains.map((c) =>
      c.ownerId === 'p1' ? { ...c, xp, stats: { ...stats }, items: [...items] } : c,
    ),
  }
}

function spend(state: GameState, stat: CaptainStat): GameState {
  const cap = captainsOf(state, 'p1')[0]!
  return applyAction(state, { type: 'chooseCaptainStat', playerId: 'p1', captainId: cap.id, stat })
}

describe('stat-point accrual (#498)', () => {
  it('starts every captain at zero stats with zero points pending', () => {
    const state = createGame(testConfig())
    const cap = captainsOf(state, 'p1')[0]!
    expect(cap.stats).toEqual({ attack: 0, defense: 0, speed: 0 })
    expect(availableStatPoints(cap, CATALOG.captainXpThresholds)).toBe(0)
  })

  it('derives pending points as level − 1 − pointsSpent', () => {
    // 250 xp = level 3 on the test thresholds → 2 points, one already spent.
    const cap = captainsOf(stateWithXp(250, { attack: 1, defense: 0, speed: 0 }), 'p1')[0]!
    expect(availableStatPoints(cap, CATALOG.captainXpThresholds)).toBe(1)
  })

  it('earns stat points IN ADDITION to skill picks — one of each per level', () => {
    const cap = captainsOf(stateWithXp(100), 'p1')[0]!
    expect(availableSkillPicks(cap, CATALOG.captainXpThresholds)).toBe(1)
    expect(availableStatPoints(cap, CATALOG.captainXpThresholds)).toBe(1)
  })
})

describe('chooseCaptainStat action (#498)', () => {
  it('spends a point on the named stat', () => {
    const next = spend(stateWithXp(100), 'attack')
    expect(captainsOf(next, 'p1')[0]!.stats).toEqual({ attack: 1, defense: 0, speed: 0 })
  })

  it('rejects spending past the earned allowance', () => {
    const once = spend(stateWithXp(100), 'speed')
    expect(() => spend(once, 'speed')).toThrow(/no stat points/)
  })

  it('rejects an unknown stat name from the log', () => {
    const state = stateWithXp(100)
    const cap = captainsOf(state, 'p1')[0]!
    expect(() =>
      applyAction(state, {
        type: 'chooseCaptainStat',
        playerId: 'p1',
        captainId: cap.id,
        stat: 'charisma' as CaptainStat,
      }),
    ).toThrow(/Unknown captain stat/)
  })

  it("rejects spending on another player's captain", () => {
    const state = stateWithXp(100)
    const enemy = captainsOf(state, 'p2')[0]!
    expect(() =>
      applyAction(state, {
        type: 'chooseCaptainStat',
        playerId: 'p1',
        captainId: enemy.id,
        stat: 'attack',
      }),
    ).toThrow(InvalidActionError)
  })

  it('rejects when the catalog carries no stat tuning', () => {
    const { captainStats: _drop, ...noStats } = CATALOG
    const base = stateWithXp(100)
    const state: GameState = {
      ...base,
      config: { ...base.config, content: noStats as ContentCatalog },
    }
    expect(() => spend(state, 'attack')).toThrow(/No captain-stat tuning/)
  })
})

describe('stat-point effects (#498)', () => {
  it('folds attack/defense points into the combat-bonus channel at the content rate', () => {
    const cap = captainsOf(stateWithXp(500, { attack: 2, defense: 1, speed: 0 }), 'p1')[0]!
    const combatant = captainToCombatant(cap, CATALOG)
    expect(combatant.attackBonusPct).toBe(4)
    expect(combatant.defenseBonusPct).toBe(2)
  })

  it('stacks with skill bonuses on the same channel', () => {
    const base = stateWithXp(500, { attack: 1, defense: 0, speed: 0 })
    const state: GameState = {
      ...base,
      captains: base.captains.map((c) =>
        c.ownerId === 'p1' ? { ...c, skills: ['pirates-gunnery-1'] } : c,
      ),
    }
    const combatant = captainToCombatant(captainsOf(state, 'p1')[0]!, CATALOG)
    expect(combatant.attackBonusPct).toBe(12)
  })

  it('adds speed points to the movement allowance at refresh', () => {
    let state = stateWithXp(500, { attack: 0, defense: 0, speed: 2 })
    state = applyAction(state, { type: 'endTurn', playerId: 'p1' })
    state = applyAction(state, { type: 'endTurn', playerId: 'p2' })
    expect(captainsOf(state, 'p1')[0]!.movementPoints).toBe(GAME_SETUP.startingCaptainMovement + 2)
    // The other seat spent no speed points: plain refresh, unchanged.
    expect(captainsOf(state, 'p2')[0]!.movementPoints).toBe(GAME_SETUP.startingCaptainMovement)
  })
})

describe('fog of war and replay (#498)', () => {
  it('disclosed stats to the owner only', () => {
    const state = stateWithXp(250, { attack: 1, defense: 0, speed: 0 })
    const ownCap = captainsOf(state, 'p1')[0]!
    // Park the enemy beside p1's captain so it is inside p2's vision.
    const seen: GameState = {
      ...state,
      captains: state.captains.map((c) =>
        c.ownerId === 'p2' ? { ...c, position: { ...ownCap.position } } : c,
      ),
    }
    const own = playerView(seen, 'p1').captains.find((c) => c.id === ownCap.id)!
    expect(own.stats).toEqual({ attack: 1, defense: 0, speed: 0 })
    const enemyView = playerView(seen, 'p2').captains.find((c) => c.id === ownCap.id)!
    expect(enemyView.stats).toBeUndefined()
  })

  it('replays a chooseCaptainStat log to an identical state', () => {
    const base = stateWithXp(250)
    const cap = captainsOf(base, 'p1')[0]!
    const log: Action[] = [
      { type: 'chooseCaptainStat', playerId: 'p1', captainId: cap.id, stat: 'attack' },
      { type: 'chooseCaptainStat', playerId: 'p1', captainId: cap.id, stat: 'speed' },
    ]
    const a = replay(base, log)
    const b = replay(base, log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(captainsOf(a, 'p1')[0]!.stats).toEqual({ attack: 1, defense: 0, speed: 1 })
  })
})
