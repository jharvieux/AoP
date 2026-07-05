import { describe, expect, it } from 'vitest'
import {
  applyActionWithOutcome,
  boardAiDriver,
  boardOrdersDriver,
  boardPlanDriver,
  captainsOf,
  createCombatStats,
  createGame,
  hexDistance,
  hexLine,
  hexLineOfSight,
  hexNeighbors,
  initiativeOrder,
  replay,
  resolveBoardBattle,
  resolveBoardCombat,
  resolveTacticalCombat,
  seedRng,
  tacticPlanDriver,
  type Action,
  type BattleTuning,
  type BoardEvent,
  type BoardStack,
  type Combatant,
  type CombatStatsData,
  type GameConfig,
  type GameState,
} from '../src'
import { BATTLE_TUNING, COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

/**
 * Tactical battle board (#39). These tests are the determinism contract for
 * the board: setup, initiative, movement, terrain, retaliation, flanking, the
 * three drivers, and the boarding transition — all must replay bit-exact.
 */

const UNITS = [
  { id: 'grunt', attack: 5, defense: 2, health: 12, speed: 5 },
  { id: 'brute', attack: 12, defense: 8, health: 40, speed: 4 },
  { id: 'runner', attack: 3, defense: 1, health: 8, speed: 7 },
  // A ranged unit (#94): range 3, fast enough to act before the melee closes.
  { id: 'archer', attack: 4, defense: 1, health: 8, speed: 6, range: 3 },
]
const SHIPS = [
  { id: 'sloop', hull: 40, cannons: 6, speed: 5 },
  { id: 'galleon', hull: 160, cannons: 36, speed: 2 },
]

function statsData(battle: BattleTuning = BATTLE_TUNING): CombatStatsData {
  return { units: UNITS, ships: SHIPS, combat: COMBAT_TUNING, tactics: TACTICS_TUNING, battle }
}

/** A tiny, terrain-free board where the sides start two hexes apart. */
function openArena(overrides: Partial<BattleTuning> = {}): BattleTuning {
  return {
    ...BATTLE_TUNING,
    boardWidth: 3,
    boardHeight: 3,
    boardingBlockedDensity: 0,
    boardingRoughDensity: 0,
    boardingCoverDensity: 0,
    landBlockedDensity: 0,
    landRoughDensity: 0,
    landCoverDensity: 0,
    ...overrides,
  }
}

function combatant(ownerId: string, troops: Combatant['troops'], shipClassId = 'sloop'): Combatant {
  return { captainId: `cap-${ownerId}`, ownerId, shipClassId, troops }
}

const aiBoth = { attacker: boardAiDriver('normal'), defender: boardAiDriver('normal') }

describe('hex math', () => {
  it('interior hexes have six neighbors, all at distance 1', () => {
    const neighbors = hexNeighbors({ col: 5, row: 4 }, 11, 8)
    expect(neighbors).toHaveLength(6)
    for (const n of neighbors) expect(hexDistance({ col: 5, row: 4 }, n)).toBe(1)
  })

  it('clips neighbors at the board edge', () => {
    expect(hexNeighbors({ col: 0, row: 0 }, 11, 8).length).toBeLessThan(6)
    for (const n of hexNeighbors({ col: 0, row: 0 }, 11, 8)) {
      expect(n.col).toBeGreaterThanOrEqual(0)
      expect(n.row).toBeGreaterThanOrEqual(0)
    }
  })

  it('distance is symmetric and zero on identity', () => {
    const a = { col: 1, row: 6 }
    const b = { col: 9, row: 2 }
    expect(hexDistance(a, b)).toBe(hexDistance(b, a))
    expect(hexDistance(a, a)).toBe(0)
  })

  it('hexLine walks a contiguous path between the endpoints, inclusive', () => {
    const a = { col: 1, row: 3 }
    const b = { col: 7, row: 3 }
    const line = hexLine(a, b)
    expect(line[0]).toEqual(a)
    expect(line.at(-1)).toEqual(b)
    expect(line).toHaveLength(hexDistance(a, b) + 1)
    // Every step is exactly one hex from the last — a true contiguous line.
    for (let i = 1; i < line.length; i++) {
      expect(hexDistance(line[i - 1]!, line[i]!)).toBe(1)
    }
  })

  it('hexLine is deterministic', () => {
    const a = { col: 2, row: 1 }
    const b = { col: 8, row: 6 }
    expect(hexLine(a, b)).toEqual(hexLine(a, b))
  })

  it('line of sight is clear over open ground and blocked by an obstacle between', () => {
    const a = { col: 0, row: 2 }
    const b = { col: 6, row: 2 }
    expect(hexLineOfSight(a, b, () => false)).toBe(true)
    // A wall on the middle hex of the line occludes it.
    const mid = hexLine(a, b)[3]!
    const blockedMid = (h: { col: number; row: number }) => h.col === mid.col && h.row === mid.row
    expect(hexLineOfSight(a, b, blockedMid)).toBe(false)
    // A wall on an endpoint never blocks — you can always see out of / into your own hex.
    expect(hexLineOfSight(a, b, (h) => h.col === a.col && h.row === a.row)).toBe(true)
    expect(hexLineOfSight(a, b, (h) => h.col === b.col && h.row === b.row)).toBe(true)
  })
})

describe('initiativeOrder', () => {
  const stack = (id: number, side: 'attacker' | 'defender', unitId: string): BoardStack => ({
    id,
    side,
    unitId,
    count: 1,
    topHp: 1,
    position: { col: 0, row: 0 },
    retaliatedRound: 0,
    holding: false,
  })
  const speedOf = (unitId: string) => UNITS.find((u) => u.id === unitId)!.speed

  it('orders by speed, then attacker-first, then stack id', () => {
    const stacks = [
      stack(0, 'attacker', 'brute'), // speed 4
      stack(1, 'defender', 'runner'), // speed 7
      stack(2, 'defender', 'grunt'), // speed 5
      stack(3, 'attacker', 'grunt'), // speed 5 — ties with 2, attacker acts first
    ]
    expect(initiativeOrder(stacks, speedOf)).toEqual([1, 3, 2, 0])
  })

  it('skips dead stacks', () => {
    const stacks = [stack(0, 'attacker', 'grunt'), { ...stack(1, 'defender', 'grunt'), count: 0 }]
    expect(initiativeOrder(stacks, speedOf)).toEqual([0])
  })
})

describe('resolveBoardBattle', () => {
  const input = {
    attacker: combatant('a', [{ unitId: 'grunt', count: 20 }]),
    defender: combatant('d', [{ unitId: 'grunt', count: 20 }]),
  }

  it('is bit-identical for the same input and rng — the replay contract', () => {
    const stats = createCombatStats(statsData())
    const r1 = resolveBoardBattle(input, stats, seedRng(11), aiBoth, 'boarding')
    const r2 = resolveBoardBattle(input, stats, seedRng(11), aiBoth, 'boarding')
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })

  it('threads the rng state forward', () => {
    const stats = createCombatStats(statsData())
    const rng = seedRng(11)
    expect(resolveBoardBattle(input, stats, rng, aiBoth, 'boarding').rng).not.toBe(rng)
  })

  it('deploys the attacker on the west column and the defender on the east', () => {
    const stats = createCombatStats(statsData())
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [
          { unitId: 'grunt', count: 5 },
          { unitId: 'brute', count: 2 },
        ]),
        defender: combatant('d', [{ unitId: 'runner', count: 3 }]),
      },
      stats,
      seedRng(3),
      aiBoth,
      'boarding',
    )
    const attackers = log.stacks.filter((s) => s.side === 'attacker')
    const defenders = log.stacks.filter((s) => s.side === 'defender')
    expect(attackers).toHaveLength(2)
    expect(defenders).toHaveLength(1)
    for (const s of attackers) expect(s.position.col).toBe(0)
    for (const s of defenders) expect(s.position.col).toBe(log.width - 1)
  })

  it('never blocks a spawn column and honors the boarding terrain profile', () => {
    const stats = createCombatStats(statsData())
    for (const seed of [1, 2, 3, 4, 5]) {
      const { log } = resolveBoardBattle(input, stats, seedRng(seed), aiBoth, 'boarding')
      for (let row = 0; row < log.height; row++) {
        expect(log.terrain[row * log.width]).toBe('open')
        expect(log.terrain[row * log.width + log.width - 1]).toBe('open')
      }
      // Ship decks have no rough going (boardingRoughDensity 0 in tuning).
      expect(log.terrain).not.toContain('rough')
    }
  })

  it('a much stronger crew wins across seeds and the loser is wiped', () => {
    const stats = createCombatStats(statsData())
    for (const seed of [1, 2, 3, 7, 99]) {
      const result = resolveBoardBattle(
        {
          attacker: combatant('a', [{ unitId: 'brute', count: 30 }]),
          defender: combatant('d', [{ unitId: 'grunt', count: 3 }]),
        },
        stats,
        seedRng(seed),
        aiBoth,
        'boarding',
      )
      expect(result.winnerSide).toBe('attacker')
      expect(result.defenderTroops).toEqual([])
      expect(result.attackerTroops[0]!.count).toBeGreaterThan(0)
    }
  })

  it('a crewless side loses immediately without a melee', () => {
    const stats = createCombatStats(statsData())
    const result = resolveBoardBattle(
      {
        attacker: combatant('a', [{ unitId: 'grunt', count: 5 }]),
        defender: combatant('d', []),
      },
      stats,
      seedRng(1),
      aiBoth,
      'boarding',
    )
    expect(result.winnerSide).toBe('attacker')
    expect(result.log.rounds).toBe(0)
    expect(result.log.events).toEqual([])
  })

  it('each stack retaliates at most once per round', () => {
    // Two attacker stacks maul one defender in a tiny arena: the first blow is
    // answered, the second in the same round is not.
    const stats = createCombatStats(statsData(openArena()))
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [
          { unitId: 'grunt', count: 10 },
          { unitId: 'grunt', count: 10 },
        ]),
        defender: combatant('d', [{ unitId: 'brute', count: 20 }]),
      },
      stats,
      seedRng(5),
      aiBoth,
      'boarding',
    )
    const round1 = log.events.filter((e) => e.round === 1)
    expect(round1.filter((e) => e.type === 'attack').length).toBeGreaterThanOrEqual(2)
    expect(round1.filter((e) => e.type === 'retaliation')).toHaveLength(1)
  })

  it('a second stack on the target grants the flanking bonus', () => {
    // Stacks big enough to survive the retaliation, so the first attacker is
    // still standing beside the target when its partner swings.
    const stats = createCombatStats(statsData(openArena()))
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [
          { unitId: 'grunt', count: 40 },
          { unitId: 'grunt', count: 40 },
        ]),
        defender: combatant('d', [{ unitId: 'brute', count: 20 }]),
      },
      stats,
      seedRng(5),
      aiBoth,
      'boarding',
    )
    const attacks = log.events.filter((e) => e.round === 1 && e.type === 'attack')
    expect(attacks[0]).toMatchObject({ flanked: false })
    expect(attacks[1]).toMatchObject({ flanked: true })
  })

  it('cover soaks damage — same seed, gentler retaliation onto a covered stack', () => {
    // All non-spawn hexes are cover; the defender still stands on its open
    // spawn hex, so the opening blow is identical in both runs, while the
    // retaliation lands on the attacker standing in cover.
    const coverField = openArena({ landCoverDensity: 1 })
    const noSoak = createCombatStats(statsData({ ...coverField, coverDamageReduction: 0 }))
    const bigSoak = createCombatStats(statsData({ ...coverField, coverDamageReduction: 0.9 }))
    const duel = {
      attacker: combatant('a', [{ unitId: 'grunt', count: 10 }]),
      defender: combatant('d', [{ unitId: 'brute', count: 20 }]),
    }
    const first = (s: ReturnType<typeof createCombatStats>) =>
      resolveBoardBattle(duel, s, seedRng(9), aiBoth, 'land').log.events.filter(
        (e): e is Extract<BoardEvent, { targetId: number }> => e.type === 'retaliation',
      )[0]!
    expect(first(bigSoak).damage).toBeLessThan(first(noSoak).damage)
  })

  it('holding soaks damage — a held line takes less from the same blow', () => {
    // Wide enough that the attacker needs two rounds to close: the defender
    // holds in round 1 and is struck in round 2 while still holding.
    const arena = openArena({ boardWidth: 8 })
    const noSoak = createCombatStats(statsData({ ...arena, holdDamageReduction: 0 }))
    const bigSoak = createCombatStats(statsData({ ...arena, holdDamageReduction: 0.9 }))
    const duel = {
      attacker: combatant('a', [{ unitId: 'grunt', count: 10 }]),
      defender: combatant('d', [{ unitId: 'brute', count: 20 }]),
    }
    // Defender holds the line (easy profile) and is hit while holding.
    const drivers = { attacker: boardAiDriver('normal'), defender: boardAiDriver('easy') }
    const firstAttack = (s: ReturnType<typeof createCombatStats>) =>
      resolveBoardBattle(duel, s, seedRng(9), drivers, 'boarding').log.events.filter(
        (e): e is Extract<BoardEvent, { targetId: number }> => e.type === 'attack',
      )[0]!
    expect(firstAttack(bigSoak).damage).toBeLessThan(firstAttack(noSoak).damage)
  })

  it('rough ground costs more movement than open ground', () => {
    // A pure-rough field vs a pure-open one: the slowed march takes strictly
    // more rounds to reach first contact.
    const open = createCombatStats(statsData(openArena({ boardWidth: 8 })))
    const rough = createCombatStats(
      statsData(openArena({ boardWidth: 8, landRoughDensity: 1, roughMoveCost: 3 })),
    )
    const duel = {
      attacker: combatant('a', [{ unitId: 'brute', count: 10 }]),
      defender: combatant('d', [{ unitId: 'brute', count: 10 }]),
    }
    const drivers = { attacker: boardAiDriver('normal'), defender: boardAiDriver('easy') }
    const firstContactRound = (s: ReturnType<typeof createCombatStats>) =>
      resolveBoardBattle(duel, s, seedRng(4), drivers, 'land').log.events.find(
        (e) => e.type === 'attack',
      )!.round
    expect(firstContactRound(rough)).toBeGreaterThan(firstContactRound(open))
  })
})

