import {
  applyActionWithOutcome,
  createGame,
  replay,
  type Action,
  type BattleReport,
  type GameState,
} from '@aop/engine'
import { useState } from 'react'
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

type Screen = 'menu' | 'setup' | 'game' | 'game-over' | 'theme-packs' | 'account'

export function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [game, setGame] = useState<GameState | null>(null)
  const [config, setConfig] = useState<GameSetupConfig | null>(null)
  const [actionLog, setActionLog] = useState<Action[]>([])
  // Structured result of the last combat, for the battle report sheet (#39).
  // Derived output, never part of the replayable state or the saved log.
  const [battleReport, setBattleReport] = useState<BattleReport | null>(null)

  function handleStartNewGame(setupConfig: GameSetupConfig) {
    // config already carries setup + startingTroops + frozen combatStats + content
    // from @aop/content (see NewGameSetup); the engine itself holds no balance data.
    setConfig(setupConfig)
    setActionLog([])
    setBattleReport(null)
    setGame(createGame(setupConfig))
    setScreen('game')
    audioManager.play(DIALOGUE.narratorIntro, { key: 'narrator-intro' })
  }

  // Every mutation flows through here so the action log stays authoritative —
  // saves persist the log (not raw state) and load replays it, the same
  // event-sourced path multiplayer will use server-side (#4).
  function handleAction(action: Action) {
    if (!game || !config) return
    const outcome = applyActionWithOutcome(game, action)
    const next = outcome.state
    const nextLog = [...actionLog, action]
    setGame(next)
    setActionLog(nextLog)
    if (outcome.battleReport) setBattleReport(outcome.battleReport)
    void saveGame('autosave', config, nextLog, next.round)
    if (next.status === 'finished' && !outcome.battleReport) setScreen('game-over')
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
    setBattleReport(null)
    setGame(replay(createGame(record.config), record.actions))
    setScreen('game')
  }

  /** Closing the battle sheet is what advances to game-over after a final blow. */
  function handleDismissBattleReport() {
    setBattleReport(null)
    if (game?.status === 'finished') setScreen('game-over')
  }

  function handleRematch() {
    if (config) handleStartNewGame(config)
  }

  function handleReturnToMenu() {
    setScreen('menu')
    setGame(null)
  }

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
          battleReport={battleReport}
          onDismissBattleReport={handleDismissBattleReport}
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
