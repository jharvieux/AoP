import { describe, expect, it } from 'vitest'
import {
  applyAction,
  captainsOf,
  createGame,
  currentPlayer,
  nextAiAction,
  replay,
  RULES_VERSION,
  runAiTurn,
  seedRng,
  type Action,
  type AiProfile,
  type Captain,
  type CityState,
  type CombatStatsData,
  type ContentCatalog,
  type GameConfig,
  type GameMap,
  type GameState,
  type LandingParty,
  type Tile,
  type TileType,
} from '../src'
import {
  AI_DIFFICULTIES,
  AI_PERSONALITIES,
  AI_TUNING,
  BATTLE_TUNING,
  COMBAT_TUNING,
  GAME_SETUP,
  TACTICS_TUNING,
} from './fixtures'

const STATS: CombatStatsData = {
  units: [
    { id: 'grunt', attack: 5, defense: 2, health: 12 },
    { id: 'elite', attack: 12, defense: 8, health: 40 },
    // Matches ECON_CATALOG's deckhand: recruitable from turn 1 via the starting
    // barracks (#434), so AI strength evaluation must be able to price it.
    { id: 'deckhand', attack: 2, defense: 1, health: 6 },
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

  it('never targets a captured enemy captain (#309)', () => {
    const base = placeAdjacent(createGame(config(8, 1)))
    const p2cap = captainsOf(base, 'p2')[0]!
    const state: GameState = {
      ...base,
      captains: base.captains.map((c) =>
        c.id === p2cap.id
          ? {
              ...c,
              captured: true,
              capturedBy: 'p1',
              troops: [],
              movementPoints: 0,
              maxMovementPoints: 0,
              captivityReturnRound: base.round + 5,
            }
          : c,
      ),
    }
    const action = nextAiAction(state, 'p1')
    expect(action.type).not.toBe('attackCaptain')
  })
})

