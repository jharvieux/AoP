import { describe, expect, it } from 'vitest'
import {
  aggressiveTacticDriver,
  availableTactics,
  aiTacticDriver,
  cautiousTacticDriver,
  combatantStrength,
  plainTacticDriver,
  createCombatStats,
  resolveTacticalCombat,
  seedRng,
  standingOrdersDriver,
  tacticModifier,
  tacticPlanDriver,
  TACTIC_MATCHUPS,
  TACTICS,
  type Combatant,
  type CombatStatsData,
  type TacticContext,
  type TacticId,
} from '../src'
import { COMBAT_TUNING, TACTICS_TUNING } from './fixtures'

const STATS: CombatStatsData = {
  units: [
    { id: 'grunt', attack: 5, defense: 2, health: 12 },
    { id: 'elite', attack: 12, defense: 8, health: 40 },
  ],
  ships: [
    { id: 'sloop', hull: 40, cannons: 6, speed: 5 },
    { id: 'galleon', hull: 160, cannons: 36, speed: 2 },
  ],
  combat: COMBAT_TUNING,
  tactics: TACTICS_TUNING,
}
const stats = createCombatStats(STATS)
const defaultAiDriver = aiTacticDriver(TACTICS_TUNING)
const aggressiveDriver = aggressiveTacticDriver(TACTICS_TUNING)
const cautiousDriver = cautiousTacticDriver(TACTICS_TUNING)

function combatant(ownerId: string, troops: Combatant['troops'], shipClassId = 'sloop'): Combatant {
  return { captainId: `cap-${ownerId}`, ownerId, shipClassId, troops }
}

function ctx(overrides: Partial<TacticContext> = {}): TacticContext {
  return {
    round: 1,
    ownStrength: 10,
    enemyStrength: 10,
    ownHp: 10,
    enemyHp: 10,
    ownSpeed: 5,
    enemySpeed: 5,
    enemyLastTactic: null,
    available: [...TACTICS],
    ...overrides,
  }
}

