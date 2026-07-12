import type { PlayerView } from '@aop/engine'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { resolveSupabaseConfig } from '../auth/config'
import { MapCanvas } from '../MapCanvas'
import { boardFromPlayerView } from '../multiplayer/playerViewBoard'
import { SpectateClient, SpectateError } from '../multiplayer/spectateClient'
import { subscribeSpectatePoll } from '../multiplayer/spectatePoll'
import { Spinner } from '../components/Spinner'

interface SpectateScreenProps {
  onBack: () => void
}

/** How often the live view refetches `get-player-view` while spectating.
 * There is no Realtime transport wired into this client yet (see
 * multiplayer/spectatePoll.ts), so a plain interval stands in for the turn
 * poke a real match screen would react to instead. */
const POLL_INTERVAL_MS = 4000

/**
 * Live-spectate viewer (#149, docs/MULTIPLAYER.md §12): once a match creator
 * has granted access via `designate-spectator` (`DesignateSpectatorScreen`),
 * the spectator pastes the match id here and watches that seat's live,
 * fog-locked view — the exact same `get-player-view` response, rendered
 * through the exact same `MapCanvas` board, that seat's own player sees
 * (packages/engine/test/spectatorView.test.ts). Strictly read-only: unlike
 * GameScreen there is no `onAction`, no tile-click handler beyond a no-op,
 * and no action buttons anywhere below — a spectator can watch, never play.
 */
export function SpectateScreen({ onBack }: SpectateScreenProps) {
  const auth = useAuth()
  const [matchId, setMatchId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState<{
    matchId: string
    view: PlayerView
    turnDeadline: string | null
  } | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (auth.state.status !== 'authenticated') {
      setError('Sign in from Account to spectate a match.')
      return
    }
    const config = resolveSupabaseConfig()
    if (!config) {
      setError('Spectating is unavailable in this build.')
      return
    }
    setBusy(true)
    try {
      const client = new SpectateClient(config)
      const trimmed = matchId.trim()
      const result = await client.getPlayerView(auth.state.session, trimmed)
      setLive({ matchId: trimmed, view: result.view, turnDeadline: result.turnDeadline })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Poll for as long as the live view is open. Auth/config are re-resolved
  // fresh on every tick (rather than captured in the effect) so a stale
  // closure never uses a signed-out session's token.
  useEffect(() => {
    if (!live) return
    const config = resolveSupabaseConfig()
    if (auth.state.status !== 'authenticated' || !config) return
    const session = auth.state.session
    const client = new SpectateClient(config)

    return subscribeSpectatePoll({
      intervalMs: POLL_INTERVAL_MS,
      onTick: async () => {
        try {
          const result = await client.getPlayerView(session, live.matchId)
          setLive({ matchId: live.matchId, view: result.view, turnDeadline: result.turnDeadline })
        } catch (err) {
          // A transient refetch failure just leaves the last-known view on
          // screen — the next poll tries again — except a grant revocation
          // (or the match no longer existing), which ends the session outright
          // rather than spinning on an error the spectator can't act on.
          if (
            err instanceof SpectateError &&
            (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND')
          ) {
            setLive(null)
            setError(err.message)
          }
        }
      },
    })
    // Deliberately keyed on `live.matchId` alone, not the whole `live` object:
    // every poll tick calls `setLive` with a fresh object, and depending on
    // `live` itself would tear down and resubscribe the interval on every
    // single tick instead of once per spectated match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.matchId, auth.state])

  if (live) {
    const { view } = live
    const viewer = view.players.find((p) => p.id === view.viewerId)
    const board = boardFromPlayerView(view)

    return (
      <div className="game-screen-container">
        <header className="hud">
          <h1>Spectating</h1>
          <span className="turn-info">
            Round {view.round} — watching {viewer?.name ?? view.viewerId}
            {view.status === 'finished' ? ' (match finished)' : ''}
          </span>
        </header>

        <div className="map-container">
          <MapCanvas
            map={board.map}
            captains={board.captains}
            cities={board.cities}
            parties={board.parties}
            encounters={board.encounters}
            viewerId={view.viewerId}
            visibleKeys={board.visibleKeys}
            exploredKeys={board.exploredKeys}
            selectedCaptainId={null}
            onTileClick={() => {}}
            factionOf={board.factionOf}
          />
        </div>

        <div className="bottom-action-bar">
          <button
            className="secondary"
            onClick={() => {
              setLive(null)
              setMatchId('')
            }}
          >
            Stop Spectating
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen menu-screen">
      <div className="menu-content">
        <h1 className="game-title">Spectate</h1>
        <p className="game-subtitle">Enter a match id you've been granted spectator access to</p>

        {auth.state.status !== 'authenticated' && (
          <p className="theme-error">Sign in from Account to spectate a match.</p>
        )}

        <form onSubmit={handleSubmit}>
          <input
            className="text-input"
            type="text"
            placeholder="Match id"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            required
            disabled={busy}
          />
          <button className="primary large" type="submit" disabled={busy || !matchId.trim()}>
            {busy ? <Spinner label="Loading" /> : 'Watch Live'}
          </button>
        </form>

        {error && <p className="theme-error">{error}</p>}

        <button className="back-button" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