describe('captain recovery (#308/#309)', () => {
  it('recruits a replacement captain when captain-less and affordable', () => {
    const base = createGame(config(5, 5))
    const state: GameState = { ...base, captains: base.captains.filter((c) => c.ownerId !== 'p1') }
    const action = nextAiAction(state, 'p1')
    expect(action).toEqual({ type: 'recruitCaptain', playerId: 'p1', cityId: 'p1-capital' })
  })

  it('recruits at the owned city closest to the front, not the first one (#373)', () => {
    // p1 owns two cities and has no captain. Its far capital sorts first, but
    // p2's capital — now p1's second city — sits right next to p2's captain,
    // the only enemy on the board. The AI must launch the replacement from the
    // front city, not whichever city happens to lead the array.
    const base = createGame(config(5, 5))
    const twoCity: GameState = {
      ...base,
      cities: base.cities.map((c) => (c.id === 'p2-capital' ? { ...c, ownerId: 'p1' } : c)),
      captains: base.captains.filter((c) => c.ownerId !== 'p1'),
    }
    const action = nextAiAction(twoCity, 'p1')
    expect(action).toEqual({ type: 'recruitCaptain', playerId: 'p1', cityId: 'p2-capital' })
  })

  it('ransoms an eligible captive when outnumbered and affordable', () => {
    // p1 keeps one live captain (so the higher-scoring planRecruitCaptain
    // stays out of the running — it only fires when captain-less) plus one
    // captive; p2 fields two live captains, so p1 is outnumbered 1-vs-2.
    const base = createGame(config(5, 5))
    const p1cap = captainsOf(base, 'p1')[0]!
    const p2cap = captainsOf(base, 'p2')[0]!
    const captiveP1Captain: Captain = {
      ...p1cap,
      id: `${p1cap.id}-captive`,
      captured: true,
      capturedBy: 'p2',
      troops: [],
      movementPoints: 0,
      maxMovementPoints: 0,
      captivityReturnRound: base.round + 5,
    }
    const extraP2Captain: Captain = { ...p2cap, id: `${p2cap.id}-2` }
    const state: GameState = {
      ...base,
      captains: [p1cap, captiveP1Captain, p2cap, extraP2Captain],
    }
    const action = nextAiAction(state, 'p1')
    expect(action).toEqual({
      type: 'ransomCaptain',
      playerId: 'p1',
      captainId: captiveP1Captain.id,
    })
  })

  it('does not re-ransom a captive that is already eligible for recruitment (#439)', () => {
    // Same outnumbered setup as the ransom test above, but the captive has
    // already served out its captivity — a second ransom is legal yet buys
    // nothing. Before the fix the AI paid its captor for the same captive
    // every time it had the gold, pinning itself below the recruitCaptain
    // price forever (observed in the full-game sims).
    const base = createGame(config(5, 5))
    const p1cap = captainsOf(base, 'p1')[0]!
    const p2cap = captainsOf(base, 'p2')[0]!
    const eligibleCaptive: Captain = {
      ...p1cap,
      id: `${p1cap.id}-captive`,
      captured: true,
      capturedBy: 'p2',
      troops: [],
      movementPoints: 0,
      maxMovementPoints: 0,
      captivityReturnRound: base.round,
    }
    const extraP2Captain: Captain = { ...p2cap, id: `${p2cap.id}-2` }
    const state: GameState = {
      ...base,
      captains: [p1cap, eligibleCaptive, p2cap, extraP2Captain],
    }
    expect(nextAiAction(state, 'p1').type).not.toBe('ransomCaptain')
  })

  it('does not ransom when not outnumbered', () => {
    const base = createGame(config(5, 5))
    const p1cap = captainsOf(base, 'p1')[0]!
    const p2cap = captainsOf(base, 'p2')[0]!
    const extraP1Captive: Captain = {
      ...p1cap,
      id: `${p1cap.id}-captive`,
      captured: true,
      capturedBy: 'p2',
      troops: [],
      movementPoints: 0,
      maxMovementPoints: 0,
      captivityReturnRound: base.round + 5,
    }
    const state: GameState = { ...base, captains: [p1cap, extraP1Captive, p2cap] }
    const action = nextAiAction(state, 'p1')
    expect(action.type).not.toBe('ransomCaptain')
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
function econConfig(startingBuildings: string[] = ['townhall', 'barracks']): GameConfig {
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
    const state = createGame(econConfig(['townhall']))
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

// --- Tavern gate on AI captain recovery (#433) ---

/** ECON_CATALOG plus the tavern that gates recruitCaptain (#433). */
const TAVERN_CATALOG: ContentCatalog = {
  ...ECON_CATALOG,
  buildings: {
    ...ECON_CATALOG.buildings,
    tavern: { produces: {}, cost: { gold: 100 }, requires: 'townhall', unlocksCaptains: true },
  },
}

/**
 * Captain-less p1 under a configured content catalog — the tavern-gated
 * recruit path, unlike the catalog-less captain-recovery tests above which
 * exercise the legacy ungated branch.
 */
function captainlessState(catalog: ContentCatalog): GameState {
  const base = createGame({ ...econConfig(), content: catalog })
  return { ...base, captains: base.captains.filter((c) => c.ownerId !== 'p1') }
}

describe('AI tavern gate (#433)', () => {
  it('never proposes recruitCaptain at a tavern-less city, and its turn completes without throwing', () => {
    // Mark the city built-this-round so the AI cannot fix its tavern gap this
    // turn: the only way back to a captain is a recruitCaptain the reducer
    // would reject. Without bestRecruitCity's tavern filter this is exactly
    // the crash class the gate introduced — planRecruitCaptain proposes it,
    // and runAiTurn's uncaught applyAction throws mid-turn.
    let state = captainlessState(TAVERN_CATALOG)
    const city = homeCity(state, 'p1')
    state = {
      ...state,
      cities: state.cities.map((c) => (c.id === city.id ? { ...c, builtThisRound: true } : c)),
    }
    expect(nextAiAction(state, 'p1').type).not.toBe('recruitCaptain')
    const after = runAiTurn(state, 'p1')
    expect(captainsOf(after, 'p1')).toHaveLength(0)
  })

  it('unblocks its own recovery: constructs the tavern during its turn and recruits a captain', () => {
    // buildTavernBonus must outrank every other constructible so a captain-less
    // AI prioritizes a building that produces nothing. The AI may recruit
    // garrison troops first (the starting barracks makes deckhands available
    // from turn 1, #434) — what matters is that the recovery arc completes
    // within the turn: tavern stands, captain hired.
    const state = captainlessState(TAVERN_CATALOG)
    const city = homeCity(state, 'p1')
    const after = runAiTurn(state, 'p1')
    const cityAfter = after.cities.find((c) => c.id === city.id)!
    expect(cityAfter.buildings).toContain('tavern')
    expect(captainsOf(after, 'p1').length).toBeGreaterThan(0)
  })
})

// --- Captain-less recovery balance (#439) ---

/**
 * TAVERN_CATALOG plus a gold building whose utility (80) matches the real
 * tree's ceiling (grandArsenal: unlocksTier 4 × weight 20) — the competitor
 * class that starved tavern construction at the old buildTavernBonus of 30.
 */
const RICH_CATALOG: ContentCatalog = {
  ...TAVERN_CATALOG,
  buildings: {
    ...TAVERN_CATALOG.buildings,
    goldmine: { produces: { gold: 80 }, cost: { gold: 300 }, requires: 'townhall' },
  },
}

describe('captain-less recovery (#439)', () => {
  it('a seat with a live captain builds economy, never an insurance tavern', () => {
    // The tavern bonus is need-aware: with a captain alive it scores its plain
    // utility (0 — it produces nothing), so the 80-utility goldmine wins.
    const state = createGame({ ...econConfig(), content: RICH_CATALOG })
    const city = homeCity(state, 'p1')
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'construct',
      playerId: 'p1',
      cityId: city.id,
      buildingId: 'goldmine',
    })
  })

  it('recovers within its turn even when the richest ordinary building competes', () => {
    // The failure the sims exposed at buildTavernBonus 30: a captain-less
    // mid-game seat kept picking higher-utility buildings and stayed locked
    // out of recruitCaptain for rounds. The tuned bonus (100) must outrank
    // the 80-utility ceiling so tavern-then-captain completes in one turn.
    const state = captainlessState(RICH_CATALOG)
    const after = runAiTurn(state, 'p1')
    expect(homeCity(after, 'p1').buildings).toContain('tavern')
    expect(captainsOf(after, 'p1').some((c) => !c.captured)).toBe(true)
  })

  it('holds the comeback captain’s price instead of spending it on garrison troops', () => {
    // Gold 500 covers the reserve (150) but not reserve + captain (550): a
    // captain-less seat must not recruit. The same gold with a live captain
    // is spent freely — the fund only exists while recovering.
    const decide = (captainless: boolean) => {
      let state = createGame(econConfig(['townhall', 'barracks']))
      const city = homeCity(state, 'p1')
      state = {
        ...state,
        players: state.players.map((p) =>
          p.id === 'p1' ? { ...p, resources: { ...p.resources, gold: 500 } } : p,
        ),
        cities: state.cities.map((c) =>
          c.id === city.id ? { ...c, builtThisRound: true, unitAvailability: { deckhand: 10 } } : c,
        ),
        captains: captainless ? state.captains.filter((c) => c.ownerId !== 'p1') : state.captains,
      }
      return nextAiAction(state, 'p1')
    }
    expect(decide(false).type).toBe('recruit')
    expect(decide(true).type).not.toBe('recruit')
  })

  it('a gold-poor seat saves income up to its comeback captain instead of idling (full arc)', () => {
    // The end-to-end arc #439 called out as untested: the AI lost its last
    // captain, has no tavern, and starts with only 250 gold — enough for the
    // tavern (100) but far short of the captain (400). It must build the
    // tavern, hold the recovery fund against troop recruitment and ordinary
    // construction, and hire the captain once townhall income accumulates.
    let state = captainlessState(TAVERN_CATALOG)
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p1' ? { ...p, resources: { ...p.resources, gold: 250 } } : p,
      ),
    }
    const recovered = (s: GameState) => captainsOf(s, 'p1').some((c) => !c.captured)
    let guard = 0
    while (!recovered(state) && state.round <= 8 && guard++ < 40) {
      state = runAiTurn(state, currentPlayer(state).id)
    }
    expect(homeCity(state, 'p1').buildings).toContain('tavern')
    expect(recovered(state)).toBe(true)
    // Income is 100/round from the townhall: tavern on round 1, captain as
    // soon as the fund reaches 400 — round 4. Idling past that means the
    // recovery fund leaked somewhere.
    expect(state.round).toBeLessThanOrEqual(5)
  })
})

describe('AI planners ignore captured captains (#439)', () => {
  it('a docked captured captain draws no skill picks, transfers, or upgrades — the turn completes', () => {
    // The crash class the sims hit: a captured captain sitting beside its own
    // city satisfied planSkillPick (unspent pick), planGarrisonToShip (docked,
    // garrison waiting), and planUpgrade (shipyard, affordable track), and the
    // reducer rejects all three for captured captains — runAiTurn threw.
    let state = createGame(econConfig(['townhall', 'barracks', 'shipyard']))
    const city = homeCity(state, 'p1')
    const cap = captainsOf(state, 'p1')[0]!
    state = {
      ...state,
      cities: state.cities.map((c) =>
        c.id === city.id ? { ...c, garrison: { deckhand: 10 } } : c,
      ),
      captains: state.captains.map((c) =>
        c.id === cap.id
          ? {
              ...c,
              position: { ...city.position },
              captured: true,
              capturedBy: 'p2',
              movementPoints: 0,
              maxMovementPoints: 0,
              xp: 200,
              captivityReturnRound: state.round + 5,
            }
          : c,
      ),
    }
    const after = runAiTurn(state, 'p1')
    const capAfter = after.captains.find((c) => c.id === cap.id)!
    expect(capAfter.captured).toBe(true)
    expect(capAfter.skills).toEqual([])
    expect(capAfter.shipUpgrades).toEqual({})
    expect(capAfter.troops).toEqual(cap.troops)
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

/**
 * AI landing-party operations (#475). The planner learns the five party verbs:
 * a captain disembarks a party for the captain-preserving attrition vector; a
 * party marches on, assaults, and intercepts; and a purposeless party re-embarks
 * or a threatened city is reinforced. These guard the two invariants the scope
 * calls out: every proposed party action is one the reducer accepts (so
 * `runAiTurn` never throws, whatever the party state — the crash class the #433
 * tavern-gate and #439 captured-captain tests guard for other verbs), and the
 * choice is a pure, replay-stable function of state. Board tuning is present, so
 * a land battle can resolve; the handcrafted island gives the precise placement
 * the procedural generator can't.
 */
const LAND_STATS: CombatStatsData = {
  units: [
    { id: 'grunt', attack: 5, defense: 2, health: 12 },
    { id: 'brute', attack: 16, defense: 8, health: 44 },
    { id: 'b1', attack: 3, defense: 1, health: 7 },
    { id: 'turret:british:1', attack: 3, defense: 1, health: 7, range: 4, stationary: true }, // prettier-ignore
    { id: 'turret:pirates:1', attack: 3, defense: 0, health: 7, range: 4, stationary: true }, // prettier-ignore
  ],
  ships: [{ id: 'sloop', hull: 40, cannons: 6, speed: 5 }],
  combat: COMBAT_TUNING,
  tactics: TACTICS_TUNING,
  battle: BATTLE_TUNING,
}

const LAND_CATALOG: ContentCatalog = {
  buildings: { townhall: { produces: { gold: 100 }, cost: {}, unlocksTier: 1 } },
  units: {
    grunt: { factionId: 'pirates', tier: 1, goldCost: 25, weeklyGrowth: 8, attack: 5, defense: 2, health: 12 }, // prettier-ignore
    brute: { factionId: 'pirates', tier: 3, goldCost: 150, weeklyGrowth: 2, attack: 16, defense: 8, health: 44 }, // prettier-ignore
    b1: { factionId: 'british', tier: 1, goldCost: 25, weeklyGrowth: 8, attack: 3, defense: 1, health: 7 }, // prettier-ignore
  },
  ships: { sloop: { hull: 40, cannons: 6, speed: 5, crewCapacity: 12, upgrades: {} } },
  skills: {},
  captainXpThresholds: [0, 150, 400, 800, 1400],
  cityDefense: { militiaPerType: 3, turretCount: 2, neutralRosterFactionId: 'pirates' },
}

/** One 8x4 island (land x4..11, y4..7); p2's port city at (11,5), p1's at (4,5). */
function landMap(): GameMap {
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
  tiles[5 * width + 4] = { type: 'port', island: 0 }
  return { width, height, tiles, startPositions: [] }
}

function landCaptain(
  id: string,
  ownerId: string,
  position: { x: number; y: number },
  troops: { unitId: string; count: number }[],
): Captain {
  return {
    id,
    ownerId,
    name: id,
    position,
    shipClassId: 'sloop',
    movementPoints: GAME_SETUP.startingCaptainMovement,
    maxMovementPoints: GAME_SETUP.startingCaptainMovement,
    troops,
    xp: 0,
    skills: [],
    shipUpgrades: {},
    captured: false,
  }
}

function landParty(
  id: string,
  ownerId: string,
  position: { x: number; y: number },
  troops: { unitId: string; count: number }[],
): LandingParty {
  return {
    id,
    ownerId,
    name: id,
    position,
    movementPoints: GAME_SETUP.partyMovementPoints,
    maxMovementPoints: GAME_SETUP.partyMovementPoints,
    troops,
  }
}

function p2CityAt(pos: { x: number; y: number }, garrison: Record<string, number>): CityState {
  return {
    id: 'p2-city',
    ownerId: 'p2',
    name: 'Port Royal',
    position: pos,
    buildings: ['townhall'],
    builtThisRound: false,
    garrison,
    unitAvailability: {},
  }
}

function landState(opts: {
  captains?: Captain[]
  parties?: LandingParty[]
  cities?: CityState[]
}): GameState {
  const seats = [
    { id: 'p1', name: 'One', faction: 'pirates' as const, isAI: true },
    { id: 'p2', name: 'Two', faction: 'british' as const, isAI: true },
  ]
  return {
    config: {
      seed: 1,
      mapSize: 'small',
      setup: GAME_SETUP,
      combatStats: LAND_STATS,
      content: LAND_CATALOG,
      aiTuning: AI_TUNING,
      aiPersonalities: AI_PERSONALITIES,
      aiDifficulties: AI_DIFFICULTIES,
      players: seats,
      rulesVersion: RULES_VERSION,
    },
    map: landMap(),
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
      aiProfile: { personality: 'opportunist' as const, difficulty: 'normal' as const },
    })),
    alliances: { pairs: [], proposals: [] },
    cities: opts.cities ?? [],
    captains: opts.captains ?? [],
    parties: opts.parties ?? [],
    encounters: [],
    resourceNodes: [],
    exploredTiles: {},
    rngState: seedRng(1),
    actionCount: 0,
    status: 'active',
    winnerId: null,
  }
}

describe('AI landing-party offense (#475)', () => {
  it('assaults an adjacent enemy city with a beatable party', () => {
    const state = landState({
      parties: [landParty('pa', 'p1', { x: 10, y: 5 }, [{ unitId: 'brute', count: 40 }])],
      cities: [p2CityAt({ x: 11, y: 5 }, { b1: 1 })],
    })
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'partyAssaultCity',
      playerId: 'p1',
      partyId: 'pa',
      targetCityId: 'p2-city',
    })
  })

  it('marches a distant party overland toward the enemy city (a reducer-valid step)', () => {
    const state = landState({
      parties: [landParty('pa', 'p1', { x: 4, y: 7 }, [{ unitId: 'brute', count: 40 }])],
      cities: [p2CityAt({ x: 11, y: 5 }, { b1: 1 })],
    })
    const action = nextAiAction(state, 'p1')
    expect(action.type).toBe('moveParty')
    // The step must be one the reducer accepts — the crash guard for marching.
    expect(() => applyAction(state, action)).not.toThrow()
  })

  it('disembarks a party rather than storming by sea when the wave is attrition-only', () => {
    // 6 grunts (strength 36) against a garrison of 10 b1 thickened to 15 by
    // militia plus 2 turrets — defender strength (10+5)×3.5 ≈ 52.5, ratio ≈ 0.69:
    // below the 0.9 engage gate but above the 0.40 attrition floor. The captain
    // sits on the shore beside the city's land ring, so it lands a party (a
    // repelled land assault costs only the party) instead of a sea assault (which
    // would cost it the captain).
    const state = landState({
      captains: [landCaptain('c1', 'p1', { x: 12, y: 5 }, [{ unitId: 'grunt', count: 6 }])],
      cities: [p2CityAt({ x: 11, y: 5 }, { b1: 10 })],
    })
    const action = nextAiAction(state, 'p1')
    expect(action.type).toBe('disembark')
    expect(() => applyAction(state, action)).not.toThrow()
  })

  it('intercepts an adjacent enemy party it can beat (the counter, #475)', () => {
    const state = landState({
      parties: [
        landParty('pa', 'p1', { x: 5, y: 4 }, [{ unitId: 'brute', count: 40 }]),
        landParty('pe', 'p2', { x: 6, y: 4 }, [{ unitId: 'b1', count: 1 }]),
      ],
    })
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'attackParty',
      playerId: 'p1',
      partyId: 'pa',
      targetPartyId: 'pe',
    })
  })
})

