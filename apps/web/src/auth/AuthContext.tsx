import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { localSaveStore, type SaveStore } from '../storage'
import { getPlatform } from '../plugins/nativeBridge'
import { onPushTokenRegistered } from '../plugins/pushNotifications'
import {
  clearPushToken,
  createSupabasePushTokenStore,
  syncPushToken,
  type PushTokenStore,
} from '../plugins/pushTokenStore'
import { resolveSupabaseConfig } from './config'
import { authReducer } from './machine'
import {
  completeOAuthCallback,
  parseOAuthCallbackError,
  parseOAuthCallbackHash,
} from './oauthCallback'
import {
  clearStoredSession,
  createSessionRefresher,
  isExpired,
  loadStoredSession,
  storeSession,
} from './session'
import { SupabaseAuthBackend } from './supabaseAuth'
import { upgradeGuestToAccount, type UpgradeParams, type UpgradeResult } from './upgrade'
import {
  AuthError,
  GUEST_STATE,
  type AuthBackend,
  type AuthSession,
  type AuthState,
  type OAuthProvider,
} from './types'

interface AuthContextValue {
  state: AuthState
  isGuest: boolean
  /** False when no Supabase config is present; account actions are unavailable. */
  configured: boolean
  signIn(email: string, password: string): Promise<void>
  /** Create an account from the current guest session and migrate local saves. */
  createAccount(params: UpgradeParams): Promise<UpgradeResult>
  signInWithOAuth(provider: OAuthProvider, redirectTo?: string): void
  /**
   * A failed or cancelled OAuth redirect's readable message (#307) — set when
   * GoTrue's callback carries an `error` instead of tokens, or the token
   * exchange itself throws. Null the rest of the time.
   */
  oauthError: string | null
  clearOAuthError(): void
  setDisplayName(displayName: string): Promise<void>
  signOut(): Promise<void>
  /**
   * Returns a session guaranteed not to be within the refresh skew window,
   * refreshing it against the backend first if needed (#234). Concurrent
   * callers share one in-flight refresh. Throws `NOT_AUTHENTICATED` if
   * called while a guest.
   */
  getFreshSession(): Promise<AuthSession>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const NOT_CONFIGURED = new AuthError(
  'NOT_CONFIGURED',
  'Accounts are unavailable — this build has no Supabase configuration.',
)

const NOT_AUTHENTICATED = new AuthError('NOT_AUTHENTICATED', 'No signed-in session to refresh.')

export interface AuthProviderProps {
  children: ReactNode
  /** Injectable for tests/storybook; defaults to the real Supabase backend. */
  backend?: AuthBackend | null
  saveStore?: SaveStore
  storage?: Storage
  /** Injectable for tests; defaults to a fetch-based store built from env config. */
  pushTokenStore?: PushTokenStore | null
}

export function AuthProvider({
  children,
  backend,
  saveStore,
  storage,
  pushTokenStore,
}: AuthProviderProps) {
  const store = saveStore ?? localSaveStore
  const persistence = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)

  // Resolve the backend once: an explicit prop wins (tests), else build the real
  // one from env, else null (guest-only build).
  const backendRef = useRef<AuthBackend | null>(null)
  if (backendRef.current === null) {
    if (backend !== undefined) {
      backendRef.current = backend
    } else {
      const config = resolveSupabaseConfig()
      backendRef.current = config ? new SupabaseAuthBackend(config) : null
    }
  }
  const activeBackend = backendRef.current

  // Single-flight token refresher for getFreshSession() (#234): concurrent
  // callers made while the session is expired share one refreshSession
  // request. Built once per backend — persistence/setState are stable for
  // the provider's lifetime, same as activeBackend above.
  const refresherRef = useRef<
    ((current: AuthSession, now?: number) => Promise<AuthSession>) | null
  >(null)
  if (refresherRef.current === null && activeBackend) {
    refresherRef.current = createSessionRefresher(activeBackend, (session) => {
      if (persistence) storeSession(persistence, session)
      setState((prev) => authReducer(prev, { type: 'session_refreshed', session }))
    })
  }

  // Same resolution for the push-token store (#157): explicit prop wins, else
  // build from env config, else null (guest-only build stores no tokens).
  const pushStoreRef = useRef<PushTokenStore | null | undefined>(undefined)
  if (pushStoreRef.current === undefined) {
    if (pushTokenStore !== undefined) {
      pushStoreRef.current = pushTokenStore
    } else {
      const config = resolveSupabaseConfig()
      pushStoreRef.current = config ? createSupabasePushTokenStore(config) : null
    }
  }
  const activePushStore = pushStoreRef.current

  const [state, setState] = useState<AuthState>(GUEST_STATE)
  const [oauthError, setOauthError] = useState<string | null>(null)

  // The push token arrives asynchronously from the native runtime; read the
  // live session through a ref so the handler never captures a stale one.
  const stateRef = useRef(state)
  stateRef.current = state

