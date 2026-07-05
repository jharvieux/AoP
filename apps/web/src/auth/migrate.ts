import type { SaveStore } from '../storage'

export interface SaveMigrationResult {
  /** Guest-owned saves re-tagged to the account. */
  migrated: number
  /** Saves left untouched (already owned by this or another account). */
  skipped: number
}

/**
 * Claims the local guest saves for a freshly-linked account. Single-player runs
 * as a guest with local (IndexedDB) saves; on upgrade those saves must not be
 * lost (docs/ARCHITECTURE.md §9), so we re-tag every guest-owned record with
 * the new `ownerId`. Saves already owned by another account are left alone so
 * switching accounts on a shared device can't silently steal them.
 *
 * Idempotent: re-running for the same owner migrates nothing further.
 */
export async function migrateGuestSaves(
  store: SaveStore,
  ownerId: string,
): Promise<SaveMigrationResult> {
  const saves = await store.list()
  let migrated = 0
  let skipped = 0
  for (const save of saves) {
    if (save.ownerId !== undefined) {
      skipped++
      continue
    }
    await store.put({ ...save, ownerId })
    migrated++
  }
  return { migrated, skipped }
}