describe('AI landing-party logistics & counter (#475)', () => {
  it('re-embarks a purposeless party onto an adjacent friendly ship with room', () => {
    const state = landState({
      captains: [landCaptain('c1', 'p1', { x: 3, y: 4 }, [])],
      parties: [landParty('pa', 'p1', { x: 4, y: 4 }, [{ unitId: 'grunt', count: 6 }])],
    })
    expect(nextAiAction(state, 'p1')).toEqual({
      type: 'embark',
      playerId: 'p1',
      partyId: 'pa',
      captainId: 'c1',
    })
  })

  it('reinforces a threatened city from a docked captain (transfer to garrison)', () => {
    const state = landState({
      captains: [landCaptain('c1', 'p1', { x: 3, y: 5 }, [{ unitId: 'grunt', count: 6 }])],
      parties: [landParty('pe', 'p2', { x: 5, y: 5 }, [{ unitId: 'b1', count: 3 }])],
      cities: [
        {
          id: 'p1-city',
          ownerId: 'p1',
          name: 'Home',
          position: { x: 4, y: 5 },
          buildings: ['townhall'],
          builtThisRound: false,
          garrison: {},
          unitAvailability: {},
        },
      ],
    })
    const action = nextAiAction(state, 'p1')
    expect(action.type).toBe('transferTroops')
    if (action.type === 'transferTroops') {
      expect(action.direction).toBe('toGarrison')
      expect(action.cityId).toBe('p1-city')
    }
    expect(() => applyAction(state, action)).not.toThrow()
  })
})

