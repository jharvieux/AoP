import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { resolveSupabaseConfig } from '../auth/config'
import { LeaderboardClient, type LeaderboardEntry } from '../multiplayer/leaderboardClient'

interface LeaderboardScreenProps {
  onBack: () => void
}

/** One fetch covers the whole board; `get-leaderboard` has no keyset cursor
 * (#154 — a top-N read, not a paginated feed), so this screen pages the
 * already-fetched batch client-side rather than re-requesting per page. */
const FETCH_LIMIT = 100
const PAGE_SIZE = 20

/**
 * Leaderboard viewer (#154): a ranked, paged read of `player_ratings` via
 * `get-leaderboard`. Fetches the top {@link FETCH_LIMIT} once, then pages
 * through that batch {@link PAGE_SIZE} rows at a time — the rank shown is
 * `get-leaderboard`'s own `rank` field (`buildLeaderboard`'s numbering across
 * the whole candidate set), never recomputed from the page slice.
 */
export function LeaderboardScreen({ onBack }: LeaderboardScreenProps) {
  const auth = useAuth()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = resolveSupabaseConfig()
  const authed = auth.state.status === 'authenticated'

  async function load() {
    if (auth.state.status !== 'authenticated' || !config) return
    setError(null)
    setLoading(true)
    try {
      const client = new LeaderboardClient(config)
      const result = await client.fetchTop(auth.state.session, FETCH_LIMIT)
      setEntries(result)
      setPage(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the leaderboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed])

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const pageEntries = entries.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="screen menu-screen">
      <div className="menu-content">
        <h1 className="game-title">Leaderboard</h1>
        <p className="game-subtitle">Top-rated pirates</p>

        {!authed && <p className="theme-error">Sign in from Account to view the leaderboard.</p>}

        {authed && (
          <>
            <div className="button-group">
              <button className="secondary" onClick={() => void load()} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {error && <p className="theme-error">{error}</p>}
            {!loading && entries.length === 0 && !error && (
              <p className="game-subtitle">No rated players yet.</p>
            )}

            <ul className="building-list">
              {pageEntries.map((entry) => (
                <li key={entry.userId} className="garrison-row">
                  <span className="garrison-row__name">
                    #{entry.rank} {entry.displayName}
                  </span>
                  <span className="garrison-row__counts">
                    Rating {entry.rating} · {entry.matchesPlayed} matches played
                  </span>
                </li>
              ))}
            </ul>

            {entries.length > PAGE_SIZE && (
              <div className="button-group">
                <button
                  className="secondary"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </button>
                <span className="garrison-row__counts">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  className="secondary"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
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
