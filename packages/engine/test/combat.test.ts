import { describe, expect, it } from 'vitest'
import {
  applyActionWithOutcome,
  captainsOf,
  combatantStrength,
  createCombatStats,
  createGame,
  resolveCombat,
  seedRng,
  type Combatant,
  type CombatStatsData,
  type GameConfig,
  type GameState,
} from '../src'

const STATS: CombatStatsData = {
  units: [
    { id: 'grunt', attack: 5, defense: 2, health: 12 },
    { id: 'elite', attack: 12, defense: 8, health: 40 },
  ],
  ships: [
    { id: 'sloop', hull: 40, cannons: 6 },
    { id: 'galleon', hull: 160, cannons: 36 },
  ],
}

const stats = createCombatStats(STATS)

function combatant(ownerId: string, troops: Combatant['troops'], shipClassId = 'sloop'): Combatant {
  return { captainId: `cap-${ownerId}`, ownerId, shipClassId, troops }
}

describe('createCombatStats', () => {
  it('fails loud on unknown ids', () => {
    expect(() => stats.unit('nope')).toThrow()
    expect(() => stats.ship('nope')).toThrow()
  })
})

describe('combatantStrength', () => {
  it('rises with troop count and ship class', () => {
    const few = combatant('a', [{ unitId: 'grunt', count: 2 }])
    const many = combatant('a', [{ unitId: 'grunt', count: 10 }])
    expect(combatantStrength(many, stats)).toBeGreaterThan(combatantStrength(few, stats))

    const sloop = combatant('a', [], 'sloop')
    const galleon = combatant('a', [], 'galleon')
    expect(combatantStrength(galleon, stats)).toBeGreaterThan(combatantStrength(sloop, stats))
  })
})

describe('resolveCombat', () => {
  it('is deterministic for the same input and rng', () => {
    const input = {
      attacker: combatant('a', [{ unitId: 'grunt', count: 6 }]),
      defender: combatant('d', [{ unitId: 'grunt', count: 4 }]),
    }
    const r1 = resolveCombat(input, stats, seedRng(5))
    const r2 = resolveCombat(input, stats, seedRng(5))
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })

  it('advances the rng state', () => {
    const input = {
      attacker: combatant('a', [{ unitId: 'grunt', count: 6 }]),
      defender: combatant('d', [{ unitId: 'grunt', count: 4 }]),
    }
    const rng = seedRng(5)
    expect(resolveCombat(input, stats, rng).rng).not.toBe(rng)
  })

  it('lets a much stronger fleet win and sink the loser', () => {
    const input = {
      attacker: combatant('a', [{ unitId: 'elite', count: 10 }]),
      defender: combatant('d', [{ unitId: 'grunt', count: 1 }]),
    }
    for (const seed of [1, 2, 3, 7, 99]) {
      const { report } = resolveCombat(input, stats, seedRng(seed))
      expect(report.winnerId).toBe('a')
      expect(report.attackerSurvived).toBe(true)
      expect(report.defenderSurvived).toBe(false)
    }
  })

  it('produces a non-empty round-by-round report', () => {
    const input = {
      attacker: combatant('a', [{ unitId: 'grunt', count: 6 }]),
      defender: combatant('d', [{ unitId: 'grunt', count: 6 }]),
    }
    const { report } = resolveCombat(input, stats, seedRng(3))
    expect(report.rounds.length).toBeGreaterThan(0)
    expect([report.attacker.ownerId, report.defender.ownerId]).toContain(report.winnerId)
    expect(report.attacker.strength).toBeGreaterThan(0)
  })
})

// --- Integration through the reducer / attackCaptain action ---

function combatConfig(): GameConfig {
  return {
    seed: 7,
    mapSize: 'small',
    players: [
      {
        id: 'p1',
        name: 'P1',
        faction: 'pirates',
        isAI: false,
        startingTroops: [{ unitId: 'elite', count: 8 }],
      },
      {
        id: 'p2',
        name: 'P2',
        faction: 'british',
        isAI: true,
        startingTroops: [{ unitId: 'grunt', count: 1 }],
      },
    ],
    combatStats: STATS,
  }
}

/** Place the two captains adjacent on p1's start tile neighbourhood. */
function adjacentBattleState(): GameState {
  const state = createGame(combatConfig())
  const p1cap = captainsOf(state, 'p1')[0]!
  const p2cap = captainsOf(state, 'p2')[0]!
  const target = { x: p1cap.position.x + 1, y: p1cap.position.y }
  return {
    ...state,
    captains: state.captains.map((c) => (c.id === p2cap.id ? { ...c, position: target } : c)),
  }
}

describe('attackCaptain action', () => {
  it('resolves combat, returns a report, and sinks the loser', () => {
    const state = adjacentBattleState()
    const p1cap = captainsOf(state, 'p1')[0]!
    const p2cap = captainsOf(state, 'p2')[0]!
    const { state: next, battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      captainId: p1cap.id,
      targetCaptainId: p2cap.id,
    })
    expect(battleReport).toBeDefined()
    expect(battleReport!.winnerId).toBe('p1')
    // p2's only captain sank -> p2 eliminated -> game finished, p1 wins.
    expect(next.captains.some((c) => c.id === p2cap.id)).toBe(false)
    expect(next.status).toBe('finished')
    expect(next.winnerId).toBe('p1')
  })

  it('rejects attacking out of range', () => {
    const state = createGame(combatConfig())
    const p1cap = captainsOf(state, 'p1')[0]!
    const p2cap = captainsOf(state, 'p2')[0]!
    expect(() =>
      applyActionWithOutcome(state, {
        type: 'attackCaptain',
        playerId: 'p1',
        captainId: p1cap.id,
        targetCaptainId: p2cap.id,
      }),
    ).toThrow()
  })
})
