import { FACTIONS } from '@aop/content'
import type { GameState } from '@aop/engine'
import { useEffect } from 'react'
import { AdSlot } from '../AdSlot'
import { useTheme } from '../theme/ThemeContext'
import { audioManager } from '../audio/audioManager'
import { DIALOGUE } from '../audio/dialogueClips'
import { notifyFeedback } from '../audio/feedback'
import { GAME_OVER_ICON } from '../uiIcons'

interface GameOverScreenProps {
  game: GameState
  onRematch: () => void
  onMenuClick: () => void
  /** Opens the #146 replay viewer over this match's full action log. */
  onWatchReplay: () => void
}

/**
 * The four ways a match reaches this screen (#426 added `defeat-abandoned`):
 * - `victory` — the human seat won.
 * - `defeat` — a rival seat won outright.
 * - `draw` — no winner because every crew went down together.
 * - `defeat-abandoned` — no winner because the human resigned or was
 *   eliminated while rival AI crews sailed on. Reads as a defeat, but is
 *   distinct from a mutual-destruction draw and needs its own copy.
 *
 * Extracted as a pure predicate so the branching is unit-testable without
 * rendering the screen (matching the #385 `findViewerCaptainAtCity` pattern).
 */
export type GameOverKind = 'victory' | 'defeat' | 'draw' | 'defeat-abandoned'

export function classifyGameOver(
  winnerId: string | null,
  players: readonly { eliminated: boolean }[],
): GameOverKind {
  if (winnerId === 'player-0') return 'victory'
  if (winnerId !== null) return 'defeat'
  return players.every((p) => p.eliminated) ? 'draw' : 'defeat-abandoned'
}

export function GameOverScreen({
  game,
  onRematch,
  onMenuClick,
  onWatchReplay,
}: GameOverScreenProps) {
  const { factionName } = useTheme()
  const winner = game.players.find((p) => p.id === game.winnerId)
  const kind = classifyGameOver(game.winnerId, game.players)
  const isPlayerWinner = kind === 'victory'
  const isDraw = kind === 'draw'
  // header/icon key collapses the two defeat kinds — the distinct copy is in
  // the info blocks below.
  const outcome = isDraw ? 'draw' : isPlayerWinner ? 'victory' : 'defeat'
  const outcomeText = isDraw ? 'Draw' : isPlayerWinner ? 'Victory!' : 'Defeat'
  const outcomeEmoji = isDraw ? '⚔️' : isPlayerWinner ? '🏆' : '💀'

  // Victory narration bark (#75) plus a generic success chime; only for a win,
  // not a draw or defeat.
  useEffect(() => {
    if (isPlayerWinner) {
      audioManager.play(DIALOGUE.levelComplete, { key: 'level-complete' })
      notifyFeedback()
    }
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

        {kind === 'defeat-abandoned' && (
          <div className="winner-info">
            <p className="winner-faction">Your campaign ends — rival crews sail on without you</p>
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
