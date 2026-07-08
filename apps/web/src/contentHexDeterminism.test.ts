import {
  AI_TUNING,
  GAME_SETUP,
  MAP_VALIDATION_LIMITS,
  STARTING_MAP,
  STARTING_MAP_HEX,
  combatStatsData,
} from '@aop/content'
import { createGame, validateMapDefinition, type GameConfig, type MapDefinition } from '@aop/engine'
import { describe, expect, it } from 'vitest'
import { buildCatalog } from './catalog'
import { createDefaultPlayer, starterTroops } from './players'

/**
 * Content-migration determinism (#348, Phase 3). `STARTING_MAP` and
 * `STARTING_MAP_HEX` (see @aop/content's maps/) are the same authored layout
 * under the two topologies — this suite is the contract that the migration
 * didn't perturb either: both validate under the shared content limits, both
 * replay byte-identically across repeated loads, and the hex copy carries
 * the exact same resource/encounter/start-position counts as its square
 * source (guaranteed by the Phase 2 `squareMapToHexMap` bridge, verified
 * here end-to-end through `createGame`).
 */

function players() {
  return [createDefaultPlayer(0), createDefaultPlayer(1)].map((p) => ({
    ...p,
    startingTroops: starterTroops(p.faction),
  }))
}

function configFor(mapDefinition: MapDefinition): GameConfig {
  return {
    seed: 42,
    mapSize: 'small',
    mapDefinition,
    players: players(),
    setup: GAME_SETUP,
    combatStats: combatStatsData(),
    content: buildCatalog(),
    aiTuning: AI_TUNING,
  }
}

describe('starting map content migration (square -> hex)', () => {
  it('both the square and hex starting maps satisfy validateMapDefinition', () => {
    const square = validateMapDefinition(STARTING_MAP as MapDefinition, MAP_VALIDATION_LIMITS)
    const hex = validateMapDefinition(STARTING_MAP_HEX as MapDefinition, MAP_VALIDATION_LIMITS)
    expect(square.errors).toEqual([])
    expect(square.valid).toBe(true)
    expect(hex.errors).toEqual([])
    expect(hex.valid).toBe(true)
  })

  it('the hex map carries the same content as its square source, only the topology stamp differs', () => {
    expect('topology' in STARTING_MAP).toBe(false)
    expect(STARTING_MAP_HEX.topology).toBe('hex')
    expect(STARTING_MAP_HEX.tiles).toEqual(STARTING_MAP.tiles)
    expect(STARTING_MAP_HEX.startPositions).toEqual(STARTING_MAP.startPositions)
    expect(STARTING_MAP_HEX.resourceNodes).toHaveLength(STARTING_MAP.resourceNodes.length)
    expect(STARTING_MAP_HEX.resourceNodes).toEqual(STARTING_MAP.resourceNodes)
    expect(STARTING_MAP_HEX.encounters).toHaveLength(STARTING_MAP.encounters.length)
    expect(STARTING_MAP_HEX.encounters).toEqual(STARTING_MAP.encounters)
  })

  it('creating a game from the hex starting map is deterministic across 100 loads', () => {
    const config = configFor(STARTING_MAP_HEX as MapDefinition)
    const first = createGame(config)
    expect(first.map.topology).toBe('hex')
    for (let i = 0; i < 100; i++) {
      const state = createGame(config)
      expect(state).toEqual(first)
      // GameState must stay plain-JSON-serializable (engine invariant).
      expect(JSON.parse(JSON.stringify(state))).toEqual(state)
    }
  })

  it('creating a game from the square starting map remains deterministic (regression)', () => {
    const config = configFor(STARTING_MAP as MapDefinition)
    const first = createGame(config)
    expect(first.map.topology).toBeUndefined()
    for (let i = 0; i < 100; i++) {
      const state = createGame(config)
      expect(state).toEqual(first)
    }
  })

  it('the hex game seeds the same number of resource nodes, encounters, and captains as the square game', () => {
    const squareState = createGame(configFor(STARTING_MAP as MapDefinition))
    const hexState = createGame(configFor(STARTING_MAP_HEX as MapDefinition))
    expect(hexState.resourceNodes).toHaveLength(squareState.resourceNodes.length)
    expect(hexState.encounters).toHaveLength(squareState.encounters.length)
    expect(hexState.captains).toHaveLength(squareState.captains.length)
    expect(hexState.resourceNodes).toHaveLength(STARTING_MAP.resourceNodes.length)
    expect(hexState.encounters).toHaveLength(STARTING_MAP.encounters.length)
  })
})