describe('tactic matrix', () => {
  it('stays inside the balance-safe band [disadvantage, advantage]', () => {
    for (const own of TACTICS) {
      for (const opp of TACTICS) {
        const m = tacticModifier(TACTIC_MATCHUPS[own][opp], TACTICS_TUNING)
        expect(m).toBeGreaterThanOrEqual(TACTICS_TUNING.disadvantage)
        expect(m).toBeLessThanOrEqual(TACTICS_TUNING.advantage)
      }
    }
  })

  it('forms a clean 4-cycle: each tactic beats exactly one and loses to one', () => {
    for (const own of TACTICS) {
      const beats = TACTICS.filter((opp) => TACTIC_MATCHUPS[own][opp] === 'advantage')
      const losesTo = TACTICS.filter((opp) => TACTIC_MATCHUPS[own][opp] === 'disadvantage')
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

describe('tacticPlanDriver (interactive plan)', () => {
  it('cycles the plan and falls back to broadside when a pick is unavailable', () => {
    const driver = tacticPlanDriver(['ram', 'board'])
    const available: TacticId[] = ['broadside', 'board']
    expect(driver.choose(ctx({ round: 1, available }))).toBe('broadside') // 'ram' unavailable
    expect(driver.choose(ctx({ round: 2, available }))).toBe('board')
    expect(driver.choose(ctx({ round: 3, available }))).toBe('broadside')
  })
})

describe('standingOrdersDriver (offline defence)', () => {
  it("expresses the D-002 canonical plan: 'evade if outgunned, else broadside'", () => {
    const driver = standingOrdersDriver(
      [
        { when: 'outgunned', tactic: 'evade' },
        { when: 'always', tactic: 'broadside' },
      ],
      TACTICS_TUNING.outgunnedRatio,
    )
    expect(driver.choose(ctx({ ownStrength: 10, enemyStrength: 30 }))).toBe('evade')
    expect(driver.choose(ctx({ ownStrength: 10, enemyStrength: 11 }))).toBe('broadside')
  })

  it('skips rules whose tactic is unavailable instead of abandoning the plan', () => {
    const driver = standingOrdersDriver(
      [
        { when: 'always', tactic: 'ram' },
        { when: 'always', tactic: 'board' },
      ],
      TACTICS_TUNING.outgunnedRatio,
    )
    expect(driver.choose(ctx({ available: ['broadside', 'evade', 'board'] }))).toBe('board')
  })

  it("can react to a fleeing enemy via 'enemyEvaded'", () => {
    const driver = standingOrdersDriver(
      [
        { when: 'enemyEvaded', tactic: 'board' },
        { when: 'always', tactic: 'broadside' },
      ],
      TACTICS_TUNING.outgunnedRatio,
    )
    expect(driver.choose(ctx({ enemyLastTactic: 'evade' }))).toBe('board')
    expect(driver.choose(ctx({ enemyLastTactic: null }))).toBe('broadside')
  })
})

describe('aiTacticDriver', () => {
  it('flees when clearly losing and able', () => {
    const pick = defaultAiDriver.choose(
      ctx({
        round: 3,
        ownStrength: 10,
        enemyStrength: 30,
        ownHp: 5,
        enemyHp: 40,
        available: ['broadside', 'evade'],
      }),
    )
    expect(pick).toBe('evade')
  })

  it('pins a fleeing enemy when fast enough to hold it — and not when slower', () => {
    const chase = ctx({
      ownStrength: 10,
      enemyStrength: 12,
      enemyLastTactic: 'evade',
      available: ['broadside', 'evade', 'board'],
    })
    expect(defaultAiDriver.choose({ ...chase, ownSpeed: 5, enemySpeed: 5 })).toBe('board')
    // A slower ship can't hold the runner, so boarding is a wasted round.
    expect(defaultAiDriver.choose({ ...chase, ownSpeed: 2, enemySpeed: 5 })).toBe('broadside')
  })

  it('rams its way out when cornered by a grappling chaser instead of a doomed evade', () => {
    const pick = defaultAiDriver.choose(
      ctx({
        ownHp: 10,
        enemyHp: 40,
        ownSpeed: 2,
        enemySpeed: 5,
        enemyLastTactic: 'board',
        available: ['broadside', 'evade', 'ram'],
      }),
    )
    expect(pick).toBe('ram')
  })
})

describe('personality combat drivers (#25)', () => {
  it('aggressive presses close-quarters instead of holding the gun line', () => {
    // Even fight the default driver would broadside — the aggressor forces a board.
    expect(aggressiveDriver.choose(ctx())).toBe('board')
    // Only a near-sinking ship breaks off.
    expect(aggressiveDriver.choose(ctx({ ownHp: 2, enemyHp: 40 }))).toBe('evade')
  })

  it('cautious breaks off as soon as the fight turns against it', () => {
    // The default driver only flees when *clearly* losing; the cautious one leaves earlier.
    const slightlyBehind = ctx({ ownHp: 9, enemyHp: 10 })
    expect(defaultAiDriver.choose(slightlyBehind)).not.toBe('evade')
    expect(cautiousDriver.choose(slightlyBehind)).toBe('evade')
    // From a commanding lead it commits to a board.
    expect(cautiousDriver.choose(ctx({ ownStrength: 20, enemyStrength: 10 }))).toBe('board')
  })

  it('the unskilled driver always holds the gun line', () => {
    expect(plainTacticDriver.choose(ctx({ enemyLastTactic: 'evade', ownSpeed: 9 }))).toBe(
      'broadside',
    )
    expect(plainTacticDriver.choose(ctx({ ownHp: 1, enemyHp: 40 }))).toBe('broadside')
  })
})

describe('AI tactic thresholds are injected balance data (#212)', () => {
  // Every knob these drivers key on comes from TacticsTuning — proven here by
  // showing the same context flips its decision when only the injected tuning
  // changes, never a hardcoded constant in the engine.
  it('aiTacticDriver flees at a tuned HP ratio, not a fixed 0.5', () => {
    const situation = ctx({ ownHp: 6, enemyHp: 10, available: ['broadside', 'evade'] })
    const strict = aiTacticDriver({ ...TACTICS_TUNING, aiLosingHpRatio: 0.5 })
    const lenient = aiTacticDriver({ ...TACTICS_TUNING, aiLosingHpRatio: 0.7 })
    expect(strict.choose(situation)).not.toBe('evade') // 6 >= 10*0.5: not losing badly yet
    expect(lenient.choose(situation)).toBe('evade') // 6 < 10*0.7: now it is
  })

  it('aiTacticDriver boards at a tuned strength ratio, not a fixed 1.15', () => {
    const situation = ctx({ ownStrength: 11, enemyStrength: 10, available: ['broadside', 'board'] })
    const cautious = aiTacticDriver({ ...TACTICS_TUNING, aiBoardStrengthRatio: 1.15 })
    const eager = aiTacticDriver({ ...TACTICS_TUNING, aiBoardStrengthRatio: 1.05 })
    expect(cautious.choose(situation)).not.toBe('board') // 11 <= 10*1.15
    expect(eager.choose(situation)).toBe('board') // 11 > 10*1.05
  })

  it('aggressiveTacticDriver breaks off at a tuned HP ratio, not a fixed 0.25', () => {
    const situation = ctx({ ownHp: 3, enemyHp: 10, available: ['broadside', 'evade'] })
    const bold = aggressiveTacticDriver({ ...TACTICS_TUNING, aggressiveEvadeHpRatio: 0.25 })
    const skittish = aggressiveTacticDriver({ ...TACTICS_TUNING, aggressiveEvadeHpRatio: 0.35 })
    expect(bold.choose(situation)).not.toBe('evade') // 3 >= 10*0.25
    expect(skittish.choose(situation)).toBe('evade') // 3 < 10*0.35
  })

  it('cautiousTacticDriver boards at a tuned strength ratio, not a fixed 1.4', () => {
    const situation = ctx({ ownStrength: 13, enemyStrength: 10, available: ['broadside', 'board'] })
    const patient = cautiousTacticDriver({ ...TACTICS_TUNING, cautiousBoardStrengthRatio: 1.4 })
    const rash = cautiousTacticDriver({ ...TACTICS_TUNING, cautiousBoardStrengthRatio: 1.2 })
    expect(patient.choose(situation)).not.toBe('board') // 13 <= 10*1.4
    expect(rash.choose(situation)).toBe('board') // 13 > 10*1.2
  })

  it('is a deterministic pure function of its tuning object — same tuning, same driver instance', () => {
    expect(aiTacticDriver(TACTICS_TUNING)).toBe(aiTacticDriver(TACTICS_TUNING))
    expect(aggressiveTacticDriver(TACTICS_TUNING)).toBe(aggressiveTacticDriver(TACTICS_TUNING))
    expect(cautiousTacticDriver(TACTICS_TUNING)).toBe(cautiousTacticDriver(TACTICS_TUNING))
    // Distinct tuning objects (as every match's frozen config snapshot is) get distinct drivers.
    expect(aiTacticDriver({ ...TACTICS_TUNING })).not.toBe(aiTacticDriver(TACTICS_TUNING))
  })
})

describe('resolveTacticalCombat', () => {
  const drivers = { attacker: defaultAiDriver, defender: defaultAiDriver }

  it('is deterministic', () => {
    const input = {
      attacker: combatant('a', [{ unitId: 'grunt', count: 5 }]),
      defender: combatant('d', [{ unitId: 'grunt', count: 5 }]),
    }
    const r1 = resolveTacticalCombat(input, stats, seedRng(9), drivers)
    const r2 = resolveTacticalCombat(input, stats, seedRng(9), drivers)
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })

  it('never lets tactics invert a 3x strength gap — every plan pairing, both seats', () => {
    // Both fleets sail galleons with crew so all four tactics are live on both
    // sides, then every constant tactic plan is pitted against every other in
    // both the attacker and defender seat. Whatever the weak side plays, it can
    // never destroy the strong fleet; whenever the strong fleet stands its
    // ground (doesn't itself flee), it wins.
    const weak = combatant('weak', [{ unitId: 'grunt', count: 2 }], 'galleon')
    const strong = combatant('strong', [{ unitId: 'elite', count: 12 }], 'galleon')
    expect(combatantStrength(strong, stats)).toBeGreaterThanOrEqual(
      3 * combatantStrength(weak, stats),
    )

    for (const weakTactic of TACTICS) {
      for (const strongTactic of TACTICS) {
        for (const seed of [1, 7, 42]) {
          for (const weakSeat of ['attacker', 'defender'] as const) {
            const input =
              weakSeat === 'attacker'
                ? { attacker: weak, defender: strong }
                : { attacker: strong, defender: weak }
            const { report } = resolveTacticalCombat(input, stats, seedRng(seed), {
              attacker: tacticPlanDriver([weakSeat === 'attacker' ? weakTactic : strongTactic]),
              defender: tacticPlanDriver([weakSeat === 'attacker' ? strongTactic : weakTactic]),
            })
            const strongSurvived =
              weakSeat === 'attacker' ? report.defenderSurvived : report.attackerSurvived
            expect(strongSurvived).toBe(true)
            if (report.escapedId !== 'strong') expect(report.winnerId).toBe('strong')
          }
        }
      }
    }
  })

  it('lets an evading fleet break off when the chaser fails to pin', () => {
    // The chaser trades broadsides; nothing holds the runner, so it slips away
    // at the end of the round with both fleets intact.
    const runner = combatant('runner', [{ unitId: 'grunt', count: 2 }], 'sloop')
    const chaser = combatant('chaser', [{ unitId: 'elite', count: 3 }], 'sloop')
    const { report } = resolveTacticalCombat(
      { attacker: runner, defender: chaser },
      stats,
      seedRng(3),
      {
        attacker: tacticPlanDriver(['evade']),
        defender: tacticPlanDriver(['broadside']),
      },
    )
    expect(report.escapedId).toBe('runner')
    expect(report.attackerSurvived).toBe(true)
    expect(report.defenderSurvived).toBe(true)
  })

  it('board and ram both pin an equal-speed runner: no escape, fight to the end', () => {
    const runner = combatant('runner', [{ unitId: 'grunt', count: 1 }], 'galleon')
    const chaser = combatant('chaser', [{ unitId: 'elite', count: 6 }], 'galleon')
    for (const pin of ['board', 'ram'] as const) {
      const { report } = resolveTacticalCombat(
        { attacker: runner, defender: chaser },
        stats,
        seedRng(11),
        {
          attacker: tacticPlanDriver(['evade']),
          defender: tacticPlanDriver([pin]),
        },
      )
      expect(report.escapedId).toBeNull()
      expect(report.winnerId).toBe('chaser')
      expect(report.attackerSurvived).toBe(false)
    }
  })

  it('a faster ship outsails the pin: speed decides whether a grapple holds', () => {
    // Sloop (speed 5) flees a boarding galleon (speed 2): the grapple never
    // lands, so the sloop escapes even though board normally pins.
    const runner = combatant('runner', [{ unitId: 'elite', count: 4 }], 'sloop')
    const chaser = combatant('chaser', [{ unitId: 'elite', count: 3 }], 'galleon')
    const { report } = resolveTacticalCombat(
      { attacker: runner, defender: chaser },
      stats,
      seedRng(5),
      {
        attacker: tacticPlanDriver(['evade']),
        defender: tacticPlanDriver(['board']),
      },
    )
    expect(report.escapedId).toBe('runner')
    expect(report.attackerSurvived).toBe(true)
  })
})
