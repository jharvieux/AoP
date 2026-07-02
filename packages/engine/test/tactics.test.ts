import { describe, expect, it } from 'vitest'
import {
  availableTactics,
  aiTacticDriver,
  createCombatStats,
  resolveTacticalCombat,
  seedRng,
  standingOrdersDriver,
  TACTIC_MATRIX,
  TACTICS,
  type Combatant,
  type CombatStatsData,
  type TacticId,
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

describe('tactic matrix', () => {
  it('stays inside the balance-safe band [0.8, 1.25]', () => {
    for (const own of TACTICS) {
      for (const opp of TACTICS) {
        const m = TACTIC_MATRIX[own][opp]
        expect(m).toBeGreaterThanOrEqual(0.8)
        expect(m).toBeLessThanOrEqual(1.25)
      }
    }
  })

  it('forms a clean 4-cycle: each tactic beats exactly one and loses to one', () => {
    for (const own of TACTICS) {
      const beats = TACTICS.filter((opp) => TACTIC_MATRIX[own][opp] > 1)
      const losesTo = TACTICS.filter((opp) => TACTIC_MATRIX[own][opp] < 1)
      expect(beats).toHaveLength(1)
      expect(losesTo).toHaveLength(1)
    }
  })
})

describe('availableTactics gating', () => {
  it('gates ram behind a heavy hull and board behind crew', () => {
    const sloopWithCrew = combatant('a', [{ unitId: 'grunt', count: 3 }], 'sloop')
    expect(availableTactics(sloopWithCrew, stats)).toEqual(['broadside', 'evade', 'board'])

    const galleonNoCrew = combatant('a', [], 'galleon')
    expect(availableTactics(galleonNoCrew, stats)).toEqual(['broadside', 'evade', 'ram'])
  })
})

describe('drivers', () => {
  it('standing orders cycle and fall back to broadside when unavailable', () => {
    const driver = standingOrdersDriver(['ram', 'board'])
    const ctx = (round: number) => ({
      round,
      ownStrength: 10,
      enemyStrength: 10,
      ownHp: 10,
      enemyHp: 10,
      available: ['broadside', 'board'] as TacticId[],
    })
    expect(driver.choose(ctx(1))).toBe('broadside') // 'ram' not available -> fallback
    expect(driver.choose(ctx(2))).toBe('board')
  })

  it('AI flees when clearly losing and able', () => {
    const pick = aiTacticDriver.choose({
      round: 3,
      ownStrength: 10,
      enemyStrength: 30,
      ownHp: 5,
      enemyHp: 40,
      available: ['broadside', 'evade'],
    })
    expect(pick).toBe('evade')
  })
})

describe('resolveTacticalCombat', () => {
  const drivers = { attacker: aiTacticDriver, defender: aiTacticDriver }

  it('is deterministic', () => {
    const input = {
      attacker: combatant('a', [{ unitId: 'grunt', count: 5 }]),
      defender: combatant('d', [{ unitId: 'grunt', count: 5 }]),
    }
    const r1 = resolveTacticalCombat(input, stats, seedRng(9), drivers)
    const r2 = resolveTacticalCombat(input, stats, seedRng(9), drivers)
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })

  it('never lets tactics invert a 3x strength gap', () => {
    // ~3x strength gap; hand the weak side its best tactic and the strong side its
    // worst (broadside beats ram). The strong side must still win every time.
    const weak = combatant('weak', [{ unitId: 'grunt', count: 6 }], 'sloop')
    const strong = combatant('strong', [{ unitId: 'elite', count: 5 }], 'galleon')
    const tactical = {
      attacker: standingOrdersDriver(['broadside']),
      defender: standingOrdersDriver(['ram']),
    }
    for (const seed of [1, 2, 3, 4, 5, 42, 99, 123]) {
      const { report } = resolveTacticalCombat(
        { attacker: weak, defender: strong },
        stats,
        seedRng(seed),
        tactical,
      )
      expect(report.winnerId).toBe('strong')
    }
  })

  it('lets an evading fleet break off (flee/escape) when not rammed', () => {
    // Both sides are sturdy enough to survive the opening round, so the escape
    // check fires: the runner (a roomy but lightly-crewed galleon) slips away.
    const runner = combatant('runner', [{ unitId: 'grunt', count: 2 }], 'galleon')
    const chaser = combatant('chaser', [{ unitId: 'elite', count: 3 }], 'sloop')
    const { report } = resolveTacticalCombat(
      { attacker: runner, defender: chaser },
      stats,
      seedRng(3),
      {
        attacker: standingOrdersDriver(['evade']),
        defender: standingOrdersDriver(['broadside']),
      },
    )
    expect(report.escapedId).toBe('runner')
    expect(report.attackerSurvived).toBe(true)
    expect(report.defenderSurvived).toBe(true)
  })
})
