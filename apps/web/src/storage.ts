import type { Action, GameConfig } from '@aop/engine'

/**
 * Local save/load for guest play. Persists the action log (not raw state) —
 * loading means replaying the log against a freshly created game, exercising
 * the same event-sourcing path multiplayer will use server-side (#4).
 */

const DB_NAME = 'aop-saves'
const DB_VERSION = 1
const STORE_NAME = 'saves'

/** Bump this whenever the SaveRecord shape changes; loadGame() checks it. */
export const SCHEMA_VERSION = 1

export interface SaveRecord {
  slotId: string
  schemaVersion: number
  config: GameConfig
  actions: Action[]
  round: number
  savedAt: number
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

export async function loadGame(slotId: string): Promise<SaveRecord | undefined> {
  const record = await withStore<SaveRecord | undefined>('readonly', (store) => store.get(slotId))
  if (record && record.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `Save "${slotId}" was written by a newer client (schema v${record.schemaVersion}); this client understands up to v${SCHEMA_VERSION}.`,
    )
  }
  return record
}

export async function listSaves(): Promise<SaveRecord[]> {
  const records = await withStore<SaveRecord[]>('readonly', (store) => store.getAll())
  return records.sort((a, b) => b.savedAt - a.savedAt)
}

export async function deleteSave(slotId: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(slotId))
}
