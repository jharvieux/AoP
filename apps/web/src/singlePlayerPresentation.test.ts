import { GAME_SETUP } from '@aop/content'
import {
  createGame,
  tileIndex,
  tileKey,
  type Captain,
  type CityState,
  type EncounterState,
  type GameConfig,
  type GameState,
  type GridTopology,
  type LandEncounterState,
  type LandingParty,
  type LandSiteState,
} from '@aop/engine'
import type { Coord } from '@aop/shared'
import { describe, expect, it } from 'vitest'
import { partyBlockedSet } from './partyMarch'
import { presentationCellOccupied, singlePlayerPresentationBoard } from './singlePlayerPresentation'

const VIEWER_ID = 'seat-0'
const ENEMY_ID = 'seat-1'
const ORIGIN = { x: 2, y: 2 }
const VISIBLE = { x: 3, y: 2 }
const REMEMBERED = { x: 20, y: 20 }
const UNEXPLORED = { x: 30, y: 30 }

function config(topology: GridTopology): GameConfig {
  return {
    seed: 623,
    mapSize: 'small',
    topology,
    setup: GAME_SETUP,
    players: [
      { id: VIEWER_ID, name: 'Anne', faction: 'pirates', isAI: false },
      { id: ENEMY_ID, name: 'Morgan', faction: 'british', isAI: true },
    ],
  }
}

function stateFor(topology: GridTopology): GameState {
  const base = createGame(config(topology))
  const captain = base.captains[0]!
  const city = base.cities[0]!
  const map = { ...base.map, topology, tiles: [...base.map.tiles] }
  map.tiles[tileIndex(map, VISIBLE.x, VISIBLE.y)] = { type: 'shallows', island: -1 }
  map.tiles[tileIndex(map, REMEMBERED.x, REMEMBERED.y)] = { type: 'port', island: 4 }
  map.tiles[tileIndex(map, UNEXPLORED.x, UNEXPLORED.y)] = { type: 'land', island: 7 }

  const enemyCaptain = (id: string, position: Coord): Captain => ({
    ...captain,
    id,
    ownerId: ENEMY_ID,
    name: id,
    position,
  })
  const enemyCity = (id: string, position: Coord, secret: string): CityState => ({
    ...city,
    id,
    ownerId: ENEMY_ID,
    name: id,
    position,
    buildings: [secret],
    garrison: { [secret]: 9 },
    unitAvailability: { [secret]: 7 },
  })
  const party = (id: string, ownerId: string, position: Coord): LandingParty => ({
    id,
    ownerId,
    name: id,
    position,
    movementPoints: 2,
    maxMovementPoints: 2,
    troops: [{ unitId: 'swashbuckler', count: 3 }],
  })
  const encounter = (id: string, position: Coord): EncounterState => ({
    id,
    kind: 'merchant',
    position,
    active: true,
    respawnRound: null,
  })
  const site = (id: string, position: Coord): LandSiteState => ({
    id,
    kind: 'mine',
    position,
    active: true,
    claimedBy: ENEMY_ID,
  })
  const landEncounter = (id: string, position: Coord): LandEncounterState => ({
    id,
    kind: 'hermit',
    position,
    active: true,
    respawnRound: null,
  })

  return {
    ...base,
    map,
    cities: [
      { ...city, id: 'own-city', ownerId: VIEWER_ID, position: ORIGIN },
      enemyCity('visible-city', VISIBLE, 'visible-secret'),
      enemyCity('remembered-city', REMEMBERED, 'remembered-secret'),
      enemyCity('unexplored-city', UNEXPLORED, 'unexplored-secret'),
    ],
    captains: [
      { ...captain, id: 'own-captain', ownerId: VIEWER_ID, position: ORIGIN },
      enemyCaptain('visible-captain', VISIBLE),
      enemyCaptain('remembered-captain', REMEMBERED),
      enemyCaptain('unexplored-captain', UNEXPLORED),
    ],
    parties: [
      party('own-party', VIEWER_ID, ORIGIN),
      party('visible-party', ENEMY_ID, VISIBLE),
      party('remembered-party', ENEMY_ID, REMEMBERED),
      party('unexplored-party', ENEMY_ID, UNEXPLORED),
    ],
    encounters: [
      encounter('visible-encounter', VISIBLE),
      encounter('remembered-encounter', REMEMBERED),
      encounter('unexplored-encounter', UNEXPLORED),
    ],
    landSites: [
      site('visible-site', VISIBLE),
      site('remembered-site', REMEMBERED),
      site('unexplored-site', UNEXPLORED),
    ],
    landEncounters: [
      landEncounter('visible-land-encounter', VISIBLE),
      landEncounter('remembered-land-encounter', REMEMBERED),
      landEncounter('unexplored-land-encounter', UNEXPLORED),
    ],
    exploredTiles: {
      ...base.exploredTiles,
      [VIEWER_ID]: [tileKey(ORIGIN), tileKey(VISIBLE), tileKey(REMEMBERED)],
    },
  }
}

