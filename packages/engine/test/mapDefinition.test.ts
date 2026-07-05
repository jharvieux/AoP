import { describe, expect, it } from 'vitest'
import type { Coord } from '@aop/shared'
import {
  captainsOf,
  createGame,
  generateMap,
  mapToDefinition,
  replay,
  validateMapDefinition,
  type Action,
  type EncounterKind,
  type GameConfig,
  type MapDefinition,
  type ResourceNodeKind,
  type Tile,
} from '../src'
import { GAME_SETUP, MAP_VALIDATION_LIMITS } from './fixtures'

/** A blank all-deep-water map of the given size, with no start positions. */
function blankMap(width: number, height: number): MapDefinition {
  const tiles: Tile[] = Array.from({ length: width * height }, () => ({
    type: 'deep',
    island: -1,
  }))
  return { width, height, tiles, startPositions: [] }
}

function setTile(map: MapDefinition, c: Coord, type: Tile['type'], island: number) {
  map.tiles[c.y * map.width + c.x] = { type, island }
}

function testConfig(playerCount = 2): GameConfig {
  const factions = ['pirates', 'british', 'spanish', 'dutch'] as const
  return {
    seed: 7,
    mapSize: 'medium',
    setup: GAME_SETUP,
    players: Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      faction: factions[i % factions.length]!,
      isAI: i > 0,
    })),
  }
}

describe('mapToDefinition', () => {
  it('captures a generated map as an equal but independent copy', () => {
    const map = generateMap(7, 'medium', 4, GAME_SETUP.homeIslandRadius)
    const def = mapToDefinition(map)
    expect(def).toEqual(map)
    def.tiles[0]!.type = 'land'
    expect(map.tiles[0]!.type).not.toBe('land')
  })
})

describe('validateMapDefinition', () => {
  it('accepts a generated map with no errors', () => {
    const map = generateMap(11, 'medium', 4, GAME_SETUP.homeIslandRadius)
    const result = validateMapDefinition(mapToDefinition(map), MAP_VALIDATION_LIMITS)
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('flags a tile-count mismatch and stops further (tile-indexed) checks', () => {
    const def: MapDefinition = {
      width: 5,
      height: 5,
      tiles: [],
      startPositions: [{ x: 0, y: 0 }],
    }
    const result = validateMapDefinition(def, MAP_VALIDATION_LIMITS)
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.code)).toContain('tile-count-mismatch')
    // Bails out before indexing the (too-short) tiles array for the start position.
    expect(result.errors.map((e) => e.code)).not.toContain('start-not-water')
  })

  it('flags out-of-bounds map dimensions', () => {
    const map = blankMap(10, 10)
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(['width-out-of-bounds', 'height-out-of-bounds']),
    )
  })

  it('flags a start position that is not on water', () => {
    const map = blankMap(24, 24)
    setTile(map, { x: 1, y: 1 }, 'land', 0)
    map.startPositions = [{ x: 1, y: 1 }]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).toContain('start-not-water')
  })

  it('flags a water start position with no adjacent port', () => {
    const map = blankMap(24, 24)
    map.startPositions = [{ x: 5, y: 5 }]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).toContain('start-not-coastal')
  })

  it('flags duplicate start positions', () => {
    const map = blankMap(24, 24)
    map.startPositions = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).toContain('duplicate-start-position')
  })

  it('flags start positions crowded closer than the minimum distance', () => {
    const map = blankMap(24, 24)
    map.startPositions = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).toContain('starts-too-close')
  })

  it('flags home islands whose land areas are too unbalanced', () => {
    const map = blankMap(24, 24)
    // Island 0: a generous 3x3 block of land (9 tiles).
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) setTile(map, { x, y }, 'land', 0)
    }
    // Island 1: a single land tile.
    setTile(map, { x: 20, y: 20 }, 'land', 1)
    map.startPositions = [
      { x: 5, y: 0 },
      { x: 19, y: 19 },
    ]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).toContain('home-island-imbalance')
  })

  it('flags start positions that cannot reach each other by sea', () => {
    const map = blankMap(10, 10)
    // A solid land row splits the map into two disconnected water bodies —
    // no single 8-directional step can cross a full row of land.
    for (let x = 0; x < map.width; x++) setTile(map, { x, y: 5 }, 'land', 9)
    map.startPositions = [
      { x: 5, y: 0 },
      { x: 5, y: 9 },
    ]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).toContain('start-unreachable')
  })
})

