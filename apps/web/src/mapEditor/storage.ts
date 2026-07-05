import type { EditorDraft } from './types'

/**
 * Local persistence for map editor drafts (#41) — IndexedDB, following the
 * same `openDb`/`withStore` pattern as `../storage.ts` (game saves) and
 * `../theme/storage.ts` (theme packs).
 */

const DB_NAME = 'aop-maps'
const DB_VERSION = 1
const STORE_NAME = 'drafts'

export interface MapDraftRecord {
  draft: EditorDraft
  savedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'draft.id' })
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

export async function saveDraft(draft: EditorDraft): Promise<void> {
  const record: MapDraftRecord = { draft, savedAt: Date.now() }
  await withStore('readwrite', (store) => store.put(record))
}

export async function loadDraft(id: string): Promise<MapDraftRecord | undefined> {
  return withStore<MapDraftRecord | undefined>('readonly', (store) => store.get(id))
}

export async function listDrafts(): Promise<MapDraftRecord[]> {
  const records = await withStore<MapDraftRecord[]>('readonly', (store) => store.getAll())
  return records.sort((a, b) => b.savedAt - a.savedAt)
}

export async function deleteDraft(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id))
}
