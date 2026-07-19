import { RULES_VERSION, type GameConfig } from '@aop/engine'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assertSaveIsLoadable,
  deleteSave,
  listSaves,
  loadGame,
  localSaveStore,
  saveGame,
  SCHEMA_VERSION,
  type SaveRecord,
} from './storage'

function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    seed: 1,
    mapSize: 'small',
    setup: {
      startingGold: 1000,
      startingCaptainMovement: 5,
      partyMovementPoints: 3,
      startingShipClass: 'sloop',
      homeIslandRadius: 2,
      homeIslandRingRadiusFactor: 0.4,
      startingBuildings: ['townhall'],
      cityVisionRadius: 3,
      captainVisionRadius: 2,
      combatWinXp: 40,
      startingReputation: 100,
      betrayalReputationPenalty: 40,
      allianceReputationMin: 30,
      betrayalTruceRounds: 2,
      recruitCaptainBaseCost: 400,
      recruitCaptainCostGrowth: 1.5,
      recruitCaptainStartingCrew: 3,
      captainCaptivityRounds: 5,
      ransomBaseCost: 200,
      ransomXpMultiplier: 2,
    },
    players: [
      { id: 'p1', name: 'P1', faction: 'pirates', isAI: false, startingTroops: [] },
      { id: 'p2', name: 'P2', faction: 'british', isAI: true, startingTroops: [] },
    ],
    ...overrides,
  }
}

function record(overrides: Partial<SaveRecord> = {}): SaveRecord {
  return {
    slotId: 'slot-1',
    schemaVersion: SCHEMA_VERSION,
    config: config({ rulesVersion: RULES_VERSION }),
    actions: [],
    round: 1,
    savedAt: Date.now(),
    ...overrides,
  }
}

describe('assertSaveIsLoadable (#539)', () => {
  it('accepts a save stamped with the current RULES_VERSION', () => {
    expect(() => assertSaveIsLoadable(record())).not.toThrow()
  })

  it('rejects a save stamped with an older RULES_VERSION, with a friendly message', () => {
    const stale = record({ config: config({ rulesVersion: RULES_VERSION - 1 }) })
    expect(() => assertSaveIsLoadable(stale)).toThrow(
      /earlier version of the game.*can't be resumed/,
    )
  })

  it('rejects a pre-#213 save with no recorded rulesVersion at all', () => {
    // Omit rulesVersion entirely rather than set it `undefined` — matches how
    // an actual pre-#213 save (predating the field) deserializes, and
    // exactOptionalPropertyTypes forbids assigning `undefined` explicitly.
    const bareConfig = config()
    delete bareConfig.rulesVersion
    const noVersion = record({ config: bareConfig })
    expect(() => assertSaveIsLoadable(noVersion)).toThrow(/earlier version of the game/)
  })

  it('still rejects a save written by a newer client schema (pre-existing check)', () => {
    const newer = record({ schemaVersion: SCHEMA_VERSION + 1 })
    expect(() => assertSaveIsLoadable(newer)).toThrow(/newer client/)
  })
})

/**
 * Direct coverage for the IndexedDB-backed persistence layer (#556): every
 * other suite that touches `SaveRecord`/`SaveStore` (continueSave, loadSave,
 * auth/migrate, auth/upgrade) injects an in-memory fake and never calls
 * `saveGame`/`loadGame`/`listSaves`/`deleteSave` themselves, so none of them
 * would fail if these were stubbed out. This project has no jsdom dependency
 * (see audioManager.test.ts), so `indexedDB` is stubbed here the same way —
 * a minimal fake covering exactly the IDBFactory/IDBDatabase/IDBObjectStore
 * surface `storage.ts` uses.
 */

class FakeRequest<T> {
  result: T | undefined
  error: unknown = null
  onsuccess: (() => void) | null = null
  onerror: (() => void) | null = null
  onupgradeneeded: (() => void) | null = null

  succeed(result: T): void {
    this.result = result
    queueMicrotask(() => this.onsuccess?.())
  }
}

function createFakeIndexedDB() {
  const records = new Map<string, unknown>()
  let storeCreated = false

  class FakeObjectStore {
    put(record: { slotId: string }): FakeRequest<undefined> {
      const req = new FakeRequest<undefined>()
      records.set(record.slotId, record)
      req.succeed(undefined)
      return req
    }
    get(key: string): FakeRequest<unknown> {
      const req = new FakeRequest<unknown>()
      req.succeed(records.get(key))
      return req
    }
    getAll(): FakeRequest<unknown[]> {
      const req = new FakeRequest<unknown[]>()
      req.succeed([...records.values()])
      return req
    }
    delete(key: string): FakeRequest<undefined> {
      const req = new FakeRequest<undefined>()
      records.delete(key)
      req.succeed(undefined)
      return req
    }
  }

  const store = new FakeObjectStore()

  const fakeDb = {
    objectStoreNames: { contains: () => storeCreated },
    createObjectStore: () => {
      storeCreated = true
      return store
    },
    transaction: () => ({ objectStore: () => store }),
    close: () => {},
  }

  return {
    open(): FakeRequest<typeof fakeDb> {
      const req = new FakeRequest<typeof fakeDb>()
      queueMicrotask(() => {
        if (!storeCreated) {
          req.result = fakeDb
          req.onupgradeneeded?.()
        }
        req.succeed(fakeDb)
      })
      return req
    },
    records,
  }
}

