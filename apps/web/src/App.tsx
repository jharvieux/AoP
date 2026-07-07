import {
  createGame,
  type Action,
  type BattleReport,
  type GameConfig,
  type GameState,
} from '@aop/engine'
import { useCallback, useEffect, useState } from 'react'
import { dispatchAction } from './actionDispatch'
import { reportError } from './reporting'
import { stateFromSave } from './loadSave'
import { MainMenu } from './screens/MainMenu'
import { TitleScreen } from './screens/TitleScreen'
import { NewGameSetup } from './screens/NewGameSetup'
import { GameScreen } from './screens/GameScreen'
import { GameOverScreen } from './screens/GameOverScreen'
import { ThemePacksScreen } from './screens/ThemePacksScreen'
import { AccountScreen } from './screens/AccountScreen'
import { MapEditorScreen } from './screens/MapEditorScreen'
import { WatchReplayScreen } from './screens/WatchReplayScreen'
import { SpectateScreen } from './screens/SpectateScreen'
import { DesignateSpectatorScreen } from './screens/DesignateSpectatorScreen'
import { MatchBrowserScreen } from './screens/MatchBrowserScreen'
import { MatchScreen } from './screens/MatchScreen'
import { QuickMatchScreen } from './screens/QuickMatchScreen'
import { LeaderboardScreen } from './screens/LeaderboardScreen'
import { ReplayScreen } from './replay/ReplayScreen'
import { loadGame, saveGame } from './storage'
import { CheckoutPendingBanner } from './monetization/CheckoutPendingBanner'
import { UpdateBanner } from './UpdateBanner'
import type { GameSetupConfig } from './types'
import { isTestPlayAfterLoadSlot, isTestPlayAfterRematch, shouldAutosave } from './gameSession'
import { audioManager } from './audio/audioManager'
import { DIALOGUE } from './audio/dialogueClips'
import { registerBackButtonHandler } from './plugins/androidBackButton'

type Screen =
  | 'title'
  | 'menu'
  | 'setup'
  | 'game'
  | 'game-over'
  | 'theme-packs'
  | 'account'
  | 'map-editor'
  | 'replay'
  | 'watch-replay'
  | 'spectate'
  | 'designate-spectator'
  | 'match-browser'
  | 'quick-match'
  | 'match'
  | 'leaderboard'

interface ReplayData {
  config: GameConfig
  actions: Action[]
}