describe('board AI profiles', () => {
  it('easy holds the line — it never moves', () => {
    const stats = createCombatStats(statsData())
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [{ unitId: 'grunt', count: 10 }]),
        defender: combatant('d', [{ unitId: 'grunt', count: 10 }]),
      },
      stats,
      seedRng(2),
      { attacker: boardAiDriver('easy'), defender: boardAiDriver('easy') },
      'boarding',
    )
    expect(log.events.filter((e) => e.type === 'move')).toEqual([])
  })

  it('normal advances and engages', () => {
    const stats = createCombatStats(statsData())
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [{ unitId: 'grunt', count: 10 }]),
        defender: combatant('d', [{ unitId: 'grunt', count: 10 }]),
      },
      stats,
      seedRng(2),
      { attacker: boardAiDriver('normal'), defender: boardAiDriver('easy') },
      'boarding',
    )
    expect(log.events.some((e) => e.type === 'move')).toBe(true)
    expect(log.events.some((e) => e.type === 'attack')).toBe(true)
  })

  it('hard focuses the weakest enemy stack first', () => {
    const stats = createCombatStats(statsData(openArena()))
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [{ unitId: 'brute', count: 10 }]),
        defender: combatant('d', [
          { unitId: 'brute', count: 20 },
          { unitId: 'grunt', count: 1 }, // the morsel
        ]),
      },
      stats,
      seedRng(6),
      { attacker: boardAiDriver('hard'), defender: boardAiDriver('easy') },
      'boarding',
    )
    const weakId = log.stacks.find((s) => s.side === 'defender' && s.unitId === 'grunt')!.id
    const firstAttack = log.events.find((e) => e.type === 'attack')!
    expect(firstAttack.type === 'attack' && firstAttack.targetId).toBe(weakId)
  })
})

