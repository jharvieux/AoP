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
import { resolveSupabaseConfig } from './config'
import { authReducer } from './machine'
import { clearStoredSession, isExpired, loadStoredSession, storeSession } from './session'
import { SupabaseAuthBackend } from './supabaseAuth'
import { upgradeGuestToAccount, type UpgradeParams, type UpgradeResult } from './upgrade'
import {
  AuthError,
  GUEST_STATE,
  type AuthBackend,
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
  setDisplayName(displayName: string): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const NOT_CONFIGURED = new AuthError(
  'NOT_CONFIGURED',
  'Accounts are unavailable — this build has no Supabase configuration.',
)

export interface AuthProviderProps {
  children: ReactNode
  /** Injectable for tests/storybook; defaults to the real Supabase backend. */
  backend?: AuthBackend | null
  saveStore?: SaveStore
  storage?: Storage
}

export function AuthProvider({ children, backend, saveStore, storage }: AuthProviderProps) {
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

  const [state, setState] = useState<AuthState>(GUEST_STATE)

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
        const target = redirectTo ?? (typeof window !== 'undefined' ? window.location.origin : '')
        const authorizeUrl = requireBackend().oauthAuthorizeUrl(provider, target)
        if (typeof window !== 'undefined') window.location.assign(authorizeUrl)
      },

      async setDisplayName(displayName) {
        if (state.status !== 'authenticated') throw NOT_CONFIGURED
        await requireBackend().updateDisplayName(state.session, displayName)
      },

      async signOut() {
        if (state.status === 'authenticated' && activeBackend) {
          await activeBackend.signOut(state.session).catch(() => undefined)
        }
        if (persistence) clearStoredSession(persistence)
        setState((prev) => authReducer(prev, { type: 'signed_out' }))
      },
    }
  }, [state, activeBackend, persistence, store])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
