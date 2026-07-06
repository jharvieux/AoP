import { useAudioSettings } from '../audio/useAudioSettings'
import { useBackgroundMusic } from '../audio/useBackgroundMusic'
import { tapFeedback } from '../audio/feedback'

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
}

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
}: MainMenuProps) {
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

  useBackgroundMusic('menu')

  function withTap(handler: () => void): () => void {
    return () => {
      tapFeedback()
      handler()
    }
  }

  return (
    <div className="screen menu-screen">
      <div className="menu-content">
        <h1 className="game-title">Age of Plunder</h1>
        <p className="game-subtitle">A pirate strategy game</p>
        <button className="primary large" onClick={withTap(onStart)}>
          New Game
        </button>
        <button className="secondary large" onClick={withTap(onMapEditor)}>
          Map Editor
        </button>
        <button className="secondary large" onClick={withTap(onThemePacks)}>
          Theme Packs
        </button>
        <button className="secondary large" onClick={withTap(onAccount)}>
          Account
        </button>
        <button className="secondary large" onClick={withTap(onWatchReplay)}>
          Watch Replay
        </button>
        <button className="secondary large" onClick={withTap(onSpectate)}>
          Spectate
        </button>
        <button className="secondary large" onClick={withTap(onDesignateSpectator)}>
          Grant Spectator Access
        </button>
        <button className="secondary large" onClick={withTap(onMatchBrowser)}>
          Match Browser
        </button>
        <button className="secondary large" onClick={withTap(onQuickMatch)}>
          Quick Match
        </button>
        <button className="secondary large" onClick={withTap(onLeaderboard)}>
          Leaderboard
        </button>

        <div className="menu-audio-settings">
          <label className="menu-audio-settings__row">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            Mute audio
          </label>
          <label className="menu-audio-settings__row">
            Dialogue volume
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
          </label>
          <label className="menu-audio-settings__row">
            Music volume
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
          </label>
          <label className="menu-audio-settings__row">
            SFX volume
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
          </label>
        </div>
      </div>
    </div>
  )
}
