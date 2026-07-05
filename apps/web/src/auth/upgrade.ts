import type { SaveStore } from '../storage'
import { migrateGuestSaves, type SaveMigrationResult } from './migrate'
import type { AuthBackend, AuthSession, Profile } from './types'

export interface UpgradeParams {
  email: string
  password: string
  displayName: string
}

export interface UpgradeResult {
  session: AuthSession
  profile: Profile
  migration: SaveMigrationResult
}

/**
 * The guest-to-account upgrade (docs/ARCHITECTURE.md §9): create the account,
 * write the profile row, then claim the guest's local saves for it. Ordered so
 * saves are only migrated once we hold a real user id; the account exists even
 * if profile/migration hiccup, so the caller surfaces the error and the user
 * can retry from an authenticated state rather than losing the account.
 */
export async function upgradeGuestToAccount(
  backend: AuthBackend,
  store: SaveStore,
  params: UpgradeParams,
): Promise<UpgradeResult> {
  const session = await backend.signUp(params.email, params.password, params.displayName)
  const profile = await backend.ensureProfile(session, params.displayName)
  const migration = await migrateGuestSaves(store, session.user.id)
  return { session, profile, migration }
}
