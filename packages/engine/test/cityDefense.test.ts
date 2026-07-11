import { describe, expect, it } from 'vitest'
import {
  applyAction,
  applyActionWithOutcome,
  captainsOf,
  cityDefenderTroops,
  cityToCombatant,
  combatantStrength,
  createCombatStats,
  createGame,
  replay,
  type Action,
  type CityState,
  type CombatStatsData,
  type ContentCatalog,
  type GameConfig,
  type GameState,
} from '../src'
import { AI_TUNING, BATTLE_TUNING, COMBAT_TUNING, GAME_SETUP, TACTICS_TUNING } from './fixtures'

/**
 * Automatic city militia + turrets (#435). Whenever a city is attacked it fields,
 * on top of its recruited garrison, 5 free militia of every recruitable unit type
 * and two stationary ranged turrets derived from its highest available unit. This
 * is the replay contract for that defense: an empty city is no longer a free
 * capture, militia scales with unlocked tiers, neutral cities defend from the
 * neutral roster, turrets fire, a sufficient force still wins, and none of the
 * free defenders are ever looted, transferred, or persisted — all bit-exact.
 *
 * The fixtures are self-contained (the engine holds no balance data): a british
 * defender roster, a pirates roster (the neutral-city roster and the attacker's
 * units), and hand-authored turret stat rows that grow with tier so "turret
 * strength follows the highest available tier" is a decisive assertion.
 */

// Defender roster (british) and neutral/attacker roster (pirates). Ids are shared
// between the recruit catalog (tier/faction) and the combat snapshot (board stats).
const DEFENDER_UNITS = [
  { id: 'b1', factionId: 'british', tier: 1 as const, attack: 3, defense: 1, health: 7, speed: 5 },
  { id: 'b2', factionId: 'british', tier: 2 as const, attack: 5, defense: 3, health: 14, speed: 4 },
  { id: 'b3', factionId: 'british', tier: 3 as const, attack: 9, defense: 6, health: 24, speed: 5 },
]
const NEUTRAL_UNITS = [
  { id: 'k1', factionId: 'pirates', tier: 1 as const, attack: 3, defense: 0, health: 7, speed: 6 },
  { id: 'k2', factionId: 'pirates', tier: 2 as const, attack: 5, defense: 2, health: 12, speed: 6 },
]
// A deliberately gappy roster (tiers 1 and 3, no tier 2): proves the turret id
// is derived from tiers that actually exist, not from the raw unlocked tier.
const GAPPY_UNITS = [
  { id: 's1', factionId: 'spanish', tier: 1 as const, attack: 2, defense: 3, health: 8, speed: 4 },
  { id: 's3', factionId: 'spanish', tier: 3 as const, attack: 8, defense: 6, health: 22, speed: 5 },
]
// Attacker's heavy troop — strong enough to storm a defended city.
const BRUTE = { id: 'brute', factionId: 'pirates', tier: 3 as const, attack: 16, defense: 8, health: 44, speed: 5 } // prettier-ignore

// Hand-authored turrets: stationary, ranged, stats climbing with tier so a
// higher-tier city fields a stronger turret. In production @aop/content derives
// these from the highest available unit; here we author them directly.
const TURRETS = [
  {
    id: 'turret:british:1',
    attack: 3,
    defense: 1,
    health: 7,
    speed: 3,
    range: 4,
    stationary: true,
  },
  { id: 'turret:british:2', attack: 5, defense: 3, health: 14, speed: 3, range: 4, stationary: true }, // prettier-ignore
  { id: 'turret:british:3', attack: 9, defense: 6, health: 24, speed: 3, range: 4, stationary: true }, // prettier-ignore
  {
    id: 'turret:pirates:1',
    attack: 3,
    defense: 0,
    health: 7,
    speed: 3,
    range: 4,
    stationary: true,
  },
  { id: 'turret:pirates:2', attack: 5, defense: 2, health: 12, speed: 3, range: 4, stationary: true }, // prettier-ignore
  // Gappy roster: turret rows exist ONLY for the tiers the roster actually has
  // (1 and 3) — exactly what @aop/content bakes. No turret:spanish:2.
  { id: 'turret:spanish:1', attack: 2, defense: 3, health: 8, speed: 3, range: 4, stationary: true }, // prettier-ignore
  { id: 'turret:spanish:3', attack: 8, defense: 6, health: 22, speed: 3, range: 4, stationary: true }, // prettier-ignore
]

