import { describe, expect, it } from 'vitest'
import {
  applyActionWithOutcome,
  captainsOf,
  createGame,
  probeBoardingBattle,
  probePartyAssault,
  probePartyBattle,
  probeTacticalBattle,
  probeTwoSeatBattle,
  RULES_VERSION,
  seedRng,
  type BoardActivationView,
  type BoardCommand,
  type CombatStatsData,
  type GameConfig,
  type GameState,
  type LandingParty,
  type PendingTactic,
  type TacticId,
  type Tile,
  type TileType,
  type TroopStack,
  type TwoSeatProbeOutcome,
} from '../src'
import { BATTLE_TUNING, COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

/**
 * The interactive-combat probes (#93, #305) live in the engine so single-player
 * and the multiplayer server run the identical pure simulation
 * (docs/design/multiplayer-tactical-probe.md). Their load-bearing property is
 * monotone determinism: re-probing with any prefix of a recorded order list
 * reproduces the exact decision context that prefix produced the first time,
 * regardless of when — or in what order — the probes are evaluated. The server
 * design leans on this to disclose one round of context per committed order
 * without ever replaying differently. These tests pin that property directly.
 */

const UNITS = [
  { id: 'grunt', attack: 5, defense: 2, health: 12, speed: 5 },
  { id: 'archer', attack: 4, defense: 1, health: 8, speed: 6, range: 3 },
]
const SHIPS = [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }]

function statsData(battle: typeof BATTLE_TUNING | null): CombatStatsData {
  return {
    units: UNITS,
    ships: SHIPS,
    combat: COMBAT_TUNING,
    tactics: TACTICS_TUNING,
    ...(battle ? { battle } : {}),
  }
}

function gameConfig(battle: typeof BATTLE_TUNING | null): GameConfig {
  const p1Troops: TroopStack[] = [{ unitId: 'grunt', count: 12 }]
  return {
    seed: 7,
    mapSize: 'small',
    setup: GAME_SETUP,
    players: [
      { id: 'p1', name: 'P1', faction: 'pirates', isAI: false, startingTroops: p1Troops },
      {
        id: 'p2',
        name: 'P2',
        faction: 'british',
        isAI: true,
        startingTroops: [{ unitId: 'grunt', count: 10 }],
      },
    ],
    combatStats: statsData(battle),
  }
}

/** A fresh game with the two captains adjacent, ready for an attackCaptain action. */
function adjacentBattleState(battle: typeof BATTLE_TUNING | null = BATTLE_TUNING): GameState {
  const state = createGame(gameConfig(battle))
  const p1cap = captainsOf(state, 'p1')[0]!
  const p2cap = captainsOf(state, 'p2')[0]!
  const target = { x: p1cap.position.x + 1, y: p1cap.position.y }
  return {
    ...state,
    captains: state.captains.map((c) => (c.id === p2cap.id ? { ...c, position: target } : c)),
  }
}

function attackTargets(state: GameState) {
  return {
    captainId: captainsOf(state, 'p1')[0]!.id,
    targetCaptainId: captainsOf(state, 'p2')[0]!.id,
  }
}

/** A deterministic legal board command from an activation view (mirrors the engine's own boardAiDriver choice). */
function scriptedCommand(view: BoardActivationView): BoardCommand {
  for (const t of view.targets) {
    if (t.rangedFrom !== undefined || t.attackFrom !== undefined) {
      const from = t.rangedFrom ?? t.attackFrom
      return { stackId: view.stack.id, ...(from ? { to: from } : {}), targetId: t.targetId }
    }
  }
  const march = view.targets[0]?.approachHex
  return march ? { stackId: view.stack.id, to: march } : { stackId: view.stack.id }
}

/**
 * Re-probe with every prefix of `orders` in a deliberately non-sequential order
 * — reversed, then evens, then odds — and assert each matches the canonical
 * outcome that prefix produced when the plan was recorded left to right. If any
 * probe carried hidden state across calls, or replayed a prefix differently, an
 * interleaved evaluation order would surface it.
 */
function assertInterleavedPrefixes<T>(
  n: number,
  canonical: readonly T[],
  probeAt: (k: number) => T,
): void {
  const order: number[] = []
  for (let k = n; k >= 0; k--) order.push(k)
  for (let k = 0; k <= n; k += 2) order.push(k)
  for (let k = 1; k <= n; k += 2) order.push(k)
  for (const k of order) {
    expect(JSON.stringify(probeAt(k))).toBe(JSON.stringify(canonical[k]))
  }
}

