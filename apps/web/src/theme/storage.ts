import { createEmptyThemePack, type ThemePack } from './types'

/**
 * Local IndexedDB storage for theme packs (#64, Tier 1 — local-only). Same
 * pattern as ../storage.ts's save games: a dedicated DB, one store for the
 * packs themselves and one mapping a profile to its currently-active pack.
 */

const DB_NAME = 'aop-theme-packs'
const DB_VERSION = 1
const PACKS_STORE = 'packs'
const SELECTIONS_STORE = 'profileSelections'

/** No multi-profile system exists yet; every local player shares this profile id. */
export const LOCAL_PROFILE_ID = 'local'

interface ProfileSelection {
  profileId: string
  packId: string | null
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PACKS_STORE)) {
        db.createObjectStore(PACKS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(SELECTIONS_STORE)) {
        db.createObjectStore(SELECTIONS_STORE, { keyPath: 'profileId' })
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

export function newThemePack(name: string): ThemePack {
  return createEmptyThemePack(name, crypto.randomUUID(), Date.now())
}

export async function saveThemePack(pack: ThemePack): Promise<ThemePack> {
  const record: ThemePack = { ...pack, updatedAt: Date.now() }
  await withStore(PACKS_STORE, 'readwrite', (store) => store.put(record))
  return record
}

export async function listThemePacks(): Promise<ThemePack[]> {
  const records = await withStore<ThemePack[]>(PACKS_STORE, 'readonly', (store) => store.getAll())
  return records.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getThemePack(id: string): Promise<ThemePack | undefined> {
  return withStore(PACKS_STORE, 'readonly', (store) => store.get(id))
}

export async function deleteThemePack(id: string): Promise<void> {
  await withStore(PACKS_STORE, 'readwrite', (store) => store.delete(id))
  const active = await getActiveThemePackId(LOCAL_PROFILE_ID)
  if (active === id) await setActiveThemePack(LOCAL_PROFILE_ID, null)
}

export async function setActiveThemePack(profileId: string, packId: string | null): Promise<void> {
  const record: ProfileSelection = { profileId, packId }
  await withStore(SELECTIONS_STORE, 'readwrite', (store) => store.put(record))
}

export async function getActiveThemePackId(profileId: string): Promise<string | null> {
  const record = await withStore<ProfileSelection | undefined>(
    SELECTIONS_STORE,
    'readonly',
    (store) => store.get(profileId),
  )
  return record?.packId ?? null
}

/** Serialize a pack (including inlined asset data URLs) for manual sharing. */
export function exportThemePack(pack: ThemePack): Blob {
  return new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
}

function isThemePackShape(value: unknown): value is ThemePack {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.name === 'string' && typeof record.assets === 'object'
}

/** Parse a previously exported pack file. Assigns a fresh id so imports never collide. */
export async function importThemePackFromFile(file: File): Promise<ThemePack> {
  const parsed: unknown = JSON.parse(await file.text())
  if (!isThemePackShape(parsed)) {
    throw new Error('Not a valid theme pack file')
  }
  const now = Date.now()
  return {
    ...createEmptyThemePack(parsed.name, crypto.randomUUID(), now),
    factionNames: parsed.factionNames ?? {},
    unitNames: parsed.unitNames ?? {},
    shipNames: parsed.shipNames ?? {},
    assets: parsed.assets ?? {},
  }
}