const STATS: CombatStatsData = {
  units: [...DEFENDER_UNITS, ...NEUTRAL_UNITS, ...GAPPY_UNITS, BRUTE].map((u) => ({
    id: u.id,
    attack: u.attack,
    defense: u.defense,
    health: u.health,
    speed: u.speed,
  })).concat(TURRETS), // prettier-ignore
  ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }],
  combat: COMBAT_TUNING,
  tactics: TACTICS_TUNING,
  battle: BATTLE_TUNING,
}

const unitLike = (u: (typeof DEFENDER_UNITS)[number]) => [
  u.id,
  { factionId: u.factionId, tier: u.tier, goldCost: 30, weeklyGrowth: 5, attack: u.attack, defense: u.defense, health: u.health }, // prettier-ignore
]

const CATALOG: ContentCatalog = {
  buildings: {
    townhall: { produces: { gold: 100 }, cost: {} },
    barracks: { produces: {}, cost: { gold: 100 }, requires: 'townhall', unlocksTier: 1 },
    drill: { produces: {}, cost: { gold: 200 }, requires: 'barracks', unlocksTier: 2 },
    academy: { produces: {}, cost: { gold: 400 }, requires: 'drill', unlocksTier: 3 },
  },
  units: Object.fromEntries([...DEFENDER_UNITS, ...NEUTRAL_UNITS, ...GAPPY_UNITS, BRUTE].map(unitLike)), // prettier-ignore
  ships: { sloop: { hull: 40, cannons: 6, speed: 5, crewCapacity: 12, upgrades: {} } },
  skills: {},
  captainXpThresholds: [0, 150, 400, 800, 1400],
  resourceNodes: {},
  cityDefense: { militiaPerType: 5, turretCount: 2, neutralRosterFactionId: 'pirates' },
}

/** The same catalog with the city-defense tuning removed — the pre-#435 baseline. */
const { cityDefense: _cityDefense, ...CATALOG_NO_DEFENSE } = CATALOG

function baseConfig(p2Faction: 'british' | 'spanish' = 'british'): GameConfig {
  return {
    seed: 7,
    mapSize: 'small',
    setup: GAME_SETUP,
    combatStats: STATS,
    content: CATALOG,
    aiTuning: AI_TUNING,
    players: [
      { id: 'p1', name: 'P1', faction: 'pirates', isAI: false },
      { id: 'p2', name: 'P2', faction: p2Faction, isAI: true },
    ],
  }
}

function city(buildings: string[], garrison: Record<string, number>, ownerId = 'p2'): CityState {
  return {
    id: 'c1',
    ownerId,
    name: 'C',
    position: { x: 0, y: 0 },
    buildings,
    builtThisRound: false,
    garrison,
    unitAvailability: {},
  }
}

/** Land p1's captain one tile off the target city, carrying `attackerTroops`. */
function assaultState(opts: {
  attackerTroops: { unitId: string; count: number }[]
  buildings: string[]
  garrison: Record<string, number>
  ownerId?: string
  p2Faction?: 'british' | 'spanish'
}): { state: GameState; p1capId: string; targetCityId: string } {
  const state = createGame(baseConfig(opts.p2Faction))
  const p1cap = captainsOf(state, 'p1')[0]!
  const target = state.cities.find((c) => c.ownerId === 'p2')!
  const adjacent = { x: target.position.x + 1, y: target.position.y }
  const captains = state.captains.map((c) =>
    c.id === p1cap.id ? { ...c, position: adjacent, troops: opts.attackerTroops } : c,
  )
  return {
    state: {
      ...state,
      captains,
      cities: state.cities.map((c) =>
        c.id === target.id
          ? {
              ...c,
              ownerId: opts.ownerId ?? c.ownerId,
              buildings: opts.buildings,
              garrison: opts.garrison,
            }
          : c,
      ),
    },
    p1capId: p1cap.id,
    targetCityId: target.id,
  }
}