describe('board drivers: recorded plans and standing orders', () => {
  it('replays a recorded command plan move-for-move', () => {
    const stats = createCombatStats(statsData(openArena()))
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [{ unitId: 'grunt', count: 10 }]),
        defender: combatant('d', [{ unitId: 'brute', count: 5 }]),
      },
      stats,
      seedRng(8),
      {
        attacker: boardPlanDriver([{ stackId: 0, to: { col: 1, row: 1 }, targetId: 1 }]),
        defender: boardAiDriver('easy'),
      },
      'boarding',
    )
    expect(log.events[0]).toMatchObject({
      type: 'move',
      stackId: 0,
      to: { col: 1, row: 1 },
    })
    expect(log.events[1]).toMatchObject({ type: 'attack', stackId: 0, targetId: 1 })
  })

  it('an illegal recorded move degrades to hold, never desyncing the battle', () => {
    const stats = createCombatStats(statsData(openArena()))
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [{ unitId: 'grunt', count: 10 }]),
        defender: combatant('d', [{ unitId: 'brute', count: 5 }]),
      },
      stats,
      seedRng(8),
      {
        attacker: boardPlanDriver([{ stackId: 0, to: { col: 99, row: 99 } }]),
        defender: boardAiDriver('easy'),
      },
      'boarding',
    )
    expect(log.events[0]).toMatchObject({ type: 'hold', stackId: 0 })
  })

  it('a plan naming the wrong stack is abandoned for the AI', () => {
    const stats = createCombatStats(statsData())
    const duel = {
      attacker: combatant('a', [{ unitId: 'grunt', count: 10 }]),
      defender: combatant('d', [{ unitId: 'grunt', count: 10 }]),
    }
    const planned = resolveBoardBattle(
      duel,
      stats,
      seedRng(8),
      { attacker: boardPlanDriver([{ stackId: 42 }]), defender: boardAiDriver('easy') },
      'boarding',
    )
    const pureAi = resolveBoardBattle(
      duel,
      stats,
      seedRng(8),
      { attacker: boardAiDriver('normal'), defender: boardAiDriver('easy') },
      'boarding',
    )
    expect(JSON.stringify(planned)).toBe(JSON.stringify(pureAi))
  })

  it('holdLine standing orders keep the defenders anchored', () => {
    const stats = createCombatStats(statsData())
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [{ unitId: 'grunt', count: 30 }]),
        defender: combatant('d', [{ unitId: 'grunt', count: 5 }]),
      },
      stats,
      seedRng(12),
      {
        attacker: boardAiDriver('normal'),
        defender: boardOrdersDriver([{ when: 'outnumbered', doctrine: 'holdLine' }]),
      },
      'boarding',
    )
    const defenderIds = new Set(log.stacks.filter((s) => s.side === 'defender').map((s) => s.id))
    expect(log.events.filter((e) => e.type === 'move' && defenderIds.has(e.stackId))).toEqual([])
  })
})

