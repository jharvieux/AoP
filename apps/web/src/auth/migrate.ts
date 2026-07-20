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
  // Guest saves are independent records keyed by id; re-tagging one never depends
  // on another, so issue the puts together instead of awaiting each in series.
  // On failure this still rejects (a partial migration is retried next upgrade,
  // idempotently) — same contract as the sequential loop.
  const guestSaves = saves.filter((save) => save.ownerId === undefined)
  await Promise.all(guestSaves.map((save) => store.put({ ...save, ownerId })))
  return { migrated: guestSaves.length, skipped: saves.length - guestSaves.length }
}
