import { applyAction, createGame, currentPlayer, type GameState } from '@aop/engine'
import { FACTIONS } from '@aop/content'
import { useState } from 'react'
import { MapCanvas } from './MapCanvas'

function newDemoGame(): GameState {
  return createGame({
    seed: 1,
    mapSize: 'small',
    players: [
      { id: 'you', name: 'You', faction: 'pirates', isAI: false },
      { id: 'ai-1', name: 'Cpt. Blackwood', faction: 'british', isAI: true },
      { id: 'ai-2', name: 'Cpt. Delgado', faction: 'spanish', isAI: true },
    ],
  })
}

export function App() {
  const [game, setGame] = useState(newDemoGame)
  const player = currentPlayer(game)

  function endTurn() {
    let next = applyAction(game, { type: 'endTurn', playerId: player.id })
    // Placeholder AI: end turn immediately. Real AI arrives in Phase 1.
    while (next.status === 'active' && currentPlayer(next).isAI) {
      next = applyAction(next, { type: 'endTurn', playerId: currentPlayer(next).id })
    }
    setGame(next)
  }

  return (
    <div className="app">
      <header className="hud">
        <h1>Age of Plunder</h1>
        <span className="turn-info">
          Round {game.round} — {player.name} ({FACTIONS[player.faction].name}) —{' '}
          {player.resources.gold} gold
        </span>
        <button className="primary" onClick={endTurn} disabled={player.isAI}>
          End Turn
        </button>
      </header>
      <div className="map-container">
        <MapCanvas seed={game.config.seed} />
      </div>
    </div>
  )
}
