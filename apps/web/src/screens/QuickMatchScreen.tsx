import { useEffect, useRef, useState } from 'react'
import { FACTIONS } from '@aop/content'
import { FACTION_IDS, MAX_MATCH_PLAYERS, type FactionId, type MapSize } from '@aop/shared'
import { useAuth } from '../auth'
import { resolveSupabaseConfig } from '../auth/config'
import {
  isPermanentQueueError,
  MatchmakingQueueClient,
} from '../multiplayer/matchmakingQueueClient'
import { subscribeSpectatePoll } from '../multiplayer/spectatePoll'

interface QuickMatchScreenProps {
  onBack: () => void
  /** Open the live match screen (#261) for the match the queue just seated the caller into. */
  onPlayMatch: (matchId: string) => void
  /** Navigate to AccountScreen to sign in (#296) */
  onSignIn?: () => void
}

const MAP_SIZES: MapSize[] = ['small', 'medium', 'large']
// 2..MAX_MATCH_PLAYERS (#219): factions are unique per match, so a bigger group
// could never be seated — the DB constraint rejects such queue rows outright.
const MATCH_SIZES = Array.from({ length: MAX_MATCH_PLAYERS - 1 }, (_, i) => i + 2)
const STATUS_POLL_MS = 3000

type SearchState =
  | { phase: 'idle' }
  | { phase: 'searching' }
  | { phase: 'found'; matchId: string | null }
  // A permanent (auth/4xx) failure polling the queue — retrying the same
  // request won't help, so the poll stops and the player gets Retry/Cancel
  // instead of an infinite "Searching…" (#239).
  | { phase: 'queue-error' }

/**
 * Quick-match queue UI (#153, docs/MULTIPLAYER.md §14): join the server-side
 * matchmaking queue and wait for `drain-matchmaking` to seat a full group.
 * Joining/leaving is a direct RLS-scoped PostgREST write against
 * `matchmaking_queue` (see `MatchmakingQueueClient`) — there is deliberately
 * no Edge Function call for either, per the migration's own comment ("no
 * Edge Function is needed to enqueue").
 *
 * "Match found" detection: this client can't watch the drain happen, so it
 * polls its own queue row. Once that row disappears, the newest id in
 * `match_players` that wasn't there when the search started is the match the
 * drain just seated the caller into (`knownMatchIds` below).
 */
