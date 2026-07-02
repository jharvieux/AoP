import {
  applyAction,
  createGame,
  currentPlayer,
  replay,
  type Action,
  type ContentCatalog,
  type GameConfig,
  type GameState,
} from '@aop/engine'
import { BUILDINGS, FACTIONS, SHIP_CLASSES } from '@aop/content'
import { useState } from 'react'
import { CityScreen } from './CityScreen'
import { MapCanvas } from './MapCanvas'
import { ResourceHud } from './ResourceHud'
import { SaveScreen } from './SaveScreen'
import { loadGame, saveGame } from './storage'

/** Assembled once from @aop/content — the engine never imports content directly. */
const CATALOG: ContentCatalog = {
  buildings: BUILDINGS,
  units: Object.fromEntries(
    Object.values(FACTIONS).flatMap((faction) =>
      faction.units.map((unit) => [
        unit.id,
        {
          factionId: faction.id,
          tier: unit.tier,
          goldCost: unit.goldCost,
          weeklyGrowth: unit.weeklyGrowth,
        },
      ]),
    ),
  ),
  ships: Object.fromEntries(
    SHIP_CLASSES.map((ship) => [ship.id, { crewCapacity: ship.crewCapacity }]),
  ),
}

const STARTING_SHIP_CLASS_ID = 'sloop'

function newDemoConfig(): GameConfig {
  return {
    seed: 1,
    mapSize: 'small',
    startingBuildings: ['townhall', 'barracks'],
    startingShipClassId: STARTING_SHIP_CLASS_ID,
    players: [
      { id: 'you', name: 'You', faction: 'pirates', isAI: false },
      { id: 'ai-1', name: 'Cpt. Blackwood', faction: 'british', isAI: true },
      { id: 'ai-2', name: 'Cpt. Delgado', faction: 'spanish', isAI: true },
    ],
  }
}

export function App() {
  const [config, setConfig] = useState(newDemoConfig)
  const [game, setGame] = useState(() => createGame(config))
  const [actionLog, setActionLog] = useState<Action[]>([])
  const [cityScreenOpen, setCityScreenOpen] = useState(false)
  const [saveScreenOpen, setSaveScreenOpen] = useState(false)
  const player = currentPlayer(game)
  const homeCity = game.cities.find((c) => c.ownerId === player.id)
  const homeCaptain = game.captains.find((c) => c.ownerId === player.id)
  const shipCrewCapacity = homeCaptain
    ? (CATALOG.ships[homeCaptain.shipClassId]?.crewCapacity ?? 0)
    : 0

  /** Applies one action, appends it to the replayable log, and returns the new state. */
  function dispatch(base: GameState, actions: Action[], action: Action): GameState {
    const next = applyAction(base, action, CATALOG)
    actions.push(action)
    return next
  }

  function endTurn() {
    const actions: Action[] = []
    let next = dispatch(game, actions, { type: 'endTurn', playerId: player.id })
    // Placeholder AI: end turn immediately. Real AI arrives in Phase 1.
    while (next.status === 'active' && currentPlayer(next).isAI) {
      next = dispatch(next, actions, { type: 'endTurn', playerId: currentPlayer(next).id })
    }
    setGame(next)
    const nextLog = [...actionLog, ...actions]
    setActionLog(nextLog)
    void saveGame('autosave', config, nextLog, next.round)
  }

  function build(buildingId: string) {
    if (!homeCity) return
    const actions: Action[] = []
    const next = dispatch(game, actions, {
      type: 'construct',
      playerId: player.id,
      cityId: homeCity.id,
      buildingId,
    })
    setGame(next)
    setActionLog([...actionLog, ...actions])
  }

  function recruit(unitId: string) {
    if (!homeCity) return
    const actions: Action[] = []
    const next = dispatch(game, actions, {
      type: 'recruit',
      playerId: player.id,
      cityId: homeCity.id,
      unitId,
      count: 1,
    })
    setGame(next)
    setActionLog([...actionLog, ...actions])
  }

  function transfer(direction: 'toShip' | 'toGarrison', unitId: string) {
    if (!homeCity || !homeCaptain) return
    const actions: Action[] = []
    const next = dispatch(game, actions, {
      type: 'transferTroops',
      playerId: player.id,
      cityId: homeCity.id,
      captainId: homeCaptain.id,
      direction,
      unitId,
      count: 1,
    })
    setGame(next)
    setActionLog([...actionLog, ...actions])
  }

  async function saveToSlot(slotId: string) {
    await saveGame(slotId, config, actionLog, game.round)
  }

  async function loadFromSlot(slotId: string) {
    const record = await loadGame(slotId)
    if (!record) return
    const loaded = replay(createGame(record.config), record.actions, CATALOG)
    setConfig(record.config)
    setGame(loaded)
    setActionLog(record.actions)
    setSaveScreenOpen(false)
  }

  return (
    <div className="app">
      <header className="hud">
        <h1>Age of Plunder</h1>
        <span className="turn-info">
          Round {game.round} — {player.name} ({FACTIONS[player.faction].name})
        </span>
        <ResourceHud resources={player.resources} />
        <button
          className="primary secondary"
          onClick={() => setCityScreenOpen(true)}
          disabled={!homeCity || player.isAI}
        >
          City
        </button>
        <button className="primary secondary" onClick={() => setSaveScreenOpen(true)}>
          Saves
        </button>
        <button className="primary" onClick={endTurn} disabled={player.isAI}>
          End Turn
        </button>
      </header>
      <div className="map-container">
        <MapCanvas seed={game.config.seed} />
      </div>
      {cityScreenOpen && homeCity && (
        <CityScreen
          city={homeCity}
          captain={homeCaptain}
          shipCrewCapacity={shipCrewCapacity}
          faction={player.faction}
          resources={player.resources}
          onClose={() => setCityScreenOpen(false)}
          onBuild={build}
          onRecruit={recruit}
          onTransfer={transfer}
        />
      )}
      {saveScreenOpen && (
        <SaveScreen
          onClose={() => setSaveScreenOpen(false)}
          onSave={saveToSlot}
          onLoad={loadFromSlot}
        />
      )}
    </div>
  )
}
