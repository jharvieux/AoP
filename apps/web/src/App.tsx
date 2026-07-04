import { applyAction, createGame, replay, type Action, type GameState } from '@aop/engine'
import { useEffect, useState } from 'react'
import { MainMenu } from './screens/MainMenu'
import { NewGameSetup } from './screens/NewGameSetup'
import { GameScreen } from './screens/GameScreen'
import { GameOverScreen } from './screens/GameOverScreen'
import { ThemePacksScreen } from './screens/ThemePacksScreen'
import { AccountScreen } from './screens/AccountScreen'
import { loadGame, saveGame } from './storage'
import { UpdateBanner } from './UpdateBanner'
import type { GameSetupConfig } from './types'
import { audioManager } from './audio/audioManager'
import { DIALOGUE } from './audio/dialogueClips'
import { registerBackButtonHandler } from './plugins/androidBackButton'

type Screen = 'menu' | 'setup' | 'game' | 'game-over' | 'theme-packs' | 'account'

export function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [game, setGame] = useState<GameState | null>(null)
  const [config, setConfig] = useState<GameSetupConfig | null>(null)
  const [actionLog, setActionLog] = useState<Action[]>([])

  function handleStartNewGame(setupConfig: GameSetupConfig) {
    // config already carries setup + startingTroops + frozen combatStats + content
    // from @aop/content (see NewGameSetup); the engine itself holds no balance data.
    setConfig(setupConfig)
    setActionLog([])
    setGame(createGame(setupConfig))
    setScreen('game')
    audioManager.play(DIALOGUE.narratorIntro, { key: 'narrator-intro' })
  }

  // Every mutation flows through here so the action log stays authoritative —
  // saves persist the log (not raw state) and load replays it, the same
  // event-sourced path multiplayer will use server-side (#4).
  function handleAction(action: Action) {
    if (!game || !config) return
    const next = applyAction(game, action)
    const nextLog = [...actionLog, action]
    setGame(next)
    setActionLog(nextLog)
    void saveGame('autosave', config, nextLog, next.round)
    if (next.status === 'finished') setScreen('game-over')
  }

  async function handleSaveSlot(slotId: string) {
    if (!config || !game) return
    await saveGame(slotId, config, actionLog, game.round)
  }

  async function handleLoadSlot(slotId: string) {
    const record = await loadGame(slotId)
    if (!record) return
    setConfig(record.config)
    setActionLog(record.actions)
    setGame(replay(createGame(record.config), record.actions))
    setScreen('game')
  }

  function handleRematch() {
    if (config) handleStartNewGame(config)
  }

  function handleReturnToMenu() {
    setScreen('menu')
    setGame(null)
  }

  // Android hardware back / gesture-nav back: return to the menu from any
  // other screen instead of falling through to Capacitor's default (exiting
  // the app) — see plugins/androidBackButton.ts. No-op on web/no native shell.
  useEffect(() => {
    return registerBackButtonHandler(() => {
      if (screen === 'menu') return false
      setScreen('menu')
      return true
    })
  }, [screen])

  return (
    <div className="app">
      <UpdateBanner />
      {screen === 'menu' && (
        <MainMenu
          onStart={() => setScreen('setup')}
          onThemePacks={() => setScreen('theme-packs')}
          onAccount={() => setScreen('account')}
        />
      )}
      {screen === 'theme-packs' && <ThemePacksScreen onBack={() => setScreen('menu')} />}
      {screen === 'account' && <AccountScreen onBack={() => setScreen('menu')} />}
      {screen === 'setup' && (
        <NewGameSetup onPlay={handleStartNewGame} onBack={() => setScreen('menu')} />
      )}
      {screen === 'game' && game && (
        <GameScreen
          game={game}
          onAction={handleAction}
          onSaveSlot={handleSaveSlot}
          onLoadSlot={handleLoadSlot}
        />
      )}
      {screen === 'game-over' && game && (
        <GameOverScreen game={game} onRematch={handleRematch} onMenuClick={handleReturnToMenu} />
      )}
    </div>
  )
}