/**
 * Round-trip config fixture, distinct from the `config()` helper above:
 * saves persisted through `saveGame` are read back through `loadGame`, which
 * runs `assertSaveIsLoadable` (#539) — so, unlike the bare fixtures used to
 * unit-test `assertSaveIsLoadable` directly, this one must carry a current
 * `rulesVersion` to be a valid save under that gate.
 */
function roundTripConfig(): GameConfig {
  return {
    seed: 1,
    mapSize: 'small',
    rulesVersion: RULES_VERSION,
    setup: {
      startingGold: 1000,
      startingCaptainMovement: 5,
      partyMovementPoints: 3,
      startingShipClass: 'sloop',
      homeIslandRadius: 2,
      homeIslandRingRadiusFactor: 0.4,
      startingBuildings: ['townhall'],
      cityVisionRadius: 3,
      captainVisionRadius: 2,
      combatWinXp: 40,
      startingReputation: 100,
      betrayalReputationPenalty: 40,
      allianceReputationMin: 30,
      betrayalTruceRounds: 2,
      recruitCaptainBaseCost: 400,
      recruitCaptainCostGrowth: 1.5,
      recruitCaptainStartingCrew: 3,
      captainCaptivityRounds: 5,
      ransomBaseCost: 200,
      ransomXpMultiplier: 2,
    },
    players: [{ id: 'p1', name: 'P1', faction: 'pirates', isAI: false, startingTroops: [] }],
  }
}

describe('storage.ts (#556: save/load persistence layer)', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { indexedDB: ReturnType<typeof createFakeIndexedDB> }).indexedDB =
      createFakeIndexedDB()
  })

  afterEach(() => {
    delete (globalThis as { indexedDB?: unknown }).indexedDB
  })

  it('round-trips a save through saveGame/loadGame with the actual data intact', async () => {
    await saveGame('slot-1', roundTripConfig(), [{ type: 'endTurn', playerId: 'p1' }], 3)
    const loaded = await loadGame('slot-1')

    expect(loaded).toBeDefined()
    expect(loaded?.slotId).toBe('slot-1')
    expect(loaded?.round).toBe(3)
    expect(loaded?.actions).toEqual([{ type: 'endTurn', playerId: 'p1' }])
    expect(loaded?.config).toEqual(roundTripConfig())
    expect(loaded?.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('loadGame returns undefined for a slot that was never saved', async () => {
    expect(await loadGame('nope')).toBeUndefined()
  })

  it('loadGame throws when the stored record is from a newer schema than this client understands', async () => {
    await saveGame('slot-1', roundTripConfig(), [], 1)
    const fake = (globalThis as unknown as { indexedDB: ReturnType<typeof createFakeIndexedDB> })
      .indexedDB
    const stored = fake.records.get('slot-1') as { schemaVersion: number }
    stored.schemaVersion = SCHEMA_VERSION + 1

    await expect(loadGame('slot-1')).rejects.toThrow(/newer client/)
  })

  it('listSaves returns every save sorted newest-first by savedAt', async () => {
    await saveGame('autosave', roundTripConfig(), [], 1)
    await saveGame('slot-1', roundTripConfig(), [], 2)
    const fake = (globalThis as unknown as { indexedDB: ReturnType<typeof createFakeIndexedDB> })
      .indexedDB
    // Force distinct savedAt timestamps deterministically rather than racing Date.now().
    ;(fake.records.get('autosave') as { savedAt: number }).savedAt = 100
    ;(fake.records.get('slot-1') as { savedAt: number }).savedAt = 200

    const saves = await listSaves()
    expect(saves.map((s) => s.slotId)).toEqual(['slot-1', 'autosave'])
  })

  it('deleteSave removes the record so a later loadGame/listSaves no longer sees it', async () => {
    await saveGame('slot-1', roundTripConfig(), [], 1)
    await saveGame('slot-2', roundTripConfig(), [], 1)

    await deleteSave('slot-1')

    expect(await loadGame('slot-1')).toBeUndefined()
    expect((await listSaves()).map((s) => s.slotId)).toEqual(['slot-2'])
  })

  it('localSaveStore.put/list exercise the same IndexedDB-backed path as saveGame/listSaves', async () => {
    await localSaveStore.put({
      slotId: 'guest-1',
      schemaVersion: SCHEMA_VERSION,
      config: roundTripConfig(),
      actions: [],
      round: 1,
      savedAt: 0,
      ownerId: 'user-1',
    })

    const saves = await localSaveStore.list()
    expect(saves).toHaveLength(1)
    expect(saves[0]?.slotId).toBe('guest-1')
    expect(saves[0]?.ownerId).toBe('user-1')
    // Confirms it's the real backend, not a separate store: saveGame's own
    // read path (listSaves) sees the record localSaveStore.put wrote.
    expect((await listSaves()).map((s) => s.slotId)).toEqual(['guest-1'])
  })
})
