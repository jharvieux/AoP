import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { resolveSupabaseConfig } from '../auth/config'
import { MatchReplayClient, type MatchReplayData } from '../multiplayer/matchReplay'
import { Spinner } from '../components/Spinner'

interface WatchReplayScreenProps {
  onBack: () => void
  onLoaded: (data: MatchReplayData) => void
}

/**
 * Minimal #147 entry point: paste a finished match's id and load its replay.
 * There is no match-list UI yet (out of scope here), so this is the only way
 * in until one exists. Requires a signed-in account — replays go through the
 * same participant-only RLS as everything else in multiplayer.
 */
export function WatchReplayScreen({ onBack, onLoaded }: WatchReplayScreenProps) {
  const auth = useAuth()
  const [matchId, setMatchId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (auth.state.status !== 'authenticated') {
      setError('Sign in from Account to watch a match replay.')
      return
    }
    const config = resolveSupabaseConfig()
    if (!config) {
      setError('Replays are unavailable in this build.')
      return
    }
    setBusy(true)
    try {
      const client = new MatchReplayClient(config)
      const data = await client.loadMatchReplay(auth.state.session, matchId.trim())
      onLoaded(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen menu-screen">
      <div className="menu-content">
        <h1 className="game-title">Watch Replay</h1>
        <p className="game-subtitle">Enter a finished match's id to watch how it played out</p>

        {auth.state.status !== 'authenticated' && (
          <p className="theme-error">Sign in from Account to watch a match replay.</p>
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
            {busy ? <Spinner label="Loading" /> : 'Watch'}
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
