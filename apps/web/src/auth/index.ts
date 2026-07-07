export { AuthProvider, useAuth } from './AuthContext'
export { authReducer, type AuthEvent } from './machine'
export { migrateGuestSaves, type SaveMigrationResult } from './migrate'
export {
  completeOAuthCallback,
  parseOAuthCallbackError,
  parseOAuthCallbackHash,
} from './oauthCallback'
export { SupabaseAuthBackend, type SupabaseConfig } from './supabaseAuth'
export { upgradeGuestToAccount, type UpgradeParams, type UpgradeResult } from './upgrade'
export { resolveSupabaseConfig } from './config'
export {
  AuthError,
  OAUTH_PROVIDERS,
  type AuthBackend,
  type AuthSession,
  type AuthState,
  type AuthUser,
  type OAuthCallbackTokens,
  type OAuthProvider,
  type Profile,
} from './types'