describe('probe determinism: interleaved growing prefixes replay bit-exact', () => {
  it('naval-tactics probe: every tactic prefix reproduces its recorded round context', () => {
    const state = adjacentBattleState(null) // no board tuning: pure gunnery, a clean growing prefix
    const action = attackTargets(state)
    const orders: TacticId[] = []
    const canonical = [probeTacticalBattle(state, action, [], [])]
    let guard = 0
    while (canonical[canonical.length - 1]!.kind === 'awaitingTactic') {
      if (++guard > 100) throw new Error('gunnery duel did not resolve')
      const ctx = (canonical[canonical.length - 1] as { ctx: { available: TacticId[] } }).ctx
      orders.push(ctx.available.includes('broadside') ? 'broadside' : ctx.available[0]!)
      canonical.push(probeTacticalBattle(state, action, orders, []))
    }
    const n = orders.length
    expect(n).toBeGreaterThan(1) // more than one round fought — a non-trivial prefix chain
    expect(canonical[n]!.kind).toBe('resolved')

    assertInterleavedPrefixes(n, canonical, (k) =>
      probeTacticalBattle(state, action, orders.slice(0, k), []),
    )

    // The recorded plan is the authority contract: it replays bit-identically
    // through the reducer as attackerOrders.
    const { battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      ...action,
      attackerOrders: orders,
    })
    const resolved = canonical[n] as { report: unknown }
    expect(JSON.stringify(battleReport)).toBe(JSON.stringify(resolved.report))
  })

  it('boarding probe: every command prefix reproduces its recorded activation view', () => {
    const state = adjacentBattleState()
    const action = { ...attackTargets(state), attackerOrders: ['board' as const] }
    const commands: BoardCommand[] = []
    const canonical = [probeBoardingBattle(state, action, [])]
    let guard = 0
    while (canonical[canonical.length - 1]!.kind === 'awaitingCommand') {
      if (++guard > 500) throw new Error('boarding melee did not resolve')
      const view = (canonical[canonical.length - 1] as { view: BoardActivationView }).view
      commands.push(scriptedCommand(view))
      canonical.push(probeBoardingBattle(state, action, commands))
    }
    const n = commands.length
    expect(n).toBeGreaterThan(1)
    expect(canonical[n]!.kind).toBe('resolved')

    assertInterleavedPrefixes(n, canonical, (k) =>
      probeBoardingBattle(state, action, commands.slice(0, k)),
    )

    const { battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      ...action,
      boardCommands: commands,
    })
    const resolved = canonical[n] as { report: unknown }
    expect(JSON.stringify(battleReport)).toBe(JSON.stringify(resolved.report))
  })
})

/**
 * Interactive tactical land battles (#482): the party-vs-party and
 * party-vs-city probes obey the same monotone-determinism contract as the
 * naval ones above, and their resolved reports match the reducer's own
 * `attackParty` / `partyAssaultCity` resolution of the identical recorded
 * plan bit for bit — the probe is a preview of the applied action, never a
 * second simulation that could drift.
 */