describe('createGame with an authored map', () => {
  function authoredConfig(playerCount: number): GameConfig {
    const map = generateMap(3, 'small', playerCount, GAME_SETUP.homeIslandRadius)
    const config = testConfig(playerCount)
    return { ...config, mapDefinition: mapToDefinition(map) }
  }

  it('validates clean under content limits before use', () => {
    const config = authoredConfig(3)
    const result = validateMapDefinition(config.mapDefinition!, MAP_VALIDATION_LIMITS)
    expect(result.valid).toBe(true)
  })

  it('plays on the authored map instead of generating one', () => {
    const config = authoredConfig(3)
    const state = createGame(config)
    expect(state.map).toEqual(config.mapDefinition)
  })

  it('replays identically with an authored map, same as a generated one', () => {
    const config = authoredConfig(2)
    const base = createGame(config)
    const cap1 = captainsOf(base, 'p1')[0]!
    const log: Action[] = [
      { type: 'endTurn', playerId: 'p1' },
      { type: 'endTurn', playerId: 'p2' },
    ]
    const a = replay(createGame(config), log)
    const b = replay(createGame(config), log)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(captainsOf(a, 'p1')[0]!.id).toBe(cap1.id)
  })

  it('rejects an authored map whose start-position count does not match the player count', () => {
    const config = authoredConfig(4)
    const mismatched = { ...config, players: config.players.slice(0, 2) }
    expect(() => createGame(mismatched)).toThrow(/start positions/)
  })

  it('seeds GameState.encounters from authored placements instead of scattering', () => {
    const config = authoredConfig(2)
    const water = config.mapDefinition!.startPositions[0]!
    const withEncounters: GameConfig = {
      ...config,
      mapDefinition: {
        ...config.mapDefinition!,
        encounters: [{ kind: 'merchant', position: water }],
      },
    }
    const state = createGame(withEncounters)
    expect(state.encounters).toEqual([
      { id: 'enc-0', kind: 'merchant', position: water, active: true, respawnRound: null },
    ])
  })

  it('authored encounters do not consume any RNG draws (rngState untouched)', () => {
    const config = authoredConfig(2)
    const water = config.mapDefinition!.startPositions[0]!
    const withEncounters: GameConfig = {
      ...config,
      mapDefinition: {
        ...config.mapDefinition!,
        encounters: [{ kind: 'merchant', position: water }],
      },
    }
    const withoutEncounters: GameConfig = { ...config, mapDefinition: config.mapDefinition! }
    const a = createGame(withEncounters)
    const b = createGame(withoutEncounters)
    expect(a.rngState).toEqual(b.rngState)
  })

  it('seeds GameState.resourceNodes from authored placements (#101)', () => {
    const config = authoredConfig(2)
    const water = config.mapDefinition!.startPositions[0]!
    const withNodes: GameConfig = {
      ...config,
      mapDefinition: {
        ...config.mapDefinition!,
        resourceNodes: [{ kind: 'gold', position: water }],
      },
    }
    const state = createGame(withNodes)
    expect(state.resourceNodes).toEqual([{ id: 'res-0', kind: 'gold', position: water }])
  })

  it('authored resource nodes do not consume any RNG draws (rngState untouched)', () => {
    const config = authoredConfig(2)
    const water = config.mapDefinition!.startPositions[0]!
    const withNodes: GameConfig = {
      ...config,
      mapDefinition: {
        ...config.mapDefinition!,
        resourceNodes: [{ kind: 'gold', position: water }],
      },
    }
    const withoutNodes: GameConfig = { ...config, mapDefinition: config.mapDefinition! }
    const a = createGame(withNodes)
    const b = createGame(withoutNodes)
    expect(a.rngState).toEqual(b.rngState)
  })
})

describe('validateMapDefinition with authored encounters', () => {
  it('flags an encounter placed outside the map', () => {
    const map = blankMap(24, 24)
    map.startPositions = [{ x: 5, y: 5 }]
    map.encounters = [{ kind: 'merchant', position: { x: 99, y: 99 } }]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).toContain('encounter-out-of-bounds')
  })

  it('flags an encounter placed on land', () => {
    const map = blankMap(24, 24)
    setTile(map, { x: 2, y: 2 }, 'land', 0)
    map.startPositions = [{ x: 5, y: 5 }]
    map.encounters = [{ kind: 'natives', position: { x: 2, y: 2 } }]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).toContain('encounter-not-water')
  })

  it('accepts an encounter placed on navigable water', () => {
    const map = blankMap(24, 24)
    map.startPositions = [{ x: 5, y: 5 }]
    map.encounters = [{ kind: 'settlers', position: { x: 10, y: 10 } }]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).not.toContain('encounter-not-water')
    expect(result.errors.map((e) => e.code)).not.toContain('encounter-out-of-bounds')
  })

  it('flags an unrecognized encounter kind instead of letting it through to the reducer', () => {
    const map = blankMap(24, 24)
    map.startPositions = [{ x: 5, y: 5 }]
    // Simulates a hand-edited or corrupted map code (#63 tier-1 import) — an
    // untrusted-input boundary that must fail loud here, not crash later.
    map.encounters = [{ kind: 'bogus' as unknown as EncounterKind, position: { x: 10, y: 10 } }]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).toContain('encounter-invalid-kind')
    // Bails out of the bounds/water checks for that entry once the kind is bad.
    expect(result.errors.map((e) => e.code)).not.toContain('encounter-not-water')
  })
})

describe('validateMapDefinition with authored resource nodes', () => {
  it('flags a resource node placed outside the map', () => {
    const map = blankMap(24, 24)
    map.startPositions = [{ x: 5, y: 5 }]
    map.resourceNodes = [{ kind: 'gold', position: { x: 99, y: 99 } }]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).toContain('resource-node-out-of-bounds')
  })

  it('accepts a resource node placed on land (unlike encounters, no water-only restriction)', () => {
    const map = blankMap(24, 24)
    setTile(map, { x: 2, y: 2 }, 'land', 0)
    map.startPositions = [{ x: 5, y: 5 }]
    map.resourceNodes = [{ kind: 'iron', position: { x: 2, y: 2 } }]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).not.toContain('resource-node-out-of-bounds')
    expect(result.errors.map((e) => e.code)).not.toContain('resource-node-invalid-kind')
  })

  it('flags an unrecognized resource-node kind instead of letting it through to the reducer', () => {
    const map = blankMap(24, 24)
    map.startPositions = [{ x: 5, y: 5 }]
    // Simulates a hand-edited or corrupted map code (#63 tier-1 import) — an
    // untrusted-input boundary that must fail loud here, not crash later.
    map.resourceNodes = [
      { kind: 'bogus' as unknown as ResourceNodeKind, position: { x: 10, y: 10 } },
    ]
    const result = validateMapDefinition(map, MAP_VALIDATION_LIMITS)
    expect(result.errors.map((e) => e.code)).toContain('resource-node-invalid-kind')
    expect(result.errors.map((e) => e.code)).not.toContain('resource-node-out-of-bounds')
  })
})