describe('ranged units and line of sight (#94)', () => {
  const meleeEvent = (e: BoardEvent): e is Extract<BoardEvent, { targetId: number }> =>
    e.type === 'attack' || e.type === 'retaliation'

  it('a ranged stack shoots across the gap and draws no retaliation', () => {
    // Open 3×3 arena: archer and target start two hexes apart, in range and in
    // sight. The archer fires; the held defender never closes, so no blow is
    // ever answered.
    const stats = createCombatStats(statsData(openArena()))
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [{ unitId: 'archer', count: 10 }]),
        defender: combatant('d', [{ unitId: 'grunt', count: 10 }]),
      },
      stats,
      seedRng(5),
      { attacker: boardAiDriver('normal'), defender: boardAiDriver('easy') },
      'boarding',
    )
    const shots = log.events.filter((e) => e.type === 'attack' && e.ranged)
    expect(shots.length).toBeGreaterThan(0)
    expect(log.events.filter((e) => e.type === 'retaliation')).toHaveLength(0)
  })

  it('a ranged unit caught in melee fights at the archer penalty', () => {
    // Same seed, same forced advance-and-swing onto an adjacent brute: a
    // steeper penalty lands a strictly softer blow.
    const arena = openArena()
    const noPenalty = createCombatStats(statsData({ ...arena, rangedMeleePenalty: 1 }))
    const bigPenalty = createCombatStats(statsData({ ...arena, rangedMeleePenalty: 0.25 }))
    const duel = {
      attacker: combatant('a', [{ unitId: 'archer', count: 10 }]),
      defender: combatant('d', [{ unitId: 'brute', count: 20 }]),
    }
    const firstMelee = (s: ReturnType<typeof createCombatStats>) =>
      resolveBoardBattle(
        duel,
        s,
        seedRng(9),
        {
          attacker: boardPlanDriver([{ stackId: 0, to: { col: 1, row: 1 }, targetId: 1 }]),
          defender: boardAiDriver('easy'),
        },
        'boarding',
      ).log.events.filter(
        (e): e is Extract<BoardEvent, { targetId: number }> => e.type === 'attack',
      )[0]!
    const penalized = firstMelee(bigPenalty)
    expect(penalized.ranged).toBeUndefined()
    expect(penalized.damage).toBeLessThan(firstMelee(noPenalty).damage)
  })

  it('a ranged melee scuffle still draws retaliation, unlike a shot', () => {
    const stats = createCombatStats(statsData(openArena()))
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [{ unitId: 'archer', count: 10 }]),
        defender: combatant('d', [{ unitId: 'brute', count: 20 }]),
      },
      stats,
      seedRng(9),
      {
        attacker: boardPlanDriver([{ stackId: 0, to: { col: 1, row: 1 }, targetId: 1 }]),
        defender: boardAiDriver('easy'),
      },
      'boarding',
    )
    expect(log.events[0]).toMatchObject({ type: 'move' })
    expect(log.events[1]).toMatchObject({ type: 'attack', stackId: 0 })
    expect(log.events[2]).toMatchObject({ type: 'retaliation', targetId: 0 })
  })

  it('the ranged AI opens fire from distance instead of charging in', () => {
    const stats = createCombatStats(statsData(openArena({ boardWidth: 6 })))
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [{ unitId: 'archer', count: 10 }]),
        defender: combatant('d', [{ unitId: 'brute', count: 10 }]),
      },
      stats,
      seedRng(3),
      { attacker: boardAiDriver('normal'), defender: boardAiDriver('easy') },
      'boarding',
    )
    const firstAttack = log.events.find(meleeEvent)!
    expect(firstAttack.type === 'attack' && firstAttack.ranged).toBe(true)
  })

  it('skirmish keeps a ranged stack shooting from range', () => {
    const stats = createCombatStats(statsData(openArena({ boardWidth: 6 })))
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [{ unitId: 'archer', count: 10 }]),
        defender: combatant('d', [{ unitId: 'grunt', count: 10 }]),
      },
      stats,
      seedRng(4),
      {
        attacker: boardOrdersDriver([{ when: 'always', doctrine: 'skirmish' }]),
        defender: boardAiDriver('easy'),
      },
      'boarding',
    )
    expect(log.events.some((e) => e.type === 'attack' && e.ranged)).toBe(true)
  })

  it('terrain blocks a shot: an archer with no line of sight cannot fire down the lane', () => {
    // A fully-blocked interior with only the middle row reopened. Two archer
    // stacks deploy on rows 1 and 2; the row-2 archer's line to the enemy runs
    // through walls, so it cannot get a clear shot from its spawn, while the
    // row-1 archer (in the open lane) shoots on round 1.
    const walled = openArena({
      boardWidth: 4,
      boardHeight: 3,
      boardingBlockedDensity: 1,
      maxStacksPerSide: 4,
    })
    const stats = createCombatStats(statsData(walled))
    const { log } = resolveBoardBattle(
      {
        attacker: combatant('a', [
          { unitId: 'archer', count: 6 },
          { unitId: 'archer', count: 6 },
        ]),
        defender: combatant('d', [
          { unitId: 'grunt', count: 6 },
          { unitId: 'grunt', count: 6 },
        ]),
      },
      stats,
      seedRng(1),
      { attacker: boardAiDriver('easy'), defender: boardAiDriver('easy') },
      'boarding',
    )
    // Confirm the precondition: the middle lane (row 1) is open, the off-lane
    // interior (row 2) is walled.
    const at = (col: number, row: number) => log.terrain[row * log.width + col]
    expect(at(1, 1)).toBe('open')
    expect(at(2, 1)).toBe('open')
    expect(at(1, 2)).toBe('blocked')
    // The lane archer (spawned on row 1) fires on round 1; the walled one holds.
    const laneArcher = log.stacks.find((s) => s.side === 'attacker' && s.position.row === 1)!
    const walledArcher = log.stacks.find((s) => s.side === 'attacker' && s.position.row === 2)!
    const round1 = log.events.filter((e) => e.round === 1)
    expect(round1.some((e) => e.type === 'attack' && e.ranged && e.stackId === laneArcher.id)).toBe(
      true,
    )
    expect(
      round1.some((e) => e.type === 'attack' && e.ranged && e.stackId === walledArcher.id),
    ).toBe(false)
  })

  it('a ranged battle replays bit-identically — the determinism contract', () => {
    const stats = createCombatStats(statsData())
    const input = {
      attacker: combatant('a', [{ unitId: 'archer', count: 15 }]),
      defender: combatant('d', [{ unitId: 'grunt', count: 15 }]),
    }
    const r1 = resolveBoardBattle(input, stats, seedRng(11), aiBoth, 'boarding')
    const r2 = resolveBoardBattle(input, stats, seedRng(11), aiBoth, 'boarding')
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })

  it('a ranged boarding fight is deterministic through the tactical resolver', () => {
    const duel = {
      attacker: combatant('a', [{ unitId: 'archer', count: 14 }]),
      defender: combatant('d', [{ unitId: 'grunt', count: 12 }]),
    }
    const run = () =>
      resolveTacticalCombat(duel, createCombatStats(statsData()), seedRng(31), {
        attacker: tacticPlanDriver(['board']),
        defender: tacticPlanDriver(['broadside']),
      })
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
  })
})

