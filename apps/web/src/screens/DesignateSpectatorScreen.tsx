import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { resolveSupabaseConfig } from '../auth/config'
import { SpectateClient } from '../multiplayer/spectateClient'

interface DesignateSpectatorScreenProps {
  onBack: () => void
}

/**
 * #149 entry point for a match creator to grant spectator access (#148,
 * docs/MULTIPLAYER.md §12): paste the match id, the spectator's user id, and
 * the seat to pin them to. There is no lobby/match-management UI yet to hang
 * this off (like WatchReplayScreen's "paste an id" screen before it), so this
 * is a standalone screen reachable from the main menu.
 *
 * Access is granted by raw user id rather than a name/email lookup: `profiles`
 * RLS only lets a caller read their own row plus co-participants of a shared
 * match (supabase/migrations/20260702000001_rls_policies.sql), and the whole
 * point of an explicit grant is that the spectator isn't a participant yet —
 * there is no RLS-safe way to look up a stranger by email from the client.
 * The creator and spectator are expected to already know each other's id
 * out of band (mirrors the invite-code-only join model, docs/MULTIPLAYER.md
 * §14).
 */
export function DesignateSpectatorScreen({ onBack }: DesignateSpectatorScreenProps) {
  const auth = useAuth()
  const [matchId, setMatchId] = useState('')
  const [spectatorUserId, setSpectatorUserId] = useState('')
  const [seat, setSeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (auth.state.status !== 'authenticated') {
      setError('Sign in from Account to grant spectator access.')
      return
    }
    const config = resolveSupabaseConfig()
    if (!config) {
      setError('Spectating is unavailable in this build.')
      return
    }
    const seatNumber = Number(seat)
    if (!Number.isInteger(seatNumber)) {
      setError('Seat must be a whole number.')
      return
    }
    setBusy(true)
    try {
      const client = new SpectateClient(config)
      await client.designateSpectator(auth.state.session, {
        matchId: matchId.trim(),
        userId: spectatorUserId.trim(),
        seat: seatNumber,
      })
      setNotice('Spectator access granted.')
      setSpectatorUserId('')
      setSeat('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen menu-screen">
      <div className="menu-content">
        <h1 className="game-title">Grant Spectator Access</h1>
        <p className="game-subtitle">
          Only the match creator can do this, and only for a match that has already started
        </p>

        {auth.state.status !== 'authenticated' && (
          <p className="theme-error">Sign in from Account to grant spectator access.</p>
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
          <input
            className="text-input"
            type="text"
            placeholder="Spectator's user id"
            value={spectatorUserId}
            onChange={(e) => setSpectatorUserId(e.target.value)}
            required
            disabled={busy}
          />
          <input
            className="text-input"
            type="number"
            placeholder="Seat to pin them to"
            value={seat}
            onChange={(e) => setSeat(e.target.value)}
            required
            disabled={busy}
          />
          <button
            className="primary large"
            type="submit"
            disabled={busy || !matchId.trim() || !spectatorUserId.trim() || !seat.trim()}
          >
            {busy ? 'Granting…' : 'Grant Access'}
          </button>
        </form>

        {error && <p className="theme-error">{error}</p>}
        {notice && <p className="section-label">{notice}</p>}

        <button className="back-button" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
