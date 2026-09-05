import { GAME_SETUP, buildContentCatalog } from '@aop/content'
import { createGame, type GameConfig, type GameState, type PlayerView } from '@aop/engine'

export const SOURCE_HEAD = 'c1824f22bf14dca6d38f7519fd99affd789a8130'

export function singlePlayerCollisionGame(): GameState {
  const config: GameConfig = {
    seed: 7,
    mapSize: 'small',
    setup: GAME_SETUP,
    players: [
      { id: 'player-0', name: 'Anne', faction: 'pirates', isAI: false },
      { id: 'player-1', name: 'Morgan', faction: 'british', isAI: true },
    ],
  }
  const game = createGame(config)
  const firstCity = game.cities.find((city) => city.ownerId === 'player-0')!
  const ownCaptain = game.captains.find((captain) => captain.ownerId === 'player-0')!
  const destination = {
    x: Math.max(0, Math.min(game.map.width - 1, ownCaptain.position.x + 4)),
    y: Math.max(0, Math.min(game.map.height - 1, ownCaptain.position.y + 3)),
  }
  const interruptedOrder = {
    destination,
    knownContactIds: [] as string[],
    interrupted: true,
  }
  return {
    ...game,
    config: { ...game.config, content: buildContentCatalog() },
    players: game.players.map((player) =>
      player.id === 'player-0'
        ? { ...player, resources: { gold: 999, timber: 999, iron: 999, rum: 999 } }
        : player,
    ),
    cities: [
      ...game.cities,
      { ...firstCity, id: 'player-0-city-2', name: 'Second Harbor', builtThisRound: true },
    ],
    captains: [
      ...game.captains.map((captain) =>
        captain.id === ownCaptain.id ? { ...captain, sailOrder: interruptedOrder } : captain,
      ),
      {
        ...ownCaptain,
        id: 'player-0-captain-2',
        name: 'Calico Jack',
        sailOrder: interruptedOrder,
      },
    ],
  }
}

export function multiplayerCollisionView(): PlayerView {
  const width = 12
  const height = 12
  const tiles: PlayerView['tiles'] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push({
        coord: { x, y },
        type: x > 8 && y > 8 ? 'land' : 'shallows',
        island: x > 8 && y > 8 ? 0 : -1,
        visible: x < 8 || y < 8,
      })
    }
  }
  const sailOrder: NonNullable<PlayerView['captains'][number]['sailOrder']> = {
    destination: { x: 8, y: 7 },
    knownContactIds: [],
    interrupted: true,
  }
  return {
    viewerId: 'seat-0',
    round: 2,
    currentPlayerIndex: 0,
    status: 'active',
    winnerId: null,
    rules: { setup: {} as PlayerView['rules']['setup'], mapSize: 'small' },
    mapWidth: width,
    mapHeight: height,
    topology: 'hex',
    tiles,
    players: [
      {
        id: 'seat-0',
        name: 'Anne',
        faction: 'pirates',
        isAI: false,
        eliminated: false,
        reputation: 0,
        resources: { gold: 999, timber: 999, iron: 999, rum: 999 },
      },
      {
        id: 'seat-1',
        name: 'Morgan',
        faction: 'british',
        isAI: false,
        eliminated: false,
        reputation: 0,
      },
    ],
    cities: [
      {
        id: 'city-own',
        ownerId: 'seat-0',
        name: 'Nassau',
        position: { x: 2, y: 2 },
        buildings: ['dock'],
        garrison: {},
        unitAvailability: {},
        builtThisRound: false,
      },
      {
        id: 'city-own-2',
        ownerId: 'seat-0',
        name: 'New Providence',
        position: { x: 3, y: 3 },
        buildings: ['dock'],
        garrison: {},
        unitAvailability: {},
        builtThisRound: true,
      },
      {
        id: 'city-fog-hidden',
        ownerId: 'seat-1',
        name: 'Hidden Enemy Harbor',
        position: { x: 11, y: 11 },
        buildings: [],
        garrison: {},
        unitAvailability: {},
        builtThisRound: false,
      },
    ],
    captains: [
      {
        id: 'cap-anne',
        ownerId: 'seat-0',
        name: 'Anne',
        position: { x: 2, y: 1 },
        shipClassId: 'sloop',
        troops: [{ unitId: 'swashbuckler', count: 6 }],
        movementPoints: 2,
        maxMovementPoints: 3,
        captured: false,
        sailOrder,
      },
      {
        id: 'cap-jack',
        ownerId: 'seat-0',
        name: 'Calico Jack',
        position: { x: 3, y: 1 },
        shipClassId: 'sloop',
        troops: [{ unitId: 'swashbuckler', count: 4 }],
        movementPoints: 2,
        maxMovementPoints: 3,
        captured: false,
        sailOrder,
      },
    ],
    parties: [],
    encounters: [],
    landSites: [],
    landEncounters: [],
    alliances: { allies: [], outgoingProposals: [], incomingProposals: [] },
    rngState: null,
  }
}