describe('resolveBoardCombat — the land-combat resolver interface', () => {
  it('returns a CombatResult with a board log and per-round summaries', () => {
    const stats = createCombatStats(statsData())
    const result = resolveBoardCombat(
      {
        attacker: combatant('a', [{ unitId: 'brute', count: 12 }]),
        defender: combatant('d', [{ unitId: 'grunt', count: 6 }]),
      },
      stats,
      seedRng(21),
    )
    expect(result.report.board).toBeDefined()
    expect(result.report.board!.context).toBe('land')
    expect(result.report.rounds.length).toBe(result.report.board!.rounds)
    expect(result.report.winnerId).toBe('a')
    expect(result.report.escapedId).toBeNull()
    expect(result.attackerTroops[0]!.count).toBeGreaterThan(0)
  })
})

describe('boarding transition (#39)', () => {
  const boardStats = createCombatStats(statsData())
  const duel = {
    attacker: combatant('a', [{ unitId: 'grunt', count: 12 }]),
    defender: combatant('d', [{ unitId: 'grunt', count: 10 }]),
  }

  it('a landed grapple sends the battle to the board and the melee decides it', () => {
    const result = resolveTacticalCombat(duel, boardStats, seedRng(31), {
      attacker: tacticPlanDriver(['board']),
      defender: tacticPlanDriver(['broadside']),
    })
    expect(result.report.board).toBeDefined()
    expect(result.report.board!.context).toBe('boarding')
    expect(result.report.escapedId).toBeNull()
    // The melee is decisive: exactly one side keeps its ship and crew.
    expect(result.report.attackerSurvived).not.toBe(result.report.defenderSurvived)
    const loserTroops =
      result.report.winnerId === 'a' ? result.defenderTroops : result.attackerTroops
    expect(loserTroops).toEqual([])
  })

  it('ram repels the grapple — the matrix identity survives the board', () => {
    const result = resolveTacticalCombat(
      {
        attacker: combatant('a', [{ unitId: 'grunt', count: 12 }], 'galleon'),
        defender: combatant('d', [{ unitId: 'grunt', count: 10 }], 'galleon'),
      },
      boardStats,
      seedRng(31),
      {
        attacker: tacticPlanDriver(['board']),
        defender: tacticPlanDriver(['ram']),
      },
    )
    expect(result.report.board).toBeUndefined()
  })

  it('without battle tuning in the stats snapshot, boarding never happens — old saves replay unchanged', () => {
    const legacy = createCombatStats({
      units: UNITS,
      ships: SHIPS,
      combat: COMBAT_TUNING,
      tactics: TACTICS_TUNING,
    })
    const result = resolveTacticalCombat(duel, legacy, seedRng(31), {
      attacker: tacticPlanDriver(['board']),
      defender: tacticPlanDriver(['broadside']),
    })
    expect(result.report.board).toBeUndefined()
  })

  it('is deterministic end to end', () => {
    const run = () =>
      resolveTacticalCombat(duel, boardStats, seedRng(31), {
        attacker: tacticPlanDriver(['board']),
        defender: tacticPlanDriver(['broadside']),
      })
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
  })
})

