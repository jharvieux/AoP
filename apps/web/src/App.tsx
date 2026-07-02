import { applyAction, createGame, currentPlayer, nextAiAction, type GameState } from '@aop/engine'
import { combatStatsData, FACTIONS, GAME_SETUP } from '@aop/content'
import { useEffect, useState } from 'react'
import { MapCanvas } from './MapCanvas'

/** How long the AI "thinks" between actions. Purely cosmetic pacing. */
const AI_STEP_MS = 250

function newDemoGame(): GameState {
  const starter = (faction: keyof typeof FACTIONS) => [
    { unitId: FACTIONS[faction].units[0]!.id, count: 6 },
  ]
  return createGame({
    seed: 1,
    mapSize: 'small',
    setup: GAME_SETUP,
    combatStats: combatStatsData(),
    players: [
      {
        id: 'you',
        name: 'You',
        faction: 'pirates',
        isAI: false,
        startingTroops: starter('pirates'),
      },
      {
        id: 'ai-1',
        name: 'Cpt. Blackwood',
        faction: 'british',
        isAI: true,
        startingTroops: starter('british'),
      },
      {
        id: 'ai-2',
        name: 'Cpt. Delgado',
        faction: 'spanish',
        isAI: true,
        startingTroops: starter('spanish'),
      },
    ],
  })
}

export function App() {
  const [game, setGame] = useState(newDemoGame)
  const player = currentPlayer(game)

  // AI seats play themselves, one action per tick, so the main thread never
  // blocks. The same nextAiAction() runs unchanged in a worker or edge function.
  useEffect(() => {
    if (game.status !== 'active' || !player.isAI) return
    let cancelled = false
    const id = setTimeout(() => {
      if (cancelled) return
      setGame((g) => {
        if (g.status !== 'active' || !currentPlayer(g).isAI) return g
        return applyAction(g, nextAiAction(g, currentPlayer(g).id))
      })
    }, AI_STEP_MS)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [game, player.isAI])

  function endTurn() {
    setGame((g) => applyAction(g, { type: 'endTurn', playerId: currentPlayer(g).id }))
  }

  const banner =
    game.status === 'finished'
      ? `Victory: ${game.players.find((p) => p.id === game.winnerId)?.name ?? 'nobody'}`
      : `Round ${game.round} — ${player.name} (${FACTIONS[player.faction].name}) — ${player.resources.gold} gold`

  return (
    <div className="app">
      <header className="hud">
        <h1>Age of Plunder</h1>
        <span className="turn-info">{banner}</span>
        <button
          className="primary"
          onClick={endTurn}
          disabled={player.isAI || game.status !== 'active'}
        >
          {player.isAI ? 'AI thinking…' : 'End Turn'}
        </button>
      </header>
      <div className="map-container">
        <MapCanvas map={game.map} captains={game.captains} />
      </div>
    </div>
  )
}