export function QuickMatchScreen({ onBack, onPlayMatch, onSignIn }: QuickMatchScreenProps) {
  const auth = useAuth()
  const [matchSize, setMatchSize] = useState(4)
  const [mapSize, setMapSize] = useState<MapSize>('medium')
  const [faction, setFaction] = useState<FactionId | ''>('')
  const [search, setSearch] = useState<SearchState>({ phase: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const knownMatchIds = useRef<Set<string>>(new Set())

  const config = resolveSupabaseConfig()
  const authed = auth.state.status === 'authenticated'

  async function handleSearch() {
    if (auth.state.status !== 'authenticated' || !config) return
    setError(null)
    try {
      const client = new MatchmakingQueueClient(config)
      knownMatchIds.current = new Set(await client.mySeatedMatchIds(auth.state.session))
      await client.join(auth.state.session, {
        matchSize,
        mapSize,
        faction: faction === '' ? null : faction,
      })
      setSearch({ phase: 'searching' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the queue.')
    }
  }

  async function handleCancel() {
    if (auth.state.status !== 'authenticated' || !config) return
    setError(null)
    try {
      const client = new MatchmakingQueueClient(config)
      await client.leave(auth.state.session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave the queue.')
    } finally {
      setSearch({ phase: 'idle' })
    }
  }

  // While searching, poll the caller's own queue row. Once it's gone, diff
  // `match_players` against the pre-search snapshot to find the new match.
  useEffect(() => {
    if (search.phase !== 'searching' || auth.state.status !== 'authenticated' || !config) return
    const session = auth.state.session
    const client = new MatchmakingQueueClient(config)

    const stopPolling = subscribeSpectatePoll({
      intervalMs: STATUS_POLL_MS,
      onTick: async () => {
        try {
          const status = await client.myStatus(session)
          if (status !== null) return // still queued
          const seated = await client.mySeatedMatchIds(session)
          const fresh = seated.find((id) => !knownMatchIds.current.has(id))
          setSearch({ phase: 'found', matchId: fresh ?? seated[seated.length - 1] ?? null })
        } catch (err) {
          if (isPermanentQueueError(err)) {
            setError(err instanceof Error ? err.message : 'Could not check match status.')
            setSearch({ phase: 'queue-error' })
          }
          // Transient failures (network blip, 5xx) just try again next tick.
        }
      },
    })

    return () => {
      stopPolling()
      // Fire-and-forget: releases the queue row whenever this effect tears
      // down, for any reason — explicit cancel, a match being found (already
      // drained server-side, so this is a no-op), or the screen unmounting
      // because the player backed out (Android back / app close) without
      // ever hitting Cancel. Without this the row leaked and the player
      // could get seated into a real match they never saw (#239).
      void client.leave(session).catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.phase, authed])

  if (search.phase === 'found') {
    return (
      <div className="screen menu-screen">
        <div className="menu-content">
          <h1 className="game-title">Match Found!</h1>
          <p className="game-subtitle">
            {search.matchId ? (
              <>
                You've been seated in match <strong>{search.matchId}</strong>.
              </>
            ) : (
              "You've been matched — check your matches."
            )}
          </p>
          {search.matchId && (
            <button
              className="primary large"
              onClick={() => {
                const matchId = search.matchId
                if (!matchId) return
                setSearch({ phase: 'idle' })
                onPlayMatch(matchId)
              }}
            >
              Play Now
            </button>
          )}
          <button
            className="secondary large"
            onClick={() => {
              setSearch({ phase: 'idle' })
              onBack()
            }}
          >
            Back to Menu
          </button>
        </div>
      </div>
    )
  }

  if (search.phase === 'queue-error') {
    return (
      <div className="screen menu-screen">
        <div className="menu-content">
          <h1 className="game-title">Search interrupted</h1>
          {error && <p className="theme-error">{error}</p>}
          <button
            className="primary large"
            onClick={() => {
              setSearch({ phase: 'idle' })
              void handleSearch()
            }}
          >
            Retry
          </button>
          <button className="secondary large" onClick={() => void handleCancel()}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (search.phase === 'searching') {
    return (
      <div className="screen menu-screen">
        <div className="menu-content">
          <h1 className="game-title">Searching…</h1>
          <p className="game-subtitle">
            Looking for {matchSize} players on a {mapSize} map
          </p>
          {error && <p className="theme-error">{error}</p>}
          <button className="secondary large" onClick={() => void handleCancel()}>
            Cancel Search
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen menu-screen">
      <div className="menu-content">
        <h1 className="game-title">Quick Match</h1>
        <p className="game-subtitle">Join the queue and get matched automatically</p>

        {!authed && (
          <>
            <p className="theme-error">Sign in to use quick match.</p>
            {onSignIn && (
              <button className="primary large" onClick={onSignIn}>
                Sign In
              </button>
            )}
          </>
        )}

        {authed && (
          <>
            <div className="setup-section">
              <span className="section-label">Players</span>
              <div className="button-group">
                {MATCH_SIZES.map((size) => (
                  <button
                    key={size}
                    className={`player-count-button ${matchSize === size ? 'active' : ''}`}
                    onClick={() => setMatchSize(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="setup-section">
              <span className="section-label">Map size</span>
              <div className="button-group">
                {MAP_SIZES.map((size) => (
                  <button
                    key={size}
                    className={`size-button ${mapSize === size ? 'active' : ''}`}
                    onClick={() => setMapSize(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="setup-section">
              <span className="section-label">Faction preference (optional)</span>
              <div className="button-group">
                <button
                  className={`size-button ${faction === '' ? 'active' : ''}`}
                  onClick={() => setFaction('')}
                >
                  Any
                </button>
                {FACTION_IDS.map((f) => (
                  <button
                    key={f}
                    className={`size-button ${faction === f ? 'active' : ''}`}
                    onClick={() => setFaction(f)}
                  >
                    {FACTIONS[f].name}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="theme-error">{error}</p>}

            <button className="primary large" onClick={() => void handleSearch()}>
              Search for Match
            </button>
          </>
        )}

        <button className="back-button" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