// --- Integration through the reducer / action log ---

function boardConfig(): GameConfig {
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
        startingTroops: [{ unitId: 'grunt', count: 12 }],
      },
      {
        id: 'p2',
        name: 'P2',
        faction: 'british',
        isAI: true,
        startingTroops: [{ unitId: 'grunt', count: 10 }],
      },
    ],
    combatStats: statsData(),
  }
}

function adjacentBattleState(p1Troops = [{ unitId: 'grunt', count: 12 }]): GameState {
  const cfg = boardConfig()
  const state = createGame({
    ...cfg,
    players: cfg.players.map((p) => (p.id === 'p1' ? { ...p, startingTroops: p1Troops } : p)),
  })
  const p1cap = captainsOf(state, 'p1')[0]!
  const p2cap = captainsOf(state, 'p2')[0]!
  const target = { x: p1cap.position.x + 1, y: p1cap.position.y }
  return {
    ...state,
    captains: state.captains.map((c) => (c.id === p2cap.id ? { ...c, position: target } : c)),
  }
}

describe('attackCaptain with the battle board', () => {
  it('a boarding attack resolves on the board and sinks the loser', () => {
    const state = adjacentBattleState()
    const p1cap = captainsOf(state, 'p1')[0]!
    const p2cap = captainsOf(state, 'p2')[0]!
    const { state: next, battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      captainId: p1cap.id,
      targetCaptainId: p2cap.id,
      attackerOrders: ['board'],
    })
    expect(battleReport!.board).toBeDefined()
    // Decisive: one captain is gone, the other keeps its melee survivors.
    expect(next.captains).toHaveLength(1)
    const survivor = next.captains[0]!
    expect(survivor.ownerId).toBe(battleReport!.winnerId)
    expect(survivor.troops[0]!.count).toBeGreaterThan(0)
  })

  it('a boarding attack with ranged crews replays through the action log identically (#94)', () => {
    const base = adjacentBattleState([{ unitId: 'archer', count: 12 }])
    const p1cap = captainsOf(base, 'p1')[0]!
    const p2cap = captainsOf(base, 'p2')[0]!
    const log: Action[] = [
      {
        type: 'attackCaptain',
        playerId: 'p1',
        captainId: p1cap.id,
        targetCaptainId: p2cap.id,
        attackerOrders: ['board'],
        boardCommands: [{ stackId: 0, targetId: 1 }, { stackId: 0 }],
      },
    ]
    const a = replay(base, log)
    const b = replay(base, log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const { battleReport } = applyActionWithOutcome(base, log[0]!)
    expect(battleReport!.board).toBeDefined()
    // The board carried a ranged shot in the melee record.
    expect(battleReport!.board!.events.some((e) => e.type === 'attack' && e.ranged)).toBe(true)
  })

  it('rejects malformed board commands instead of guessing', () => {
    const state = adjacentBattleState()
    const p1cap = captainsOf(state, 'p1')[0]!
    const p2cap = captainsOf(state, 'p2')[0]!
    expect(() =>
      applyActionWithOutcome(state, {
        type: 'attackCaptain',
        playerId: 'p1',
        captainId: p1cap.id,
        targetCaptainId: p2cap.id,
        boardCommands: [{ stackId: 0.5 }],
      }),
    ).toThrow(/Malformed board command/)
  })

  it('replays a full boarding log — recorded commands and board orders — to identical state', () => {
    const base = adjacentBattleState()
    const p1cap = captainsOf(base, 'p1')[0]!
    const p2cap = captainsOf(base, 'p2')[0]!
    const log: Action[] = [
      { type: 'endTurn', playerId: 'p1' },
      {
        type: 'setStandingOrders',
        playerId: 'p2',
        captainId: p2cap.id,
        orders: [{ when: 'always', tactic: 'broadside' }],
        boardOrders: [
          { when: 'outnumbered', doctrine: 'holdLine' },
          { when: 'always', doctrine: 'advance' },
        ],
      },
      { type: 'endTurn', playerId: 'p2' },
      {
        type: 'attackCaptain',
        playerId: 'p1',
        captainId: p1cap.id,
        targetCaptainId: p2cap.id,
        attackerOrders: ['board'],
        boardCommands: [{ stackId: 0, to: { col: 1, row: 3 } }, { stackId: 0 }],
      },
    ]
    const a = replay(base, log)
    const b = replay(base, log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.actionCount).toBe(log.length)
  })
})

