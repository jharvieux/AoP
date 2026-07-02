import { applyAction, currentPlayer, type GameState } from '@aop/engine'
import { FACTIONS } from '@aop/content'
import { MapCanvas } from '../MapCanvas'
import { useState } from 'react'

interface GameScreenProps {
  game: GameState
  onStateChange: (newGame: GameState) => void
}

export function GameScreen({ game, onStateChange }: GameScreenProps) {
  const player = currentPlayer(game)
  const [confirmingResign, setConfirmingResign] = useState(false)

  function endTurn() {
    let next = applyAction(game, { type: 'endTurn', playerId: player.id })
    while (next.status === 'active' && currentPlayer(next).isAI) {
      next = applyAction(next, { type: 'endTurn', playerId: currentPlayer(next).id })
    }
    onStateChange(next)
  }

  function resign() {
    let next = applyAction(game, { type: 'resign', playerId: player.id })
    while (next.status === 'active' && currentPlayer(next).isAI) {
      next = applyAction(next, { type: 'endTurn', playerId: currentPlayer(next).id })
    }
    onStateChange(next)
    setConfirmingResign(false)
  }

  return (
    <div className="game-screen-container">
      <header className="hud">
        <h1>Age of Plunder</h1>
        <span className="turn-info">
          Round {game.round} — {player.name} ({FACTIONS[player.faction].name}) —{' '}
          {player.resources.gold} gold
        </span>
        <div className="button-group">
          <button className="primary" onClick={endTurn} disabled={player.isAI}>
            End Turn
          </button>
          {!confirmingResign ? (
            <button
              className="secondary"
              onClick={() => setConfirmingResign(true)}
              disabled={player.isAI}
            >
              Resign
            </button>
          ) : (
            <>
              <button className="danger" onClick={resign} disabled={player.isAI}>
                Confirm Resign
              </button>
              <button className="secondary" onClick={() => setConfirmingResign(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </header>
      <div className="map-container">
        <MapCanvas seed={game.config.seed} />
      </div>
    </div>
  )
}
