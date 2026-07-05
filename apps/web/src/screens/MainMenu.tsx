import { useAudioSettings } from '../audio/useAudioSettings'

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
  const { muted, volume, setMuted, setVolume } = useAudioSettings()

  return (
    <div className="screen menu-screen">
      <div className="menu-content">
        <h1 className="game-title">Age of Plunder</h1>
        <p className="game-subtitle">A pirate strategy game</p>
        <button className="primary large" onClick={onStart}>
          New Game
        </button>
        <button className="secondary large" onClick={onMapEditor}>
          Map Editor
        </button>
        <button className="secondary large" onClick={onThemePacks}>
          Theme Packs
        </button>
        <button className="secondary large" onClick={onAccount}>
          Account
        </button>
        <button className="secondary large" onClick={onWatchReplay}>
          Watch Replay
        </button>
        <button className="secondary large" onClick={onSpectate}>
          Spectate
        </button>
        <button className="secondary large" onClick={onDesignateSpectator}>
          Grant Spectator Access
        </button>
        <button className="secondary large" onClick={onMatchBrowser}>
          Match Browser
        </button>
        <button className="secondary large" onClick={onQuickMatch}>
          Quick Match
        </button>
        <button className="secondary large" onClick={onLeaderboard}>
          Leaderboard
        </button>

        <div className="menu-audio-settings">
          <label className="menu-audio-settings__row">
            <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
            Mute audio
          </label>
          <label className="menu-audio-settings__row">
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              disabled={muted}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Audio volume"
            />
          </label>
        </div>
      </div>
    </div>
  )
}
