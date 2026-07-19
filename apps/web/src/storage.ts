import { RULES_VERSION, type Action, type GameConfig } from '@aop/engine'

/**
 * Local save/load for guest play. Persists the action log (not raw state) —
 * loading means replaying the log against a freshly created game, exercising
 * the same event-sourcing path multiplayer will use server-side (#4).
 */

const DB_NAME = 'aop-saves'
const DB_VERSION = 1
const STORE_NAME = 'saves'

/** Bump this whenever the SaveRecord shape changes; loadGame() checks it. */
export const SCHEMA_VERSION = 2

export interface SaveRecord {
  slotId: string
  schemaVersion: number
  config: GameConfig
  actions: Action[]
  round: number
  savedAt: number
  /**
   * Owning account id, or undefined for a guest-owned save (v1 saves predate
   * this field and load as guest-owned). Set when a guest upgrades to an
   * account — see auth/migrate.ts.
   */
  ownerId?: string
}

/**
 * The subset of local-save operations the guest-to-account migration needs.
 * Lets the migration run against an in-memory store in tests instead of
 * IndexedDB. `localSaveStore` below is the real IndexedDB-backed instance.
 */
export interface SaveStore {
  list(): Promise<SaveRecord[]>
  put(record: SaveRecord): Promise<void>
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'slotId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode)
      const request = run(tx.objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function saveGame(
  slotId: string,
  config: GameConfig,
  actions: Action[],
  round: number,
): Promise<void> {
  const record: SaveRecord = {
    slotId,
    schemaVersion: SCHEMA_VERSION,
    config,
    actions,
    round,
    savedAt: Date.now(),
  }
  await withStore('readwrite', (store) => store.put(record))
}

/**
 * Guards against loading a save this build can't safely reconstruct (#539).
 * `loadGame` runs this on every read; exported separately (and kept free of
 * IndexedDB) so it's unit-testable with plain objects.
 *
 * The `RULES_VERSION` check must run here, before anything calls `createGame`
 * — `createGame` unconditionally re-stamps `config.rulesVersion` to the
 * current engine build's version (game.ts), so by the time `stateFromSave`
 * replays the action log the mismatch is already invisible and replay can
 * fail deep inside a reducer with a cryptic invariant error instead of this
 * clear one.
 */
export function assertSaveIsLoadable(record: SaveRecord): void {
  if (record.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Save "${record.slotId}" was written by a newer client (schema v${record.schemaVersion}); this client understands up to v${SCHEMA_VERSION}.`,
    )
  }
  if (record.config.rulesVersion !== RULES_VERSION) {
    throw new Error(
      `This save is from an earlier version of the game (rules v${record.config.rulesVersion ?? 'unset'}) ` +
        `and can't be resumed on this build (rules v${RULES_VERSION}).`,
    )
  }
}

export async function loadGame(slotId: string): Promise<SaveRecord | undefined> {
  const record = await withStore<SaveRecord | undefined>('readonly', (store) => store.get(slotId))
  if (record) assertSaveIsLoadable(record)
  return record
}

export async function listSaves(): Promise<SaveRecord[]> {
  const records = await withStore<SaveRecord[]>('readonly', (store) => store.getAll())
  return records.sort((a, b) => b.savedAt - a.savedAt)
}

export async function deleteSave(slotId: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(slotId))
}

/** IndexedDB-backed {@link SaveStore} used by the guest-to-account migration. */
export const localSaveStore: SaveStore = {
  list: listSaves,
  put: (record) => withStore('readwrite', (store) => store.put(record)).then(() => undefined),
}