describe.each(['square', 'hex'] as const)('single-player %s presentation privacy', (topology) => {
  const state = stateFor(topology)
  const board = singlePlayerPresentationBoard(state, VIEWER_ID)

  it('retains exact own entities so local-only command fields stay available', () => {
    expect(board.captains.find((captain) => captain.id === 'own-captain')).toBe(state.captains[0])
    expect(board.cities.find((city) => city.id === 'own-city')).toBe(state.cities[0])
    expect(board.parties.find((party) => party.id === 'own-party')).toBe(state.parties[0])
  })

  it('replaces unexplored terrain while retaining visible and remembered terrain', () => {
    expect(board.map.topology).toBe(topology)
    expect(board.map.tiles[tileIndex(board.map, VISIBLE.x, VISIBLE.y)]?.type).toBe('shallows')
    expect(board.map.tiles[tileIndex(board.map, REMEMBERED.x, REMEMBERED.y)]?.type).toBe('port')
    expect(board.map.tiles[tileIndex(board.map, UNEXPLORED.x, UNEXPLORED.y)]).toEqual({
      type: 'deep',
      island: -1,
    })
  })

  it('keeps mobile/content entities only in current visibility', () => {
    expect(board.captains.map((captain) => captain.id)).toEqual(['own-captain', 'visible-captain'])
    expect(board.parties.map((party) => party.id)).toEqual(['own-party', 'visible-party'])
    expect(board.captains.find((captain) => captain.id === 'visible-captain')?.troops).toEqual([])
    expect(board.parties.find((party) => party.id === 'visible-party')?.troops).toEqual([])
    expect(board.encounters.map((encounter) => encounter.id)).toEqual(['visible-encounter'])
    expect(board.landSites.map((site) => site.id)).toEqual(['visible-site'])
    expect(board.landEncounters.map((encounter) => encounter.id)).toEqual([
      'visible-land-encounter',
    ])
  })

  it('omits never-explored cities and reduces remembered cities to inert landmarks', () => {
    expect(board.cities.map((city) => city.id)).toEqual([
      'own-city',
      'visible-city',
      'remembered-city',
    ])
    expect(board.cities.find((city) => city.id === 'visible-city')?.buildings).toEqual([
      'visible-secret',
    ])
    expect(board.cities.find((city) => city.id === 'remembered-city')).toMatchObject({
      buildings: [],
      garrison: {},
      unitAvailability: {},
    })
  })

  it('keeps hidden parties out of route blockers while retaining visible blockers', () => {
    const blocked = partyBlockedSet(board.map, board.parties, 'own-party')
    expect(blocked.has(tileIndex(board.map, VISIBLE.x, VISIBLE.y))).toBe(true)
    expect(blocked.has(tileIndex(board.map, REMEMBERED.x, REMEMBERED.y))).toBe(false)
    expect(blocked.has(tileIndex(board.map, UNEXPLORED.x, UNEXPLORED.y))).toBe(false)
  })

  it('treats a remembered city as occupied without exposing hidden mobile occupants', () => {
    expect(presentationCellOccupied(VISIBLE, board)).toBe(true)
    expect(presentationCellOccupied(REMEMBERED, board)).toBe(true)
    expect(presentationCellOccupied(UNEXPLORED, board)).toBe(false)
  })
})

it('treats a visible active land site as touch-occupied', () => {
  expect(
    presentationCellOccupied(
      { x: 4, y: 5 },
      {
        captains: [],
        cities: [],
        parties: [],
        encounters: [],
        landSites: [{ position: { x: 4, y: 5 }, active: true }],
        landEncounters: [],
      },
    ),
  ).toBe(true)
})
