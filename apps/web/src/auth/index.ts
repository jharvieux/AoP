// #553: this barrel used to re-export the whole auth module's surface, but
// every caller outside `auth/` already imports the other symbols (machine,
// migrate, oauthCallback, supabaseAuth, upgrade, config, and most of types)
// straight from their source files — knip found those re-exports genuinely
// unused. Kept to only what's actually consumed through `../auth`.
export { AuthProvider, useAuth } from './AuthContext'
export { AuthError, OAUTH_PROVIDERS, type AuthSession, type OAuthProvider } from './types'