  // Restore a persisted session on mount, refreshing it if expired.
  useEffect(() => {
    if (!activeBackend || !persistence) return
    const stored = loadStoredSession(persistence)
    if (!stored) return
    let cancelled = false
    void (async () => {
      try {
        const session = isExpired(stored, Date.now())
          ? await activeBackend.refreshSession(stored.refreshToken)
          : stored
        if (cancelled) return
        storeSession(persistence, session)
        setState(authReducer(GUEST_STATE, { type: 'authenticated', session }))
      } catch {
        if (!cancelled) clearStoredSession(persistence)
      }
    })()
    return () => {
      cancelled = true
    }
    // activeBackend/persistence are stable for the provider's lifetime.
  }, [activeBackend, persistence])

  // Complete an OAuth implicit-flow redirect (#233): GoTrue appends tokens to
  // the URL as `#access_token=...&refresh_token=...` instead of a normal
  // callback page, and nothing parsed that fragment — sign-in silently
  // dead-ended back at the guest menu. Bail out cheaply via a sync parse
  // before doing the network exchange, so an ordinary boot's empty hash
  // never touches history. A cancelled/failed OAuth attempt redirects with
  // `#error=...` instead of tokens (#307) — surface it via `oauthError`
  // rather than silently returning to the signed-out screen, and still scrub
  // the hash so a refresh doesn't re-trigger it.
  useEffect(() => {
    if (!activeBackend || typeof window === 'undefined') return
    const hash = window.location.hash
    const tokens = parseOAuthCallbackHash(hash)
    const redirectError = tokens ? null : parseOAuthCallbackError(hash)
    if (!tokens && !redirectError) return
    let cancelled = false
    void (async () => {
      try {
        if (redirectError) {
          setOauthError(redirectError)
          return
        }
        const session = await completeOAuthCallback(activeBackend, window.location)
        if (session && !cancelled) {
          if (persistence) storeSession(persistence, session)
          setState((prev) => authReducer(prev, { type: 'authenticated', session }))
        }
      } catch (err) {
        if (!cancelled) {
          setOauthError(
            err instanceof AuthError ? err.message : 'Sign-in failed. Please try again.',
          )
        }
      } finally {
        if (!cancelled) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // activeBackend/persistence are stable for the provider's lifetime.
  }, [activeBackend, persistence])

  // Persist the device's push token whenever native registration delivers one,
  // provided the user is authenticated (#157). No-op on web / guest-only builds.
  useEffect(() => {
    if (!activePushStore) return
    onPushTokenRegistered((token) => {
      void syncPushToken(activePushStore, stateRef.current, token, getPlatform())
    })
    // activePushStore is stable for the provider's lifetime.
  }, [activePushStore])

  const value = useMemo<AuthContextValue>(() => {
    function requireBackend(): AuthBackend {
      if (!activeBackend) throw NOT_CONFIGURED
      return activeBackend
    }

    return {
      state,
      isGuest: state.status === 'guest',
      configured: activeBackend !== null,

      async signIn(email, password) {
        const session = await requireBackend().signInWithPassword(email, password)
        if (persistence) storeSession(persistence, session)
        setState((prev) => authReducer(prev, { type: 'authenticated', session }))
      },

      async createAccount(params) {
        const result = await upgradeGuestToAccount(requireBackend(), store, params)
        if (persistence) storeSession(persistence, result.session)
        setState((prev) => authReducer(prev, { type: 'authenticated', session: result.session }))
        return result
      },

      signInWithOAuth(provider, redirectTo) {
        setOauthError(null)
        const target = redirectTo ?? (typeof window !== 'undefined' ? window.location.origin : '')
        const authorizeUrl = requireBackend().oauthAuthorizeUrl(provider, target)
        if (typeof window !== 'undefined') window.location.assign(authorizeUrl)
      },

      oauthError,
      clearOAuthError() {
        setOauthError(null)
      },

      async setDisplayName(displayName) {
        if (state.status !== 'authenticated') throw NOT_CONFIGURED
        await requireBackend().updateDisplayName(state.session, displayName)
      },

      async getFreshSession() {
        if (state.status !== 'authenticated') throw NOT_AUTHENTICATED
        const refresh = refresherRef.current
        if (!refresh) throw NOT_CONFIGURED
        return refresh(state.session)
      },

      async signOut() {
        if (state.status === 'authenticated') {
          // Drop this device's push token on explicit sign-out so a signed-out
          // account stops receiving pushes (#157). Only on real sign-out — never
          // on app close/backgrounding, which don't call this.
          if (activePushStore) {
            await clearPushToken(activePushStore, state, getPlatform())
          }
          if (activeBackend) {
            await activeBackend.signOut(state.session).catch(() => undefined)
          }
        }
        if (persistence) clearStoredSession(persistence)
        setState((prev) => authReducer(prev, { type: 'signed_out' }))
      },
    }
  }, [state, activeBackend, persistence, store, activePushStore, oauthError])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
