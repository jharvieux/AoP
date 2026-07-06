import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { AuthError, OAUTH_PROVIDERS, type AuthSession, type OAuthProvider } from '../auth'
import { resolveSupabaseConfig } from '../auth/config'
import {
  CHECKOUT_SUCCESS_PARAM,
  hasCheckoutSuccessMarker,
  pollForEntitlement,
  withCheckoutSuccessMarker,
} from '../monetization/checkoutReturn'
import { CheckoutError, createRemoveAdsCheckoutUrl } from '../monetization/checkout'
import { EntitlementsClient, hasRemoveAds } from '../monetization/entitlements'
import { useRemoveAds } from '../monetization/useRemoveAds'

interface AccountScreenProps {
  onBack: () => void
}

type Mode = 'signin' | 'create'

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: 'Continue with Google',
  github: 'Continue with GitHub',
}

function messageFor(err: unknown): string {
  if (err instanceof AuthError) return err.message
  return 'Something went wrong. Please try again.'
}

/**
 * Web remove-ads purchase entry point (docs/ARCHITECTURE.md §9): redirects to
 * a Stripe-hosted Checkout page — no Stripe.js needed client-side, see
 * monetization/checkout.ts. Only reachable once signed in, since the
 * entitlement is keyed by user id and needs an account to persist.
 *
 * Fulfillment state on return (#244): `useRemoveAds` only ever fetches once
 * per auth-state change, racing the `stripe-webhook` that actually grants the
 * entitlement — a buyer landing back from Checkout could see the buy button
 * still active. The success URL carries a marker (`checkoutReturn.ts`); on
 * seeing it, this component hides the buy button and polls the entitlement
 * with backoff instead of trusting a single check.
 */
function RemoveAdsSection({ session }: { session: AuthSession }) {
  const removeAds = useRemoveAds()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(() => hasCheckoutSuccessMarker(window.location.search))
  // Sticky for the rest of this mount once the poll confirms — `useRemoveAds`
  // itself only ever re-fetches on an auth-state change, so nothing else
  // would flip `removeAds` true this session and bring the buy button back.
  const [justConfirmed, setJustConfirmed] = useState(false)
  // Separate from `justConfirmed`: only the toast bubble self-dismisses: the
  // "Ads removed" label above it must stay for as long as `justConfirmed` does.
  const [showToast, setShowToast] = useState(false)

  useEffect(() => {
    if (!pending) return
    // Strip the marker immediately so a mid-poll refresh doesn't restart the
    // whole flow (or re-show the toast) on every subsequent visit.
    const url = new URL(window.location.href)
    url.searchParams.delete(CHECKOUT_SUCCESS_PARAM)
    window.history.replaceState(null, '', url.toString())

    const config = resolveSupabaseConfig()
    if (!config) {
      setPending(false)
      return
    }
    let cancelled = false
    const client = new EntitlementsClient(config)
    void pollForEntitlement(async () => hasRemoveAds(await client.fetchKeys(session))).then(
      (confirmed) => {
        if (cancelled) return
        setPending(false)
        if (confirmed) {
          setJustConfirmed(true)
          setShowToast(true)
        }
      },
    )
    return () => {
      cancelled = true
    }
    // Runs once on mount only — re-checking `pending` here would restart the
    // poll on every render once it flips false.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!showToast) return
    const id = setTimeout(() => setShowToast(false), 4000)
    return () => clearTimeout(id)
  }, [showToast])

  if (removeAds || justConfirmed) {
    return (
      <>
        <p className="section-label">Ads removed — thank you!</p>
        {showToast && (
          <div className="action-toast" role="status">
            Purchase confirmed — ads removed!
          </div>
        )}
      </>
    )
  }

  if (pending) {
    return <p className="section-label">Finishing your purchase…</p>
  }

  async function handleClick() {
    setError(null)
    setBusy(true)
    try {
      const config = resolveSupabaseConfig()
      if (!config) throw new CheckoutError('Checkout is unavailable in this build.')
      const origin = window.location.origin
      const url = await createRemoveAdsCheckoutUrl(config, session, {
        successUrl: withCheckoutSuccessMarker(origin),
        cancelUrl: origin,
      })
      window.location.assign(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <>
      <button className="secondary large" onClick={handleClick} disabled={busy}>
        Remove Ads
      </button>
      {error && <p className="theme-error">{error}</p>}
    </>
  )
}

/**
 * Account entry point reachable from the main menu. Single-player never needs
 * it — it exists to create an account (migrating local guest saves) or sign in
 * for multiplayer (docs/ARCHITECTURE.md §4, §9).
 */
export function AccountScreen({ onBack }: AccountScreenProps) {
  const auth = useAuth()
  const [mode, setMode] = useState<Mode>('create')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'create') {
        const result = await auth.createAccount({ email, password, displayName })
        setNotice(
          result.migration.migrated > 0
            ? `Account created. Migrated ${result.migration.migrated} save(s).`
            : 'Account created.',
        )
      } else {
        await auth.signIn(email, password)
      }
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleSignOut() {
    setBusy(true)
    try {
      await auth.signOut()
    } finally {
      setBusy(false)
    }
  }

  if (auth.state.status === 'authenticated') {
    return (
      <div className="screen menu-screen">
        <div className="menu-content">
          <h1 className="game-title">Account</h1>
          <p className="game-subtitle">{auth.state.user.email ?? 'Signed in'}</p>
          <RemoveAdsSection session={auth.state.session} />
          <button className="primary large" onClick={handleSignOut} disabled={busy}>
            Sign out
          </button>
          <button className="secondary large" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen menu-screen">
      <div className="menu-content">
        <h1 className="game-title">Account</h1>
        <p className="game-subtitle">
          {mode === 'create' ? 'Create an account to play online' : 'Sign in to your account'}
        </p>

        {!auth.configured && <p className="theme-error">Accounts are unavailable in this build.</p>}

        <form onSubmit={handleSubmit}>
          {mode === 'create' && (
            <input
              className="text-input"
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              disabled={!auth.configured || busy}
            />
          )}
          <input
            className="text-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={!auth.configured || busy}
          />
          <input
            className="text-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={!auth.configured || busy}
          />
          <button className="primary large" type="submit" disabled={!auth.configured || busy}>
            {mode === 'create' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {auth.configured &&
          OAUTH_PROVIDERS.map((provider) => (
            <button
              key={provider}
              className="secondary large"
              onClick={() => auth.signInWithOAuth(provider)}
              disabled={busy}
            >
              {PROVIDER_LABELS[provider]}
            </button>
          ))}

        {error && <p className="theme-error">{error}</p>}
        {notice && <p className="section-label">{notice}</p>}

        <button
          className="secondary large"
          onClick={() => {
            setMode(mode === 'create' ? 'signin' : 'create')
            setError(null)
            setNotice(null)
          }}
          disabled={busy}
        >
          {mode === 'create' ? 'Have an account? Sign in' : 'Need an account? Create one'}
        </button>
        <button className="back-button" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}
