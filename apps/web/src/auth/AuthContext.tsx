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
        const target = redirectTo ?? (typeof window !== 'undefined' ? window.location.origin : '')
        const authorizeUrl = requireBackend().oauthAuthorizeUrl(provider, target)
        if (typeof window !== 'undefined') window.location.assign(authorizeUrl)
      },

      async setDisplayName(displayName) {
        if (state.status !== 'authenticated') throw NOT_CONFIGURED
        await requireBackend().updateDisplayName(state.session, displayName)
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
  }, [state, activeBackend, persistence, store, activePushStore])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
