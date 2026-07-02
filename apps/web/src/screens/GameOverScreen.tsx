import { FACTIONS } from '@aop/content'
import type { GameState } from '@aop/engine'

interface GameOverScreenProps {
  game: GameState
  onRematch: () => void
  onMenuClick: () => void
}

export function GameOverScreen({ game, onRematch, onMenuClick }: GameOverScreenProps) {
  const winner = game.players.find((p) => p.id === game.winnerId)
  const isPlayerWinner = game.winnerId === 'player-0'
  const isDraw = game.winnerId === null

  return (
    <div className="screen game-over-screen">
      <div className="game-over-content">
        <div
          className={`game-over-header ${isDraw ? 'draw' : isPlayerWinner ? 'victory' : 'defeat'}`}
        >
          {isDraw ? '⚔️ Draw' : isPlayerWinner ? '🏆 Victory!' : '💀 Defeat'}
        </div>

        {winner && (
          <div className="winner-info">
            <h2>{winner.name}</h2>
            <p className="winner-faction">{FACTIONS[winner.faction].name} prevails</p>
          </div>
        )}

        {isDraw && (
          <div className="winner-info">
            <p className="winner-faction">No victor — all crews lost</p>
          </div>
        )}

        <div className="game-stats">
          <div className="stat">
            <span className="stat-label">Final Round</span>
            <span className="stat-value">{game.round}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Total Actions</span>
            <span className="stat-value">{game.actionCount}</span>
          </div>
        </div>

        <div className="game-over-actions">
          <button className="primary large" onClick={onRematch}>
            Play Again
          </button>
          <button className="secondary large" onClick={onMenuClick}>
            Main Menu
          </button>
        </div>
      </div>
    </div>
  )
}
