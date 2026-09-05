import { BUILDINGS, GAME_SETUP, buildContentCatalog } from '@aop/content'
import { createGame, type GameConfig, type GameState } from '@aop/engine'

export const SOURCE_HEAD = 'a5a8fd5f8c522ebddfb146510b492bcea1c28ee2'
export const SOURCE_TREE = '71328fc4b018f021686ecefcd21f89a0ffc04c6a'
export const TERRAIN_SEED = 611

const players: GameConfig['players'] = [
  { id: 'player-0', name: 'Anne', faction: 'pirates', isAI: false },
  { id: 'player-1', name: 'Morgan', faction: 'british', isAI: true },
  { id: 'player-2', name: 'Isabel', faction: 'spanish', isAI: true },
  { id: 'player-3', name: 'Piet', faction: 'dutch', isAI: true },
  { id: 'player-4', name: 'René', faction: 'french', isAI: true },
]

function fixtureGame(config: Omit<GameConfig, 'setup' | 'content'>): GameState {
  return createGame({
    ...config,
    setup: GAME_SETUP,
    content: buildContentCatalog(),
  })
}

/**
 * One untouched round-1, five-seat 96×96 square-map session. Both the #610
 * phone-world frame and all six #611 terrain frames mount this exact value.
 */
export function terrainAndWorldGame(): GameState {
  return fixtureGame({
    seed: TERRAIN_SEED,
    mapSize: 'xlarge',
    topology: 'square',
    players,
  })
}

/**
 * Full Pirate harbor used only to expose the real city overlay and inspector.
 * It changes fixture input data, never production state or reducer behavior.
 */
export function fullCityGame(): GameState {
  const game = fixtureGame({
    seed: 610,
    mapSize: 'small',
    topology: 'square',
    players: players.slice(0, 2),
  })
  const city = game.cities.find((candidate) => candidate.ownerId === 'player-0')!
  const captain = game.captains.find((candidate) => candidate.ownerId === 'player-0')!
  return {
    ...game,
    round: 54,
    players: game.players.map((player) =>
      player.id === 'player-0'
        ? {
            ...player,
            resources: { gold: 9999, timber: 999, iron: 999, rum: 999 },
          }
        : player,
    ),
    cities: game.cities.map((candidate) =>
      candidate.id === city.id
        ? {
            ...candidate,
            buildings: Object.keys(BUILDINGS),
            builtThisRound: true,
          }
        : candidate,
    ),
    captains: game.captains.map((candidate) =>
      candidate.id === captain.id
        ? {
            ...candidate,
            position: { ...city.position },
            shipClassId: 'galleon',
          }
        : candidate,
    ),
  }
}