const idsOf = (troops: { unitId: string }[]) => troops.map((t) => t.unitId)
const countOf = (troops: { unitId: string; count: number }[], id: string) =>
  troops.filter((t) => t.unitId === id).reduce((s, t) => s + t.count, 0)

describe('cityDefenderTroops (#435)', () => {
  it('adds 5 militia of every unit type at the unlocked tier, plus two turrets', () => {
    const troops = cityDefenderTroops(
      city(['townhall', 'barracks', 'drill'], {}),
      CATALOG,
      'british',
    )
    expect(countOf(troops, 'b1')).toBe(5)
    expect(countOf(troops, 'b2')).toBe(5)
    expect(idsOf(troops)).not.toContain('b3') // tier 3 not unlocked
    // Highest available tier is 2 → two tier-2 turrets, appended last.
    expect(countOf(troops, 'turret:british:2')).toBe(2)
    expect(troops.filter((t) => t.unitId.startsWith('turret:'))).toHaveLength(2)
  })

  it('militia and turret strength scale with the unlocked recruitment tier', () => {
    const t1 = cityDefenderTroops(city(['townhall', 'barracks'], {}), CATALOG, 'british')
    const t3 = cityDefenderTroops(
      city(['townhall', 'barracks', 'drill', 'academy'], {}),
      CATALOG,
      'british',
    )
    // Tier 1: only b1 militia + tier-1 turret. Tier 3: b1/b2/b3 militia + tier-3 turret.
    expect(idsOf(t1)).toContain('turret:british:1')
    expect(countOf(t3, 'b3')).toBe(5)
    expect(idsOf(t3)).toContain('turret:british:3')
    const stats = createCombatStats(STATS)
    const s1 = combatantStrength(cityToCombatant(city(['townhall', 'barracks'], {}), CATALOG, 'british'), stats) // prettier-ignore
    const s3 = combatantStrength(
      cityToCombatant(city(['townhall', 'barracks', 'drill', 'academy'], {}), CATALOG, 'british'),
      stats,
    )
    expect(s3).toBeGreaterThan(s1)
  })

  it('merges militia into an existing garrison rather than replacing it', () => {
    const troops = cityDefenderTroops(city(['townhall', 'barracks'], { b1: 3 }), CATALOG, 'british')
    expect(countOf(troops, 'b1')).toBe(8) // 3 recruited + 5 militia
  })

  it('arms a neutral city from the neutral roster (pirates)', () => {
    const troops = cityDefenderTroops(
      city(['townhall', 'barracks'], {}, 'neutral'),
      CATALOG,
      undefined,
    )
    expect(countOf(troops, 'k1')).toBe(5)
    expect(countOf(troops, 'turret:pirates:1')).toBe(2)
  })

  it('fields no militia or turrets without city-defense tuning (pre-#435 baseline)', () => {
    const troops = cityDefenderTroops(
      city(['townhall', 'barracks'], { b1: 2 }),
      CATALOG_NO_DEFENSE,
      'british',
    )
    expect(troops).toEqual([{ unitId: 'b1', count: 2 }])
  })

  it('fields no militia or turrets when no recruit tier is unlocked', () => {
    const troops = cityDefenderTroops(city(['townhall'], { b1: 1 }), CATALOG, 'british')
    expect(troops).toEqual([{ unitId: 'b1', count: 1 }])
  })

  it('derives the turret from the highest tier that exists in a gappy roster', () => {
    // Spanish roster has tiers 1 and 3 only. Unlocking tier 2 must field a
    // tier-1 turret — never `turret:spanish:2`, which has no stats behind it.
    const t2 = cityDefenderTroops(city(['townhall', 'barracks', 'drill'], {}), CATALOG, 'spanish')
    expect(countOf(t2, 's1')).toBe(5)
    expect(countOf(t2, 'turret:spanish:1')).toBe(2)
    expect(idsOf(t2)).not.toContain('turret:spanish:2')
    // Unlocking tier 3 reaches the roster's next real tier.
    const t3 = cityDefenderTroops(
      city(['townhall', 'barracks', 'drill', 'academy'], {}),
      CATALOG,
      'spanish',
    )
    expect(countOf(t3, 'turret:spanish:3')).toBe(2)
  })
})

