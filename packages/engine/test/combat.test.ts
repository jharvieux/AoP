import { describe, expect, it } from 'vitest'
import {
  applyActionWithOutcome,
  captainsOf,
  combatantStrength,
  createCombatStats,
  createGame,
  replay,
  resolveCombat,
  seedRng,
  type Action,
  type Combatant,
  type CombatStatsData,
  type GameConfig,
  type GameState,
} from '../src'
import { COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

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

describe('crew casualty pool (#210)', () => {
  // Casualties draw on a running crew-health pool: sub-lethal damage can never
  // annihilate a crew (the old proportional Math.round could), and repeated
  // sub-lethal hits accumulate until they are lethal (the old rounding could
  // also kill nobody forever).
  const statsWithMaxRounds = (maxRounds: number) =>
    createCombatStats({ ...STATS, combat: { ...COMBAT_TUNING, maxRounds } })

  it('a single sub-lethal blow never wipes a one-unit crew', () => {
    // Attacker strength 22 deals 6.5–8.9 damage per round — always below the
    // lone grunt's 12 health. Pre-#210, Math.round(1 * ~0.4) = 0 wiped him.
    const oneRound = statsWithMaxRounds(1)
    const input = {
      attacker: combatant('a', [{ unitId: 'grunt', count: 1 }], 'sloop'),
      defender: combatant('d', [{ unitId: 'grunt', count: 1 }], 'galleon'),
    }
    for (const seed of [1, 2, 3, 7, 99]) {
      const { report } = resolveCombat(input, oneRound, seedRng(seed))
      expect(report.survivingTroops.defender).toEqual([{ unitId: 'grunt', count: 1 }])
    }
  })

  it('half-lethal damage on three units leaves two survivors, not one', () => {
    // 14.3–19.3 damage against 3 grunts (36 total health) kills exactly one:
    // the partially wounded unit at the pool boundary survives.
    const oneRound = statsWithMaxRounds(1)
    const input = {
      attacker: combatant('a', [{ unitId: 'elite', count: 2 }], 'sloop'),
      defender: combatant('d', [{ unitId: 'grunt', count: 3 }], 'galleon'),
    }
    for (const seed of [1, 2, 3, 7, 99]) {
      const { report } = resolveCombat(input, oneRound, seedRng(seed))
      expect(report.survivingTroops.defender).toEqual([{ unitId: 'grunt', count: 2 }])
    }
  })

  it('sub-lethal hits accumulate: two rounds finish what one could not', () => {
    // Two rounds of 6.5–8.9 damage total at least 13.1 — past the grunt's 12
    // health — so the crew is gone and the overkill reaches the hull.
    const twoRounds = statsWithMaxRounds(2)
    const input = {
      attacker: combatant('a', [{ unitId: 'grunt', count: 1 }], 'sloop'),
      defender: combatant('d', [{ unitId: 'grunt', count: 1 }], 'galleon'),
    }
    for (const seed of [1, 2, 3, 7, 99]) {
      const { report } = resolveCombat(input, twoRounds, seedRng(seed))
      expect(report.survivingTroops.defender).toEqual([])
      expect(report.defenderSurvived).toBe(true)
    }
  })
})

// --- Integration through the reducer / attackCaptain action ---

function combatConfig(): GameConfig {
  return {
    seed: 7,
    mapSize: 'small',
    setup: GAME_SETUP,
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

  it("fights the defence with the target's own standing orders — never the attacker's say-so", () => {
    // p2 saves "always evade" on its own turn; when p1 later attacks, the
    // attackCaptain action carries only p1's plan, and the outnumbered p2
    // slips away exactly as its saved orders dictate (D-002 / D-009).
    let state = adjacentBattleState()
    const p1cap = captainsOf(state, 'p1')[0]!
    const p2cap = captainsOf(state, 'p2')[0]!

    state = applyActionWithOutcome(state, { type: 'endTurn', playerId: 'p1' }).state
    state = applyActionWithOutcome(state, {
      type: 'setStandingOrders',
      playerId: 'p2',
      captainId: p2cap.id,
      orders: [{ when: 'always', tactic: 'evade' }],
    }).state
    expect(state.captains.find((c) => c.id === p2cap.id)!.standingOrders).toEqual([
      { when: 'always', tactic: 'evade' },
    ])
    state = applyActionWithOutcome(state, { type: 'endTurn', playerId: 'p2' }).state

    const { state: next, battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      captainId: p1cap.id,
      targetCaptainId: p2cap.id,
      attackerOrders: ['broadside'],
    })
    expect(battleReport!.escapedId).toBe('p2')
    expect(next.captains.some((c) => c.id === p2cap.id)).toBe(true)
    expect(next.status).toBe('active')
  })

  it('awards combat XP only for a decisive win, never for an escape (#209)', () => {
    const state = adjacentBattleState()
    const p1cap = captainsOf(state, 'p1')[0]!
    const p2cap = captainsOf(state, 'p2')[0]!

    // Decisive: p1 sinks p2 and banks combatWinXp.
    const sunk = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      captainId: p1cap.id,
      targetCaptainId: p2cap.id,
    })
    expect(sunk.battleReport!.escapedId).toBeNull()
    expect(sunk.state.captains.find((c) => c.id === p1cap.id)!.xp).toBe(
      p1cap.xp + GAME_SETUP.combatWinXp,
    )

    // Escape: p2's standing orders evade, so p1 "wins" the field but the
    // battle was not decisive — no XP for either side, or attacking a
    // retreat-on-sight defender once per turn becomes a risk-free XP farm.
    let evading = state
    evading = applyActionWithOutcome(evading, { type: 'endTurn', playerId: 'p1' }).state
    evading = applyActionWithOutcome(evading, {
      type: 'setStandingOrders',
      playerId: 'p2',
      captainId: p2cap.id,
      orders: [{ when: 'always', tactic: 'evade' }],
    }).state
    evading = applyActionWithOutcome(evading, { type: 'endTurn', playerId: 'p2' }).state
    const { state: next, battleReport } = applyActionWithOutcome(evading, {
      type: 'attackCaptain',
      playerId: 'p1',
      captainId: p1cap.id,
      targetCaptainId: p2cap.id,
      attackerOrders: ['broadside'],
    })
    expect(battleReport!.escapedId).toBe('p2')
    expect(battleReport!.winnerId).toBe('p1')
    expect(next.captains.find((c) => c.id === p1cap.id)!.xp).toBe(p1cap.xp)
    expect(next.captains.find((c) => c.id === p2cap.id)!.xp).toBe(p2cap.xp)
  })

  it('replays an attackCaptain log — combat RNG and standing orders — to an identical state', () => {
    // The replay contract for combat: the same initial state and log (a defender
    // setting standing orders, then an attack resolved through the seeded combat
    // RNG) must reproduce byte-identical state. Mirrors the moveCaptain replay
    // test; extends the log contract to cover attackCaptain (per CLAUDE.md).
    const base = adjacentBattleState()
    const p1cap = captainsOf(base, 'p1')[0]!
    const p2cap = captainsOf(base, 'p2')[0]!
    const log: Action[] = [
      { type: 'endTurn', playerId: 'p1' },
      {
        type: 'setStandingOrders',
        playerId: 'p2',
        captainId: p2cap.id,
        orders: [
          { when: 'outgunned', tactic: 'evade' },
          { when: 'always', tactic: 'broadside' },
        ],
      },
      { type: 'endTurn', playerId: 'p2' },
      {
        type: 'attackCaptain',
        playerId: 'p1',
        captainId: p1cap.id,
        targetCaptainId: p2cap.id,
        attackerOrders: ['broadside', 'board'],
      },
    ]
    const a = replay(base, log)
    const b = replay(base, log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.actionCount).toBe(log.length)
  })

  it('is unaffected by which faction each seat plays (#215)', () => {
    // captainToCombatant no longer takes a faction — combat stats come solely
    // from ship class, upgrades, and skills. Swapping the two seats' factions
    // must reproduce a byte-identical battle report.
    const swappedConfig: GameConfig = {
      ...combatConfig(),
      players: combatConfig().players.map((p) => ({
        ...p,
        faction: p.id === 'p1' ? 'french' : 'dutch',
      })),
    }
    const base = adjacentBattleState()
    const swapped = createGame(swappedConfig)
    const p1cap = captainsOf(swapped, 'p1')[0]!
    const p2cap = captainsOf(swapped, 'p2')[0]!
    const target = { x: p1cap.position.x + 1, y: p1cap.position.y }
    const swappedAdjacent: GameState = {
      ...swapped,
      captains: swapped.captains.map((c) => (c.id === p2cap.id ? { ...c, position: target } : c)),
    }

    const action: Action = {
      type: 'attackCaptain',
      playerId: 'p1',
      captainId: captainsOf(base, 'p1')[0]!.id,
      targetCaptainId: captainsOf(base, 'p2')[0]!.id,
    }
    const swappedAction: Action = {
      ...action,
      captainId: captainsOf(swappedAdjacent, 'p1')[0]!.id,
      targetCaptainId: captainsOf(swappedAdjacent, 'p2')[0]!.id,
    }

    const { battleReport: reportA } = applyActionWithOutcome(base, action)
    const { battleReport: reportB } = applyActionWithOutcome(swappedAdjacent, swappedAction)
    expect(reportB!.winnerId === 'p1').toBe(reportA!.winnerId === 'p1')
    expect(reportB!.attackerSurvived).toBe(reportA!.attackerSurvived)
    expect(reportB!.defenderSurvived).toBe(reportA!.defenderSurvived)
    expect(reportB!.rounds.length).toBe(reportA!.rounds.length)
  })
})

describe('setStandingOrders action', () => {
  it('rejects orders for a captain you do not own', () => {
    const state = createGame(combatConfig())
    const p2cap = captainsOf(state, 'p2')[0]!
    expect(() =>
      applyActionWithOutcome(state, {
        type: 'setStandingOrders',
        playerId: 'p1',
        captainId: p2cap.id,
        orders: [{ when: 'always', tactic: 'evade' }],
      }),
    ).toThrow(/not yours/)
  })

  it('rejects malformed orders instead of guessing', () => {
    const state = createGame(combatConfig())
    const p1cap = captainsOf(state, 'p1')[0]!
    expect(() =>
      applyActionWithOutcome(state, {
        type: 'setStandingOrders',
        playerId: 'p1',
        captainId: p1cap.id,
        orders: [{ when: 'always', tactic: 'kraken' as never }],
      }),
    ).toThrow(/Invalid standing order/)
  })
})
