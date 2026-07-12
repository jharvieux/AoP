import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { useAudioSettings } from '../audio/useAudioSettings'
import { useBackgroundMusic } from '../audio/useBackgroundMusic'
import { tapFeedback } from '../audio/feedback'
import { mostRecentSave } from '../continueSave'
import { describeError } from '../errors'
import { listSaves, type SaveRecord } from '../storage'

interface MainMenuProps {
  onStart: () => void
  onThemePacks: () => void
  onAccount: () => void
  onMapEditor: () => void
  /** #147: enter a finished multiplayer match id and watch its replay. */
  onWatchReplay: () => void
  /** #149: enter a live match id you've been granted spectator access to. */
  onSpectate: () => void
  /** #149: as a match creator, grant another user spectator access. */
  onDesignateSpectator: () => void
  /** #150/#155: browse and join open public lobbies. */
  onMatchBrowser: () => void
  /** #153/#155: join the quick-match queue for an automatic pairing. */
  onQuickMatch: () => void
  /** #154/#155: view the ranked player leaderboard. */
  onLeaderboard: () => void
  /** #451: opens the main-menu Load Game screen (SaveScreen in load-only mode). */
  onLoadGame: () => void
  /** #451: resumes a save by slot id. Throws on failure (#237's pattern) — caught
   * here so the menu stays up with a visible error instead of navigating away. */
  onContinue: (slotId: string) => Promise<void>
}

function describeSave(record: SaveRecord): string {
  return `Round ${record.round} — ${new Date(record.savedAt).toLocaleString()}`
}

/**
 * Main menu per the design handoff (docs/design_handoff_start_screen, #302):
 * New Game / Quick Match / Map Editor stay prominent; everything else lives
 * under a collapsed "More Options" group so the first impression is three
 * choices, not ten identical buttons.
 */
export function MainMenu({
  onStart,
  onThemePacks,
  onAccount,
  onMapEditor,
  onWatchReplay,
  onSpectate,
  onDesignateSpectator,
  onMatchBrowser,
  onQuickMatch,
  onLeaderboard,
  onLoadGame,
  onContinue,
}: MainMenuProps) {
  const auth = useAuth()
  const {
    muted,
    volume,
    musicVolume,
    sfxVolume,
    setMuted,
    setVolume,
    setMusicVolume,
    setSfxVolume,
  } = useAudioSettings()
  const [moreOpen, setMoreOpen] = useState(false)
  const [saves, setSaves] = useState<SaveRecord[]>([])
  const [continueError, setContinueError] = useState<string | null>(null)

  useBackgroundMusic('menu')

  // #451: refetch every mount — App remounts the menu (key={screen}) whenever
  // navigation returns to it, so this always reflects the latest autosave.
  useEffect(() => {
    listSaves()
      .then(setSaves)
      .catch((err: unknown) => console.error('Failed to list saves for Continue', err))
  }, [])

  const latestSave = mostRecentSave(saves)

  async function handleContinue() {
    if (!latestSave) return
    tapFeedback()
    setContinueError(null)
    try {
      await onContinue(latestSave.slotId)
    } catch (err) {
      console.error(`Continue from "${latestSave.slotId}" failed`, err)
      setContinueError(`Couldn't resume your save: ${describeError(err)}`)
    }
  }

  function withTap(handler: () => void): () => void {
    return () => {
      tapFeedback()
      handler()
    }
  }

  // Show auth state on the Account button for discoverability (#296)
  const accountLabel =
    auth.state.status === 'authenticated'
      ? `Account — ${auth.state.user.email || 'Signed in'}`
      : 'Sign In / Account'

  const secondaryActions: Array<{ label: string; onClick: () => void; wide?: boolean }> = [
    { label: 'Load Game', onClick: onLoadGame },
    { label: 'Theme Packs', onClick: onThemePacks },
    { label: accountLabel, onClick: onAccount },
    { label: 'Watch Replay', onClick: onWatchReplay },
    { label: 'Spectate', onClick: onSpectate },
    { label: 'Grant Spectator Access', onClick: onDesignateSpectator },
    { label: 'Match Browser', onClick: onMatchBrowser },
    { label: 'Leaderboard', onClick: onLeaderboard, wide: true },
  ]

  return (
    <div className="screen parchment-screen main-menu">
      <div className="main-menu__panel">
        <h1 className="main-menu__header">Age of Plunder</h1>

        {continueError && (
          <p className="main-menu__continue-error" role="status">
            {continueError}
          </p>
        )}

        <div className="main-menu__primary">
          {latestSave && (
            <button className="main-menu__continue" onClick={handleContinue}>
              <span className="main-menu__continue-title">Continue</span>
              <span className="main-menu__continue-subtitle">{describeSave(latestSave)}</span>
            </button>
          )}
          <button className="main-menu__new-game" onClick={withTap(onStart)}>
            New Game
          </button>
          <div className="main-menu__primary-row">
            <button className="main-menu__outlined" onClick={withTap(onQuickMatch)}>
              Quick Match
            </button>
            <button className="main-menu__outlined" onClick={withTap(onMapEditor)}>
              Map Editor
            </button>
          </div>
        </div>

        <button
          className="main-menu__more-toggle"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span>{moreOpen ? 'Fewer Options' : 'More Options'}</span>
          <span className={`main-menu__chevron${moreOpen ? ' main-menu__chevron--open' : ''}`}>
            ▾
          </span>
        </button>

        {moreOpen && (
          <div className="main-menu__secondary-grid">
            {secondaryActions.map(({ label, onClick, wide }) => (
              <button
                key={label}
                className={`main-menu__secondary${wide ? ' main-menu__secondary--wide' : ''}`}
                onClick={withTap(onClick)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="main-menu__divider" />

        <div className="main-menu__audio">
          <label className="main-menu__audio-mute">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            Mute audio
          </label>
          <div className="main-menu__audio-grid">
            <span>Dialogue</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              disabled={muted}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Dialogue volume"
            />
            <span>Music</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicVolume}
              disabled={muted}
              onChange={(e) => setMusicVolume(Number(e.target.value))}
              aria-label="Music volume"
            />
            <span>SFX</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sfxVolume}
              disabled={muted}
              onChange={(e) => setSfxVolume(Number(e.target.value))}
              aria-label="SFX volume"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