describe('attackCity — militia stops the free capture (#435)', () => {
  it('a weak force can no longer snipe an empty-garrison city', () => {
    const { state, p1capId, targetCityId } = assaultState({
      attackerTroops: [{ unitId: 'k1', count: 1 }],
      buildings: ['townhall', 'barracks'],
      garrison: {},
    })
    const next = applyAction(state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: p1capId,
      targetCityId,
    })
    const c = next.cities.find((x) => x.id === targetCityId)!
    expect(c.ownerId).toBe('p2') // militia held the city
    expect(next.captains.find((x) => x.id === p1capId)!.captured).toBe(true)
  })

  it('a sufficient force still storms a defended city', () => {
    const { state, p1capId, targetCityId } = assaultState({
      attackerTroops: [{ unitId: 'brute', count: 14 }],
      buildings: ['townhall', 'barracks'],
      garrison: {},
    })
    const { state: next, battleReport } = applyActionWithOutcome(state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: p1capId,
      targetCityId,
    })
    const c = next.cities.find((x) => x.id === targetCityId)!
    expect(c.ownerId).toBe('p1')
    expect(c.garrison).toEqual({})
    // The captor loots only its own troops — never militia or turrets.
    const cap = next.captains.find((x) => x.id === p1capId)!
    expect(idsOf(cap.troops)).toEqual(['brute'])
    expect(cap.troops.some((t) => t.unitId.startsWith('turret:'))).toBe(false)
    expect(battleReport!.board!.context).toBe('land')
  })

  it('turrets fire a ranged shot during the assault', () => {
    const { state, p1capId, targetCityId } = assaultState({
      attackerTroops: [{ unitId: 'brute', count: 14 }],
      buildings: ['townhall', 'barracks'],
      garrison: {},
    })
    const { battleReport } = applyActionWithOutcome(state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: p1capId,
      targetCityId,
    })
    const board = battleReport!.board!
    const turretIds = new Set(
      board.stacks.filter((s) => s.unitId.startsWith('turret:')).map((s) => s.id),
    )
    expect(turretIds.size).toBe(2)
    const turretShots = board.events.filter(
      (e) =>
        (e.type === 'attack' || e.type === 'retaliation') &&
        turretIds.has(e.stackId) &&
        'ranged' in e &&
        e.ranged === true,
    )
    expect(turretShots.length).toBeGreaterThan(0)
  })

  it('a defended city keeps only recruited troops — militia and turrets never persist', () => {
    const { state, p1capId, targetCityId } = assaultState({
      attackerTroops: [{ unitId: 'k1', count: 1 }],
      buildings: ['townhall', 'barracks', 'drill', 'academy'],
      garrison: { b3: 2 },
    })
    const next = applyAction(state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: p1capId,
      targetCityId,
    })
    const c = next.cities.find((x) => x.id === targetCityId)!
    expect(c.ownerId).toBe('p2')
    // Only the recruited unit id may remain, clamped to what was recruited; no
    // militia-only type (b1/b2) and no turret leaks into the persisted garrison.
    expect(Object.keys(c.garrison).every((id) => id === 'b3')).toBe(true)
    expect(c.garrison.b3 ?? 0).toBeLessThanOrEqual(2)
    expect(Object.keys(c.garrison).some((id) => id.startsWith('turret:'))).toBe(false)
  })

  it('a defense won with real casualties still never persists militia or turrets', () => {
    // 12 recruited b1 + 5 militia b1 + 2 turrets defend against a force strong
    // enough to inflict genuine losses but not to take the city.
    const { state, p1capId, targetCityId } = assaultState({
      attackerTroops: [{ unitId: 'brute', count: 1 }],
      buildings: ['townhall', 'barracks'],
      garrison: { b1: 12 },
    })
    const { state: next, battleReport } = applyActionWithOutcome(state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: p1capId,
      targetCityId,
    })
    const c = next.cities.find((x) => x.id === targetCityId)!
    expect(c.ownerId).toBe('p2') // the defense held...
    const survivors = battleReport!.survivingTroops!.defender
    const initial = 12 + 5 + 2 // recruited + militia + turrets
    const survivedTotal = survivors.reduce((s, t) => s + t.count, 0)
    expect(survivedTotal).toBeLessThan(initial) // ...but took real casualties.
    // The persisted garrison is each unit's survivors clamped to what was
    // recruited: casualties land on the free militia first, and neither
    // militia surplus nor turrets ever leak into city state.
    const survivedB1 = countOf(survivors, 'b1')
    expect(c.garrison).toEqual(survivedB1 > 0 ? { b1: Math.min(12, survivedB1) } : {})
    expect(c.garrison.b1 ?? 0).toBeLessThanOrEqual(12)
  })

  it('an assault on a gappy-roster city resolves instead of crashing (#435 audit)', () => {
    // p2 plays the spanish roster (tiers 1 and 3 only) with tier 2 unlocked:
    // the defender must field a tier-1 turret and the battle must resolve.
    const { state, p1capId, targetCityId } = assaultState({
      attackerTroops: [{ unitId: 'brute', count: 14 }],
      buildings: ['townhall', 'barracks', 'drill'],
      garrison: {},
      p2Faction: 'spanish',
    })
    const { state: next, battleReport } = applyActionWithOutcome(state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: p1capId,
      targetCityId,
    })
    const board = battleReport!.board!
    expect(board.stacks.filter((s) => s.unitId === 'turret:spanish:1')).toHaveLength(2)
    expect(next.cities.find((x) => x.id === targetCityId)!.ownerId).toBe('p1')
  })
})

