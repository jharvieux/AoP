import { describe, expect, it } from 'vitest'
import { tileIndex, type PlayerView } from '@aop/engine'
import { boardFromPlayerView } from './playerViewBoard'

/** A minimal 2x2-map PlayerView, viewer is seat-0. Override per test. */
function view(over: Partial<PlayerView> = {}): PlayerView {
  return {
    viewerId: 'seat-0',
    round: 3,
    currentPlayerIndex: 0,
    status: 'active',
    winnerId: null,
    rules: { setup: {} as PlayerView['rules']['setup'], mapSize: 'small' },
    mapWidth: 2,
    mapHeight: 2,
    tiles: [
      { coord: { x: 0, y: 0 }, type: 'port', island: 0, visible: true },
      { coord: { x: 1, y: 0 }, type: 'shallows', island: -1, visible: false },
    ],
    players: [
      {
        id: 'seat-0',
        name: 'Anne',
        faction: 'pirates',
        isAI: false,
        eliminated: false,
        reputation: 0,
      },
      {
        id: 'seat-1',
        name: 'Bart',
        faction: 'british',
        isAI: false,
        eliminated: false,
        reputation: 0,
      },
    ],
    cities: [{ id: 'city-0', ownerId: 'seat-0', name: 'Nassau', position: { x: 0, y: 0 } }],
    captains: [
      {
        id: 'cap-0',
        ownerId: 'seat-0',
        name: 'Anne',
        position: { x: 0, y: 0 },
        shipClassId: 'sloop',
        troops: [{ unitId: 'swashbuckler', count: 6 }],
        captured: false,
      },
    ],
    parties: [],
    encounters: [{ id: 'enc-0', kind: 'merchant', position: { x: 1, y: 0 }, active: true }],
    alliances: { allies: [], outgoingProposals: [], incomingProposals: [] },
    rngState: null,
    ...over,
  }
}

describe('boardFromPlayerView', () => {
  it('builds a full-sized map, filling only explored cells with real tile data', () => {
    const { map } = boardFromPlayerView(view())
    expect(map.width).toBe(2)
    expect(map.height).toBe(2)
    expect(map.tiles).toHaveLength(4)
    expect(map.tiles[tileIndex(map, 0, 0)]).toEqual({ type: 'port', island: 0 })
    expect(map.tiles[tileIndex(map, 1, 0)]).toEqual({ type: 'shallows', island: -1 })
    // Never-explored cells are filled with an inert placeholder, never left undefined.
    expect(map.tiles[tileIndex(map, 0, 1)]).toEqual({ type: 'deep', island: -1 })
  })

  it('splits tiles into visible-now vs merely-explored key sets', () => {
    const { visibleKeys, exploredKeys } = boardFromPlayerView(view())
    expect(visibleKeys.has('0,0')).toBe(true)
    expect(visibleKeys.has('1,0')).toBe(false)
    expect(exploredKeys.has('0,0')).toBe(true)
    expect(exploredKeys.has('1,0')).toBe(true)
    expect(exploredKeys.has('1,1')).toBe(false)
  })

  it('carries the viewer own captain/city fields through unchanged', () => {
    const { captains, cities } = boardFromPlayerView(view())
    expect(captains).toEqual([
      {
        id: 'cap-0',
        ownerId: 'seat-0',
        name: 'Anne',
        position: { x: 0, y: 0 },
        shipClassId: 'sloop',
        movementPoints: 0,
        maxMovementPoints: 0,
        troops: [{ unitId: 'swashbuckler', count: 6 }],
        xp: 0,
        skills: [],
        shipUpgrades: {},
        captured: false,
      },
    ])
    expect(cities).toEqual([
      {
        id: 'city-0',
        ownerId: 'seat-0',
        name: 'Nassau',
        position: { x: 0, y: 0 },
        buildings: [],
        builtThisRound: false,
        garrison: {},
        unitAvailability: {},
      },
    ])
  })

  it('fills in an enemy hull-only captain and city with inert defaults for hidden fields', () => {
    const enemyView = view({
      captains: [
        {
          id: 'cap-1',
          ownerId: 'seat-1',
          name: 'Bart',
          position: { x: 1, y: 0 },
          shipClassId: 'sloop',
          captured: false,
        },
      ],
      cities: [{ id: 'city-1', ownerId: 'seat-1', name: 'Tortuga', position: { x: 1, y: 0 } }],
    })
    const { captains, cities } = boardFromPlayerView(enemyView)
    expect(captains[0]!.troops).toEqual([])
    expect(cities[0]!.buildings).toEqual([])
  })

  it('resolves factionOf from the view player roster', () => {
    const { factionOf } = boardFromPlayerView(view())
    expect(factionOf('seat-0')).toBe('pirates')
    expect(factionOf('seat-1')).toBe('british')
  })

  it('falls back to the first player faction for an unknown owner id', () => {
    const { factionOf } = boardFromPlayerView(view())
    expect(factionOf('nobody')).toBe('pirates')
  })

  it('carries encounters through with a null respawnRound (never disclosed to a viewer)', () => {
    const { encounters } = boardFromPlayerView(view())
    expect(encounters).toEqual([
      { id: 'enc-0', kind: 'merchant', position: { x: 1, y: 0 }, active: true, respawnRound: null },
    ])
  })

  it('reconstructs a hex match as hex, so client distance/adjacency/rendering dispatch hex (#379)', () => {
    const { map } = boardFromPlayerView(view({ topology: 'hex' }))
    expect(map.topology).toBe('hex')
  })

  it('defaults to square when the view omits topology (old snapshots) (#379)', () => {
    // GameMap treats an absent topology as square (mapTopology), so leaving it
    // unset here is correct — not a bug to paper over with an explicit 'square'.
    const { map } = boardFromPlayerView(view())
    expect(map.topology).toBeUndefined()
  })
})
