import { applyAction, createGame, type GameState } from '@aop/engine'
import { useState } from 'react'
import { MainMenu } from './screens/MainMenu'
import { NewGameSetup } from './screens/NewGameSetup'
import { GameScreen } from './screens/GameScreen'
import { GameOverScreen } from './screens/GameOverScreen'
import type { GameSetupConfig } from './types'

type Screen = 'menu' | 'setup' | 'game' | 'game-over'

export function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [game, setGame] = useState<GameState | null>(null)
  const [lastSetupConfig, setLastSetupConfig] = useState<GameSetupConfig | null>(null)

  function handleStartNewGame(config: GameSetupConfig) {
    const newGame = createGame({
      seed: config.seed,
      mapSize: config.mapSize,
      players: config.players,
    })
    setLastSetupConfig(config)
    setGame(newGame)
    setScreen('game')
  }

  function handleGameStateChange(newGame: GameState) {
    if (newGame.status === 'finished') {
      setGame(newGame)
      setScreen('game-over')
    } else {
      setGame(newGame)
    }
  }

  function handleRematch() {
    if (lastSetupConfig) {
      handleStartNewGame(lastSetupConfig)
    }
  }

  function handleReturnToMenu() {
    setScreen('menu')
    setGame(null)
  }

  return (
    <div className="app">
      {screen === 'menu' && <MainMenu onStart={() => setScreen('setup')} />}
      {screen === 'setup' && (
        <NewGameSetup onPlay={handleStartNewGame} onBack={() => setScreen('menu')} />
      )}
      {screen === 'game' && game && (
        <GameScreen game={game} onStateChange={handleGameStateChange} />
      )}
      {screen === 'game-over' && game && (
        <GameOverScreen game={game} onRematch={handleRematch} onMenuClick={handleReturnToMenu} />
      )}
    </div>
  )
}