describe('setStandingOrders with board orders', () => {
  it('sets, keeps, and clears board orders independently of naval orders', () => {
    let state = createGame(boardConfig())
    const cap = captainsOf(state, 'p1')[0]!
    state = applyActionWithOutcome(state, {
      type: 'setStandingOrders',
      playerId: 'p1',
      captainId: cap.id,
      orders: [{ when: 'always', tactic: 'broadside' }],
      boardOrders: [{ when: 'always', doctrine: 'skirmish' }],
    }).state
    expect(state.captains.find((c) => c.id === cap.id)!.boardOrders).toEqual([
      { when: 'always', doctrine: 'skirmish' },
    ])

    // Omitting boardOrders leaves the saved doctrine untouched.
    state = applyActionWithOutcome(state, {
      type: 'setStandingOrders',
      playerId: 'p1',
      captainId: cap.id,
      orders: [{ when: 'always', tactic: 'evade' }],
    }).state
    expect(state.captains.find((c) => c.id === cap.id)!.boardOrders).toEqual([
      { when: 'always', doctrine: 'skirmish' },
    ])

    // An empty array clears it back to the board AI.
    state = applyActionWithOutcome(state, {
      type: 'setStandingOrders',
      playerId: 'p1',
      captainId: cap.id,
      orders: [{ when: 'always', tactic: 'evade' }],
      boardOrders: [],
    }).state
    expect(state.captains.find((c) => c.id === cap.id)!.boardOrders).toEqual([])
  })

  it('rejects malformed board orders', () => {
    const state = createGame(boardConfig())
    const cap = captainsOf(state, 'p1')[0]!
    expect(() =>
      applyActionWithOutcome(state, {
        type: 'setStandingOrders',
        playerId: 'p1',
        captainId: cap.id,
        orders: [],
        boardOrders: [{ when: 'always', doctrine: 'banzai' as never }],
      }),
    ).toThrow(/Invalid board order/)
  })
})
