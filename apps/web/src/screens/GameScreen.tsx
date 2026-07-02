import { applyAction, currentPlayer, type GameState } from '@aop/engine'
import { FACTIONS } from '@aop/content'
import { MapCanvas } from '../MapCanvas'

interface GameScreenProps {
  game: GameState
  onStateChange: (newGame: GameState) => void
}

export function GameScreen({ game, onStateChange }: GameScreenProps) {
  const player = currentPlayer(game)

  function endTurn() {
    let next = applyAction(game, { type: 'endTurn', playerId: player.id })
    // Placeholder AI: end turn immediately. Real AI arrives in Phase 1.
    while (next.status === 'active' && currentPlayer(next).isAI) {
      next = applyAction(next, { type: 'endTurn', playerId: currentPlayer(next).id })
    }
    onStateChange(next)
  }

  return (
    <div className="game-screen-container">
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
