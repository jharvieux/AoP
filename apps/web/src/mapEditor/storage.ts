import type { EditorDraft } from './types'

/**
 * Local persistence for map editor drafts (#41) — IndexedDB, following the
 * same `openDb`/`withStore` pattern as `../storage.ts` (game saves) and
 * `../theme/storage.ts` (theme packs).
 *
 * `ACTIVE_STORE` additionally tracks which draft id is the working autosave
 * slot (#238), the same "profile -> selected id" pointer shape as
 * `../theme/storage.ts`'s `profileSelections` store — MapEditorScreen
 * debounce-saves the in-progress draft here and rehydrates it on mount, so
 * Test Play / Back / a closed tab no longer silently discard unsaved work.
 */

const DB_NAME = 'aop-maps'
const DB_VERSION = 2
const STORE_NAME = 'drafts'
const ACTIVE_STORE = 'activeDraft'

/** No multi-session system exists yet; every local editor session shares this id. */
const LOCAL_SESSION_ID = 'local'

export interface MapDraftRecord {
  draft: EditorDraft
  savedAt: number
}

interface ActiveDraftPointer {
  sessionId: string
  draftId: string | null
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'draft.id' })
      }
      if (!db.objectStoreNames.contains(ACTIVE_STORE)) {
        db.createObjectStore(ACTIVE_STORE, { keyPath: 'sessionId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      const request = run(tx.objectStore(storeName))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function saveDraft(draft: EditorDraft): Promise<void> {
  const record: MapDraftRecord = { draft, savedAt: Date.now() }
  await withStore(STORE_NAME, 'readwrite', (store) => store.put(record))
}

export async function loadDraft(id: string): Promise<MapDraftRecord | undefined> {
  return withStore<MapDraftRecord | undefined>(STORE_NAME, 'readonly', (store) => store.get(id))
}

export async function listDrafts(): Promise<MapDraftRecord[]> {
  const records = await withStore<MapDraftRecord[]>(STORE_NAME, 'readonly', (store) =>
    store.getAll(),
  )
  return records.sort((a, b) => b.savedAt - a.savedAt)
}

export async function deleteDraft(id: string): Promise<void> {
  await withStore(STORE_NAME, 'readwrite', (store) => store.delete(id))
}

/** The draft id the editor should rehydrate on mount, or `null` if none was autosaved yet. */
export async function getActiveDraftId(): Promise<string | null> {
  const pointer = await withStore<ActiveDraftPointer | undefined>(
    ACTIVE_STORE,
    'readonly',
    (store) => store.get(LOCAL_SESSION_ID),
  )
  return pointer?.draftId ?? null
}

/** Records which draft id the autosave scheduler last wrote — called alongside every `saveDraft`. */
export async function setActiveDraftId(draftId: string | null): Promise<void> {
  const pointer: ActiveDraftPointer = { sessionId: LOCAL_SESSION_ID, draftId }
  await withStore(ACTIVE_STORE, 'readwrite', (store) => store.put(pointer))
}