describe('AI landing-party crash-safety & determinism (#475)', () => {
  const scenarios: Record<string, () => GameState> = {
    'party assaulting a city': () =>
      landState({
        parties: [landParty('pa', 'p1', { x: 10, y: 5 }, [{ unitId: 'brute', count: 40 }])],
        cities: [p2CityAt({ x: 11, y: 5 }, { b1: 1 })],
      }),
    'party marching to a city': () =>
      landState({
        parties: [landParty('pa', 'p1', { x: 4, y: 7 }, [{ unitId: 'grunt', count: 6 }])],
        cities: [p2CityAt({ x: 11, y: 5 }, { b1: 4 })],
      }),
    'captain able to disembark': () =>
      landState({
        captains: [landCaptain('c1', 'p1', { x: 12, y: 5 }, [{ unitId: 'grunt', count: 6 }])],
        cities: [p2CityAt({ x: 11, y: 5 }, { b1: 10 })],
      }),
    'stranded party, no ship, no target': () =>
      landState({
        parties: [landParty('pa', 'p1', { x: 5, y: 5 }, [{ unitId: 'grunt', count: 3 }])],
      }),
    'party facing a stronger enemy party (no winnable strike)': () =>
      landState({
        parties: [
          landParty('pa', 'p1', { x: 5, y: 4 }, [{ unitId: 'grunt', count: 1 }]),
          landParty('pe', 'p2', { x: 6, y: 4 }, [{ unitId: 'brute', count: 40 }]),
        ],
      }),
    'threatened city with a docked captain': () =>
      landState({
        captains: [landCaptain('c1', 'p1', { x: 3, y: 5 }, [{ unitId: 'grunt', count: 6 }])],
        parties: [landParty('pe', 'p2', { x: 5, y: 5 }, [{ unitId: 'b1', count: 3 }])],
        cities: [
          {
            id: 'p1-city',
            ownerId: 'p1',
            name: 'Home',
            position: { x: 4, y: 5 },
            buildings: ['townhall'],
            builtThisRound: false,
            garrison: {},
            unitAvailability: {},
          },
        ],
      }),
  }

  for (const [name, build] of Object.entries(scenarios)) {
    it(`runAiTurn completes without throwing: ${name}`, () => {
      const state = build()
      let after: GameState | undefined
      expect(() => {
        after = runAiTurn(state, 'p1')
      }).not.toThrow()
      // The turn ended (control passed on, or the match resolved) — never a stall.
      expect(after!.currentPlayerIndex === 1 || after!.status !== 'active').toBe(true)
    })
  }

  it('is a pure, replay-stable function of state', () => {
    const build = scenarios['party assaulting a city']!
    // Same input, same action — no hidden per-turn state.
    expect(nextAiAction(build(), 'p1')).toEqual(nextAiAction(build(), 'p1'))
    // And a whole turn replays bit-exact.
    expect(JSON.stringify(runAiTurn(build(), 'p1'))).toBe(JSON.stringify(runAiTurn(build(), 'p1')))
  })
})
