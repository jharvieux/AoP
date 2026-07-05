import {
  applyActionWithOutcome,
  createGame,
  replay,
  type Action,
  type BattleReport,
  type GameConfig,
  type GameState,
} from '@aop/engine'
import { useEffect, useState } from 'react'
import { MainMenu } from './screens/MainMenu'
import { NewGameSetup } from './screens/NewGameSetup'
import { GameScreen } from './screens/GameScreen'
import { GameOverScreen } from './screens/GameOverScreen'
import { ThemePacksScreen } from './screens/ThemePacksScreen'
import { AccountScreen } from './screens/AccountScreen'
import { MapEditorScreen } from './screens/MapEditorScreen'
import { WatchReplayScreen } from './screens/WatchReplayScreen'
import { ReplayScreen } from './replay/ReplayScreen'
import { loadGame, saveGame } from './storage'
import { UpdateBanner } from './UpdateBanner'
import type { GameSetupConfig } from './types'
import { audioManager } from './audio/audioManager'
import { DIALOGUE } from './audio/dialogueClips'
import { registerBackButtonHandler } from './plugins/androidBackButton'

type Screen =
  | 'menu'
  | 'setup'
  | 'game'
  | 'game-over'
  | 'theme-packs'
  | 'account'
  | 'map-editor'
  | 'replay'
  | 'watch-replay'

interface ReplayData {
  config: GameConfig
  actions: Action[]
}

export function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [game, setGame] = useState<GameState | null>(null)
  const [config, setConfig] = useState<GameSetupConfig | null>(null)
  const [actionLog, setActionLog] = useState<Action[]>([])
  // Structured result of the last combat, for the battle report sheet (#39).
  // Derived output, never part of the replayable state or the saved log.
  const [battleReport, setBattleReport] = useState<BattleReport | null>(null)
  // A test-play match launched from the map editor (#41) skips autosave and
  // returns to the editor (not the main menu) when it ends.
  const [isTestPlay, setIsTestPlay] = useState(false)
  // #146/#147: the config + action log currently loaded into the replay
  // viewer, and which screen to return to when it closes.
  const [replayData, setReplayData] = useState<ReplayData | null>(null)
  const [replayReturnScreen, setReplayReturnScreen] = useState<Screen>('menu')

  function handleStartNewGame(setupConfig: GameSetupConfig) {
    // config already carries setup + startingTroops + frozen combatStats + content
    // from @aop/content (see NewGameSetup); the engine itself holds no balance data.
    setConfig(setupConfig)
    setActionLog([])
    setBattleReport(null)
    setGame(createGame(setupConfig))
    setIsTestPlay(false)
    setScreen('game')
    audioManager.play(DIALOGUE.narratorIntro, { key: 'narrator-intro' })
  }

  function handleTestPlay(setupConfig: GameSetupConfig) {
    setConfig(setupConfig)
    setActionLog([])
    setGame(createGame(setupConfig))
    setIsTestPlay(true)
    setScreen('game')
  }

  // Every mutation flows through here so the action log stays authoritative —
  // saves persist the log (not raw state) and load replays it, the same
  // event-sourced path multiplayer will use server-side (#4). Test-play matches
  // skip autosave so sculpting a draft map never clobbers a real save slot.
  function handleAction(action: Action) {
    if (!game || !config) return
    const outcome = applyActionWithOutcome(game, action)
    const next = outcome.state
    const nextLog = [...actionLog, action]
    setGame(next)
    setActionLog(nextLog)
    if (outcome.battleReport) setBattleReport(outcome.battleReport)
    if (!isTestPlay) void saveGame('autosave', config, nextLog, next.round)
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
    setScreen(isTestPlay ? 'map-editor' : 'menu')
    setGame(null)
    setIsTestPlay(false)
  }

  function openReplay(data: ReplayData, returnTo: Screen) {
    setReplayData(data)
    setReplayReturnScreen(returnTo)
    setScreen('replay')
  }

  /** From GameOverScreen: replay the match that just ended. */
  function handleWatchReplay() {
    if (!config) return
    openReplay({ config, actions: actionLog }, 'game-over')
  }

  /** From SaveScreen (opened from within an active game): replay a saved slot
   * without touching the game currently in progress. */
  async function handleWatchSlot(slotId: string) {
    const record = await loadGame(slotId)
    if (!record) return
    openReplay({ config: record.config, actions: record.actions }, 'game')
  }

  function handleCloseReplay() {
    setReplayData(null)
    setScreen(replayReturnScreen)
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
          onMapEditor={() => setScreen('map-editor')}
          onWatchReplay={() => setScreen('watch-replay')}
        />
      )}
      {screen === 'watch-replay' && (
        <WatchReplayScreen
          onBack={() => setScreen('menu')}
          onLoaded={(data) => openReplay(data, 'menu')}
        />
      )}
      {screen === 'theme-packs' && <ThemePacksScreen onBack={() => setScreen('menu')} />}
      {screen === 'account' && <AccountScreen onBack={() => setScreen('menu')} />}
      {screen === 'setup' && (
        <NewGameSetup onPlay={handleStartNewGame} onBack={() => setScreen('menu')} />
      )}
      {screen === 'map-editor' && (
        <MapEditorScreen onBack={() => setScreen('menu')} onTestPlay={handleTestPlay} />
      )}
      {screen === 'game' && game && (
        <GameScreen
          game={game}
          battleReport={battleReport}
          onDismissBattleReport={handleDismissBattleReport}
          onAction={handleAction}
          onSaveSlot={handleSaveSlot}
          onLoadSlot={handleLoadSlot}
          onWatchSlot={handleWatchSlot}
        />
      )}
      {screen === 'game-over' && game && (
        <GameOverScreen
          game={game}
          onRematch={handleRematch}
          onMenuClick={handleReturnToMenu}
          onWatchReplay={handleWatchReplay}
        />
      )}
      {screen === 'replay' && replayData && (
        <ReplayScreen
          config={replayData.config}
          actions={replayData.actions}
          onClose={handleCloseReplay}
        />
      )}
    </div>
  )
}