describe('attackCity — neutral city defends (#435)', () => {
  it('a neutral city is no free grab, but yields to a strong force', () => {
    const weak = assaultState({
      attackerTroops: [{ unitId: 'k1', count: 1 }],
      buildings: ['townhall', 'barracks'],
      garrison: {},
      ownerId: 'neutral',
    })
    const afterWeak = applyAction(weak.state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: weak.p1capId,
      targetCityId: weak.targetCityId,
    })
    expect(afterWeak.cities.find((c) => c.id === weak.targetCityId)!.ownerId).toBe('neutral')

    const strong = assaultState({
      attackerTroops: [{ unitId: 'brute', count: 14 }],
      buildings: ['townhall', 'barracks'],
      garrison: {},
      ownerId: 'neutral',
    })
    const afterStrong = applyAction(strong.state, {
      type: 'attackCity',
      playerId: 'p1',
      captainId: strong.p1capId,
      targetCityId: strong.targetCityId,
    })
    expect(afterStrong.cities.find((c) => c.id === strong.targetCityId)!.ownerId).toBe('p1')
  })
})

describe('attackCity — determinism across the militia path (#435)', () => {
  it('replays bit-exact from the action log', () => {
    const { state, p1capId, targetCityId } = assaultState({
      attackerTroops: [{ unitId: 'brute', count: 8 }],
      buildings: ['townhall', 'barracks', 'drill'],
      garrison: { b2: 3 },
    })
    const log: Action[] = [{ type: 'attackCity', playerId: 'p1', captainId: p1capId, targetCityId }]
    expect(replay(state, log)).toEqual(replay(state, log))
    const a = applyActionWithOutcome(state, log[0]!)
    const b = applyActionWithOutcome(state, log[0]!)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
