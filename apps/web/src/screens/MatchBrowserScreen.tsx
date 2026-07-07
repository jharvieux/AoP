import { useEffect, useState } from 'react'
import type { OpenMatchSummary } from '@aop/shared'
import { useAuth } from '../auth'
import { resolveSupabaseConfig } from '../auth/config'
import { OpenMatchesClient, OpenMatchesError } from '../multiplayer/openMatchesClient'
import { Spinner } from '../components/Spinner'

interface MatchBrowserScreenProps {
  onBack: () => void
  /** Open the live match screen (#261) for a match the caller just joined. */
  onPlayMatch: (matchId: string) => void
  /** Navigate to AccountScreen to sign in (#296) */
  onSignIn?: () => void
}

/** A rough, no-dependency "time ago" label — good enough for a lobby list refreshed on demand. */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function turnTimerLabel(seconds: number | null): string {
  if (seconds === null) return 'Untimed'
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h/turn`
  return `${Math.round(seconds / 60)}m/turn`
}

/**
 * Match browser (#150, docs/MULTIPLAYER.md §14 Phase 4): discover open,
 * joinable lobbies and join one. Purely a discovery/browsing UI — the actual
 * seat/faction assignment is `join-match`'s job (see `OpenMatchesClient`);
 * this screen never reimplements that logic, only calls it.
 *
 * Pages forward with `list-open-matches`'s keyset cursor (`nextBefore`), the
 * same "before" semantics `selectOpenMatches` pages with server-side — there
 * is no "previous page" by design (a lobby list is a live, short-lived set,
 * not a stable feed to page backwards through); "Refresh" just restarts from
 * the newest page.
 */
export function MatchBrowserScreen({ onBack, onPlayMatch, onSignIn }: MatchBrowserScreenProps) {
  const auth = useAuth()
  const [matches, setMatches] = useState<OpenMatchSummary[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // The match just joined, so the notice can offer opening it (#261 — a join
  // used to be a dead end here).
  const [joinedMatchId, setJoinedMatchId] = useState<string | null>(null)

  const config = resolveSupabaseConfig()
  const authed = auth.state.status === 'authenticated'

  async function loadFirstPage() {
    if (auth.state.status !== 'authenticated' || !config) return
    setError(null)
    setLoading(true)
    try {
      const client = new OpenMatchesClient(config)
      const page = await client.listOpenMatches(auth.state.session)
      setMatches(page.matches)
      setNextBefore(page.nextBefore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load open matches.')
    } finally {
      setLoading(false)
    }
  }

  async function loadNextPage() {
    if (auth.state.status !== 'authenticated' || !config || nextBefore === null) return
    setError(null)
    setLoading(true)
    try {
      const client = new OpenMatchesClient(config)
      const page = await client.listOpenMatches(auth.state.session, { before: nextBefore })
      setMatches((prev) => [...prev, ...page.matches])
      setNextBefore(page.nextBefore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load more matches.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFirstPage()
    // Only on mount / when auth becomes available — refreshing is an explicit user action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed])

  async function handleJoin(matchId: string) {
    if (auth.state.status !== 'authenticated' || !config) return
    setError(null)
    setNotice(null)
    setJoiningId(matchId)
    try {
      const client = new OpenMatchesClient(config)
      const result = await client.joinMatch(auth.state.session, matchId)
      setNotice(`Joined match ${result.matchId} as seat ${result.seat}.`)
      setJoinedMatchId(result.matchId)
      setMatches((prev) => prev.filter((m) => m.matchId !== matchId))
    } catch (err) {
      if (err instanceof OpenMatchesError && err.code === 'MATCH_STATE') {
        // The lobby filled (or closed) between browsing and joining — drop it
        // from the list rather than leaving a dead "Join" button on screen.
        setMatches((prev) => prev.filter((m) => m.matchId !== matchId))
      }
      setError(err instanceof Error ? err.message : 'Could not join the match.')
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="screen menu-screen">
      <div className="menu-content">
        <h1 className="game-title">Match Browser</h1>
        <p className="game-subtitle">Browse open lobbies looking for players</p>

        {!authed && (
          <>
            <p className="theme-error">Sign in to browse matches.</p>
            {onSignIn && (
              <button className="primary large" onClick={onSignIn}>
                Sign In
              </button>
            )}
          </>
        )}

        {authed && (
          <>
            <div className="button-group">
              <button className="secondary" onClick={() => void loadFirstPage()} disabled={loading}>
                {loading && matches.length === 0 ? <Spinner label="Loading" /> : 'Refresh'}
              </button>
            </div>

            {error && <p className="theme-error">{error}</p>}
            {notice && <p className="section-label">{notice}</p>}
            {joinedMatchId && (
              <button className="primary" onClick={() => onPlayMatch(joinedMatchId)}>
                Open Match
              </button>
            )}

            {matches.length === 0 && !loading && (
              <p className="game-subtitle">No open lobbies right now.</p>
            )}

            <ul className="building-list">
              {matches.map((m) => (
                <li key={m.matchId} className="garrison-row">
                  <span className="garrison-row__name">
                    {m.mapSize} map — {m.playerCount}/{m.maxPlayers} players
                  </span>
                  <span className="garrison-row__counts">
                    {turnTimerLabel(m.turnTimerSeconds)} · created {timeAgo(m.createdAt)}
                  </span>
                  <div className="garrison-row__actions">
                    <button
                      disabled={joiningId !== null}
                      onClick={() => void handleJoin(m.matchId)}
                    >
                      {joiningId === m.matchId ? <Spinner label="Joining" /> : 'Join'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {nextBefore !== null && (
              <div className="button-group">
                <button
                  className="secondary"
                  onClick={() => void loadNextPage()}
                  disabled={loading}
                >
                  {loading && matches.length > 0 ? <Spinner label="Loading" /> : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}

        <button className="back-button" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
