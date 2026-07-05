import { FACTIONS } from '@aop/content'
import type { GameState } from '@aop/engine'
import { useEffect } from 'react'
import { AdSlot } from '../AdSlot'
import { useTheme } from '../theme/ThemeContext'
import { audioManager } from '../audio/audioManager'
import { DIALOGUE } from '../audio/dialogueClips'
import { GAME_OVER_ICON } from '../uiIcons'

interface GameOverScreenProps {
  game: GameState
  onRematch: () => void
  onMenuClick: () => void
  /** Opens the #146 replay viewer over this match's full action log. */
  onWatchReplay: () => void
}

export function GameOverScreen({
  game,
  onRematch,
  onMenuClick,
  onWatchReplay,
}: GameOverScreenProps) {
  const { factionName } = useTheme()
  const winner = game.players.find((p) => p.id === game.winnerId)
  const isPlayerWinner = game.winnerId === 'player-0'
  const isDraw = game.winnerId === null
  const outcome = isDraw ? 'draw' : isPlayerWinner ? 'victory' : 'defeat'
  const outcomeText = isDraw ? 'Draw' : isPlayerWinner ? 'Victory!' : 'Defeat'
  const outcomeEmoji = isDraw ? '⚔️' : isPlayerWinner ? '🏆' : '💀'

  // Victory narration bark (#75); only for a win, not a draw or defeat.
  useEffect(() => {
    if (isPlayerWinner) audioManager.play(DIALOGUE.levelComplete, { key: 'level-complete' })
  }, [isPlayerWinner])

  return (
    <div className="screen game-over-screen">
      <div className="game-over-content">
        <div className={`game-over-header ${outcome}`}>
          {GAME_OVER_ICON[outcome] ? (
            <img className="game-over-icon" src={GAME_OVER_ICON[outcome]} alt="" aria-hidden />
          ) : (
            <span aria-hidden>{outcomeEmoji} </span>
          )}
          {outcomeText}
        </div>

        {winner && (
          <div className="winner-info">
            <h2>{winner.name}</h2>
            <p className="winner-faction">
              {factionName(winner.faction, FACTIONS[winner.faction].name)} prevails
            </p>
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
          <button className="secondary large" onClick={onWatchReplay}>
            Watch Replay
          </button>
          <button className="secondary large" onClick={onMenuClick}>
            Main Menu
          </button>
        </div>

        <AdSlot placement="match-end" />
      </div>
    </div>
  )
}