describe('party land-battle probes (#482)', () => {
  function landState(): GameState {
    const width = 16
    const height = 12
    const tiles: Tile[] = Array.from({ length: width * height }, () => ({
      type: 'deep' as TileType,
      island: -1,
    }))
    for (let y = 4; y <= 7; y++) {
      for (let x = 4; x <= 11; x++) tiles[y * width + x] = { type: 'land', island: 0 }
    }
    tiles[5 * width + 11] = { type: 'port', island: 0 }

    const makeParty = (
      id: string,
      ownerId: string,
      position: { x: number; y: number },
      troops: TroopStack[],
    ): LandingParty => ({
      id,
      ownerId,
      name: id,
      position,
      movementPoints: GAME_SETUP.partyMovementPoints,
      maxMovementPoints: GAME_SETUP.partyMovementPoints,
      troops,
    })

    const seats = [
      { id: 'p1', name: 'One', faction: 'pirates' as const, isAI: false },
      { id: 'p2', name: 'Two', faction: 'british' as const, isAI: false },
    ]
    return {
      config: {
        seed: 5,
        mapSize: 'small',
        setup: GAME_SETUP,
        combatStats: statsData(BATTLE_TUNING),
        players: seats,
        rulesVersion: RULES_VERSION,
      },
      map: { width, height, tiles, startPositions: [] },
      round: 1,
      currentPlayerIndex: 0,
      players: seats.map((s) => ({
        id: s.id,
        name: s.name,
        faction: s.faction,
        isAI: s.isAI,
        resources: { gold: 0, timber: 0, iron: 0, rum: 0 },
        eliminated: false,
        reputation: 100,
        itemStash: [],
      })),
      alliances: { pairs: [], proposals: [] },
      cities: [
        {
          id: 'p2-city',
          ownerId: 'p2',
          name: 'Port Royal',
          position: { x: 11, y: 5 },
          buildings: ['townhall'],
          builtThisRound: false,
          garrison: { grunt: 6 },
          unitAvailability: {},
        },
      ],
      captains: [],
      parties: [
        makeParty('lp1', 'p1', { x: 5, y: 4 }, [
          { unitId: 'grunt', count: 8 },
          { unitId: 'archer', count: 4 },
        ]),
        makeParty('lp2', 'p2', { x: 6, y: 4 }, [{ unitId: 'grunt', count: 7 }]),
      ],
      encounters: [],
      landSites: [],
      landEncounters: [],
      resourceNodes: [],
      exploredTiles: {},
      rngState: seedRng(5),
      actionCount: 0,
      status: 'active',
      winnerId: null,
    }
  }

  it('party-vs-party: prefixes replay bit-exact and the plan resolves through the reducer identically', () => {
    const state = landState()
    const action = { partyId: 'lp1', targetPartyId: 'lp2' }
    const commands: BoardCommand[] = []
    const canonical = [probePartyBattle(state, action, [])]
    let guard = 0
    while (canonical[canonical.length - 1]!.kind === 'awaitingCommand') {
      if (++guard > 500) throw new Error('party battle did not resolve')
      const view = (canonical[canonical.length - 1] as { view: BoardActivationView }).view
      commands.push(scriptedCommand(view))
      canonical.push(probePartyBattle(state, action, commands))
    }
    const n = commands.length
    expect(n).toBeGreaterThan(1)
    expect(canonical[n]!.kind).toBe('resolved')

    assertInterleavedPrefixes(n, canonical, (k) =>
      probePartyBattle(state, action, commands.slice(0, k)),
    )

    const apply = () =>
      applyActionWithOutcome(state, {
        type: 'attackParty',
        playerId: 'p1',
        ...action,
        boardCommands: commands,
      })
    const first = apply()
    const resolved = canonical[n] as { report: unknown }
    expect(JSON.stringify(first.battleReport)).toBe(JSON.stringify(resolved.report))
    // The recorded plan replays deterministically through the reducer.
    expect(JSON.stringify(apply().state)).toBe(JSON.stringify(first.state))
  })

  it('party city-assault: prefixes replay bit-exact and the plan resolves through the reducer identically', () => {
    const base = landState()
    // Stand the attacker beside the port and clear the defending party out of the fight.
    const state: GameState = {
      ...base,
      parties: [{ ...base.parties[0]!, position: { x: 10, y: 5 } }],
    }
    const action = { partyId: 'lp1', targetCityId: 'p2-city' }
    const commands: BoardCommand[] = []
    const canonical = [probePartyAssault(state, action, [])]
    let guard = 0
    while (canonical[canonical.length - 1]!.kind === 'awaitingCommand') {
      if (++guard > 500) throw new Error('party assault did not resolve')
      const view = (canonical[canonical.length - 1] as { view: BoardActivationView }).view
      commands.push(scriptedCommand(view))
      canonical.push(probePartyAssault(state, action, commands))
    }
    const n = commands.length
    expect(n).toBeGreaterThan(1)
    expect(canonical[n]!.kind).toBe('resolved')

    assertInterleavedPrefixes(n, canonical, (k) =>
      probePartyAssault(state, action, commands.slice(0, k)),
    )

    const apply = () =>
      applyActionWithOutcome(state, {
        type: 'partyAssaultCity',
        playerId: 'p1',
        ...action,
        boardCommands: commands,
      })
    const first = apply()
    const resolved = canonical[n] as { report: unknown }
    expect(JSON.stringify(first.battleReport)).toBe(JSON.stringify(resolved.report))
    expect(JSON.stringify(apply().state)).toBe(JSON.stringify(first.state))
  })

  it('fails loud without board tuning', () => {
    const base = landState()
    const state: GameState = {
      ...base,
      config: { ...base.config, combatStats: statsData(null) },
    }
    expect(() => probePartyBattle(state, { partyId: 'lp1', targetPartyId: 'lp2' }, [])).toThrow(
      /board tuning/,
    )
    expect(() => probePartyAssault(state, { partyId: 'lp1', targetCityId: 'p2-city' }, [])).toThrow(
      /board tuning/,
    )
  })
})