export function App() {
  // Launch splash (docs/design_handoff_start_screen): shown once per app
  // start, then hands off to the menu.
  const [screen, setScreen] = useState<Screen>('title')
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
  // A human action the engine rejected (#240) — a brief, self-dismissing toast;
  // never blocks play the way a forced AI endTurn (below) has to.
  const [actionError, setActionError] = useState<string | null>(null)
  // Persists until the next successful autosave (#237) — unlike actionError,
  // this is not self-dismissing: it should stay visible for as long as saves
  // are actually failing (e.g. storage quota exhausted).
  const [autosaveFailing, setAutosaveFailing] = useState(false)
  // The multiplayer match currently open in MatchScreen (#261).
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null)

  useEffect(() => {
    if (!actionError) return
    const id = setTimeout(() => setActionError(null), 3000)
    return () => clearTimeout(id)
  }, [actionError])

  // Stable identity: TitleScreen's auto-advance timer keys its effect on this
  // callback, so a fresh closure per render would restart the 3.2s countdown.
  const handleTitleDone = useCallback(() => setScreen('menu'), [])

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
  // See dispatchAction (#240) for why a rejected action doesn't just throw.
  function handleAction(action: Action) {
    if (!game || !config) return
    const result = dispatchAction(game, action)
    if (result.kind === 'rejected') {
      console.error('Rejected action', action, result.message)
      setActionError(result.message)
      return
    }
    if (result.kind === 'unrecoverable') {
      console.error(
        'Forced endTurn for a stuck AI seat also failed; giving up on this action',
        action,
      )
      // An engine invariant failure the UI absorbs silently — the one class of
      // caught error worth telemetry beyond the ErrorBoundary (#252).
      reportError(new Error('Unrecoverable engine action: forced endTurn also failed'), { action })
      return
    }
    const { appliedAction, outcome } = result
    const next = outcome.state
    const nextLog = [...actionLog, appliedAction]
    setGame(next)
    setActionLog(nextLog)
    if (outcome.battleReport) setBattleReport(outcome.battleReport)
    // #237: autosave used to be `void saveGame(...)` — a QuotaExceededError
    // (or any other rejection) became an unhandled promise rejection while
    // the game kept "autosaving" into the void, with zero feedback right when
    // a long game needs its autosave most. Failure now flips a persistent,
    // non-blocking indicator (cleared the moment autosave next succeeds).
    if (shouldAutosave(isTestPlay)) {
      saveGame('autosave', config, nextLog, next.round)
        .then(() => setAutosaveFailing(false))
        .catch((err: unknown) => {
          console.error('Autosave failed', err)
          setAutosaveFailing(true)
        })
    }
    if (next.status === 'finished' && !outcome.battleReport) setScreen('game-over')
  }

  async function handleSaveSlot(slotId: string): Promise<void> {
    if (!config || !game) return
    await saveGame(slotId, config, actionLog, game.round)
  }

  /**
   * Throws on failure (#237) instead of silently no-op'ing: `loadGame`
   * deliberately throws for a newer-schema save and `replay` throws on a
   * corrupt action log — the caller (SaveScreen) catches this and keeps its
   * sheet open with the message, instead of closing on a load that never
   * actually happened. `replay` runs before any state is touched, so a
   * failure here can never leave the in-progress game half-overwritten.
   */
  async function handleLoadSlot(slotId: string): Promise<void> {
    const record = await loadGame(slotId)
    if (!record) throw new Error(`No save found in slot "${slotId}"`)
    const state = stateFromSave(record)
    setConfig(record.config)
    setActionLog(record.actions)
    setBattleReport(null)
    setGame(state)
    // #236: a loaded slot is always a real game — test-play never survives a
    // load, so autosave (and the game-over → menu route) resume correctly.
    setIsTestPlay(isTestPlayAfterLoadSlot())
    setScreen('game')
  }

  /** Closing the battle sheet is what advances to game-over after a final blow. */
  function handleDismissBattleReport() {
    setBattleReport(null)
    if (game?.status === 'finished') setScreen('game-over')
  }

  function handleRematch() {
    if (!config) return
    // #236: a rematch of a test-play match must stay test-play — routing it
    // through handleStartNewGame would flip isTestPlay false and autosave a
    // scratch match over the real autosave slot.
    if (isTestPlayAfterRematch(isTestPlay)) handleTestPlay(config)
    else handleStartNewGame(config)
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
      if (screen === 'menu' || screen === 'title') return false
      setScreen('menu')
      return true
    })
  }, [screen])

  return (
    <div className="app">
      <UpdateBanner />
      {actionError && (
        <div className="action-toast" role="status">
          {actionError}
        </div>
      )}
      <CheckoutPendingBanner />
      {screen === 'title' && <TitleScreen onDone={handleTitleDone} />}
      {screen === 'menu' && (
        <MainMenu
          onStart={() => setScreen('setup')}
          onThemePacks={() => setScreen('theme-packs')}
          onAccount={() => setScreen('account')}
          onMapEditor={() => setScreen('map-editor')}
          onWatchReplay={() => setScreen('watch-replay')}
          onSpectate={() => setScreen('spectate')}
          onDesignateSpectator={() => setScreen('designate-spectator')}
          onMatchBrowser={() => setScreen('match-browser')}
          onQuickMatch={() => setScreen('quick-match')}
          onLeaderboard={() => setScreen('leaderboard')}
        />
      )}
      {screen === 'watch-replay' && (
        <WatchReplayScreen
          onBack={() => setScreen('menu')}
          onLoaded={(data) => openReplay(data, 'menu')}
        />
      )}
      {screen === 'spectate' && <SpectateScreen onBack={() => setScreen('menu')} />}
      {screen === 'designate-spectator' && (
        <DesignateSpectatorScreen onBack={() => setScreen('menu')} />
      )}
      {screen === 'match-browser' && (
        <MatchBrowserScreen
          onBack={() => setScreen('menu')}
          onPlayMatch={(matchId) => {
            setActiveMatchId(matchId)
            setScreen('match')
          }}
          onSignIn={() => setScreen('account')}
        />
      )}
      {screen === 'quick-match' && (
        <QuickMatchScreen
          onBack={() => setScreen('menu')}
          onPlayMatch={(matchId) => {
            setActiveMatchId(matchId)
            setScreen('match')
          }}
          onSignIn={() => setScreen('account')}
        />
      )}
      {screen === 'match' && activeMatchId && (
        <MatchScreen
          matchId={activeMatchId}
          onBack={() => {
            setActiveMatchId(null)
            setScreen('menu')
          }}
        />
      )}
      {screen === 'leaderboard' && (
        <LeaderboardScreen onBack={() => setScreen('menu')} onSignIn={() => setScreen('account')} />
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
          autosaveFailing={autosaveFailing}
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
