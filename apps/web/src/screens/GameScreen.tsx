import { applyAction, currentPlayer, nextAiAction, type GameState } from '@aop/engine'
import { FACTIONS } from '@aop/content'
import { MapCanvas } from '../MapCanvas'
import { useEffect, useState } from 'react'

/** How long an AI seat "thinks" between actions. Purely cosmetic pacing. */
const AI_STEP_MS = 250

interface GameScreenProps {
  game: GameState
  onStateChange: (newGame: GameState) => void
}

export function GameScreen({ game, onStateChange }: GameScreenProps) {
  const player = currentPlayer(game)
  const [confirmingResign, setConfirmingResign] = useState(false)

  // AI seats play themselves, one action per tick, so the main thread never
  // blocks. The same nextAiAction() runs unchanged in a worker or edge function.
  useEffect(() => {
    if (game.status !== 'active' || !player.isAI) return
    let cancelled = false
    const id = setTimeout(() => {
      if (cancelled) return
      onStateChange(applyAction(game, nextAiAction(game, player.id)))
    }, AI_STEP_MS)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [game, player, onStateChange])

  function endTurn() {
    onStateChange(applyAction(game, { type: 'endTurn', playerId: player.id }))
  }

  function resign() {
    onStateChange(applyAction(game, { type: 'resign', playerId: player.id }))
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
            {player.isAI ? 'AI thinking…' : 'End Turn'}
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
        <MapCanvas map={game.map} captains={game.captains} />
      </div>
    </div>
  )
}