/**
 * Two-seat lockstep probe (#422, D-029 §10.2): both seats record live. The
 * load-bearing properties pinned here are the multiplayer authority contract:
 * a naval round advances only when BOTH seats have committed a pick; a pending
 * seat's context is a pure projection of the round-start view (independent of
 * whether the counterpart's current-round pick is already recorded — the §10.6
 * no-leak/simultaneity property); the outcome depends only on the recorded
 * lists, never on the order the seats submitted them; and a fully-driven
 * two-seat battle replays bit-exactly through the reducer as the single logged
 * `attackCaptain` carrying both seats' recorded orders.
 */
describe('two-seat lockstep probe (#422)', () => {
  type Recording = { tacticOrders: TacticId[]; boardCommands: BoardCommand[] }
  const emptyRec = (): Recording => ({ tacticOrders: [], boardCommands: [] })

  /**
   * Drive a two-seat battle to resolution, one order per probe. When both
   * seats are pending, `firstSide` submits first — driving with each value
   * must converge to identical recordings and an identical report.
   */
  function driveTwoSeat(
    state: GameState,
    action: { captainId: string; targetCaptainId: string },
    pickFor: (p: PendingTactic) => TacticId,
    firstSide: 'attacker' | 'defender',
  ) {
    const rec = { attacker: emptyRec(), defender: emptyRec() }
    let outcome: TwoSeatProbeOutcome
    let guard = 0
    for (;;) {
      if (++guard > 600) throw new Error('two-seat battle did not resolve')
      outcome = probeTwoSeatBattle(state, action, rec.attacker, rec.defender)
      if (outcome.kind === 'resolved') return { ...rec, report: outcome.report }
      if (outcome.kind === 'awaitingTactics') {
        const next = outcome.pending.find((p) => p.side === firstSide) ?? outcome.pending[0]!
        rec[next.side].tacticOrders.push(pickFor(next))
      } else {
        // The seat tag must always name the owner of the acting stack (§10.4).
        expect(outcome.side).toBe(outcome.view.stack.side)
        rec[outcome.side].boardCommands.push(scriptedCommand(outcome.view))
      }
    }
  }

  it('collects both pending seats, and a pending context is independent of the counterpart pick', () => {
    const state = adjacentBattleState(null)
    const action = attackTargets(state)

    // Neither seat has committed round 1: both pend, attacker first, round 1, no last tactic.
    const fresh = probeTwoSeatBattle(state, action, emptyRec(), emptyRec())
    expect(fresh.kind).toBe('awaitingTactics')
    const freshPending = (fresh as { pending: PendingTactic[] }).pending
    expect(freshPending.map((p) => p.side)).toEqual(['attacker', 'defender'])
    for (const p of freshPending) {
      expect(p.ctx.round).toBe(1)
      expect(p.ctx.enemyLastTactic).toBeNull()
    }

    // Attacker commits round 1: only the defender pends, and its context is
    // byte-identical to the one it saw before the attacker committed — the
    // recorded-but-unresolved pick leaks nothing (§10.6).
    const atkIn = probeTwoSeatBattle(
      state,
      action,
      { tacticOrders: ['board'], boardCommands: [] },
      emptyRec(),
    )
    expect(atkIn.kind).toBe('awaitingTactics')
    const atkInPending = (atkIn as { pending: PendingTactic[] }).pending
    expect(atkInPending.map((p) => p.side)).toEqual(['defender'])
    expect(JSON.stringify(atkInPending[0])).toBe(JSON.stringify(freshPending[1]))

    // And symmetrically for the attacker when only the defender has committed.
    const defIn = probeTwoSeatBattle(state, action, emptyRec(), {
      tacticOrders: ['broadside'],
      boardCommands: [],
    })
    expect(defIn.kind).toBe('awaitingTactics')
    const defInPending = (defIn as { pending: PendingTactic[] }).pending
    expect(defInPending.map((p) => p.side)).toEqual(['attacker'])
    expect(JSON.stringify(defInPending[0])).toBe(JSON.stringify(freshPending[0]))

    // Both committed: round 1 resolves, round 2 pends for both, and only NOW
    // does each context reveal the counterpart's round-1 pick as enemyLastTactic.
    const bothIn = probeTwoSeatBattle(
      state,
      action,
      { tacticOrders: ['board'], boardCommands: [] },
      { tacticOrders: ['broadside'], boardCommands: [] },
    )
    expect(bothIn.kind).toBe('awaitingTactics')
    const round2 = (bothIn as { pending: PendingTactic[] }).pending
    expect(round2.map((p) => p.side)).toEqual(['attacker', 'defender'])
    expect(round2[0]!.ctx.round).toBe(2)
    expect(round2[0]!.ctx.enemyLastTactic).toBe('broadside')
    expect(round2[1]!.ctx.round).toBe(2)
    expect(round2[1]!.ctx.enemyLastTactic).toBe('board')
  })

  it('a seat running ahead cannot advance the round past its pending counterpart', () => {
    const state = adjacentBattleState(null)
    const action = attackTargets(state)
    const outcome = probeTwoSeatBattle(
      state,
      action,
      { tacticOrders: ['broadside', 'broadside', 'broadside'], boardCommands: [] },
      { tacticOrders: ['broadside'], boardCommands: [] },
    )
    expect(outcome.kind).toBe('awaitingTactics')
    const pending = (outcome as { pending: PendingTactic[] }).pending
    expect(pending.map((p) => p.side)).toEqual(['defender'])
    expect(pending[0]!.ctx.round).toBe(2)
  })

  it('gunnery duel: submission order never matters, prefixes replay bit-exact, and the reducer agrees', () => {
    const state = adjacentBattleState(null)
    const action = attackTargets(state)
    const pick = (p: PendingTactic) => (p.ctx.available.includes('broadside') ? 'broadside' : p.ctx.available[0]!) // prettier-ignore

    const attackerFirst = driveTwoSeat(state, action, pick, 'attacker')
    const defenderFirst = driveTwoSeat(state, action, pick, 'defender')
    expect(JSON.stringify(defenderFirst)).toBe(JSON.stringify(attackerFirst))

    const { attacker, defender, report } = attackerFirst
    const rounds = attacker.tacticOrders.length
    expect(rounds).toBeGreaterThan(1)
    // Lockstep: every fought round has exactly one pick from EACH seat.
    expect(defender.tacticOrders.length).toBe(rounds)

    // Every paired prefix replays its recorded pending contexts bit-exactly,
    // in any evaluation order.
    const canonical: TwoSeatProbeOutcome[] = []
    for (let k = 0; k <= rounds; k++) {
      canonical.push(
        probeTwoSeatBattle(
          state,
          action,
          { tacticOrders: attacker.tacticOrders.slice(0, k), boardCommands: [] },
          { tacticOrders: defender.tacticOrders.slice(0, k), boardCommands: [] },
        ),
      )
    }
    expect(canonical[rounds]!.kind).toBe('resolved')
    assertInterleavedPrefixes(rounds, canonical, (k) =>
      probeTwoSeatBattle(
        state,
        action,
        { tacticOrders: attacker.tacticOrders.slice(0, k), boardCommands: [] },
        { tacticOrders: defender.tacticOrders.slice(0, k), boardCommands: [] },
      ),
    )

    // The authority contract: the two-seat session resolves to ONE logged
    // attackCaptain carrying both seats' recorded orders, and the reducer
    // re-derives the identical battle from it.
    const { battleReport } = applyActionWithOutcome(state, {
      type: 'attackCaptain',
      playerId: 'p1',
      ...action,
      attackerOrders: attacker.tacticOrders,
      defenderOrders: defender.tacticOrders,
    })
    expect(JSON.stringify(battleReport)).toBe(JSON.stringify(report))
  })

  it('full two-seat battle through a boarding melee replays bit-exact through the reducer', () => {
    const state = adjacentBattleState()
    const action = attackTargets(state)
    // The attacker grapples round 1 (board vs broadside lands), sending both
    // live seats to the melee board.
    const pick = (p: PendingTactic): TacticId =>
      p.side === 'attacker' && p.ctx.available.includes('board') ? 'board' : 'broadside'

    const attackerFirst = driveTwoSeat(state, action, pick, 'attacker')
    const defenderFirst = driveTwoSeat(state, action, pick, 'defender')
    expect(JSON.stringify(defenderFirst)).toBe(JSON.stringify(attackerFirst))

    const { attacker, defender, report } = attackerFirst
    // Both seats actually fought the melee interactively.
    expect(attacker.boardCommands.length).toBeGreaterThan(0)
    expect(defender.boardCommands.length).toBeGreaterThan(0)

    const apply = () =>
      applyActionWithOutcome(state, {
        type: 'attackCaptain',
        playerId: 'p1',
        ...action,
        attackerOrders: attacker.tacticOrders,
        boardCommands: attacker.boardCommands,
        defenderOrders: defender.tacticOrders,
        defenderBoardCommands: defender.boardCommands,
      })
    const first = apply()
    expect(JSON.stringify(first.battleReport)).toBe(JSON.stringify(report))
    // And the logged action replays deterministically.
    expect(JSON.stringify(apply().state)).toBe(JSON.stringify(first.state))
  })
})
