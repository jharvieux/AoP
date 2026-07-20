import { describe, expect, it } from 'vitest'
import { migrateGuestSaves } from './migrate'
import type { SaveRecord, SaveStore } from '../storage'

function save(slotId: string, ownerId?: string): SaveRecord {
  return {
    slotId,
    schemaVersion: 2,
    config: {} as SaveRecord['config'],
    actions: [],
    round: 1,
    savedAt: 0,
    ...(ownerId !== undefined ? { ownerId } : {}),
  }
}

function memoryStore(initial: SaveRecord[]): SaveStore & { records: Map<string, SaveRecord> } {
  const records = new Map(initial.map((r) => [r.slotId, r]))
  return {
    records,
    list: async () => [...records.values()],
    put: async (r) => void records.set(r.slotId, r),
  }
}

/** Records every slotId handed to `put`, so tests can assert each guest save was written once. */
function countingStore(
  initial: SaveRecord[],
): SaveStore & { records: Map<string, SaveRecord>; putCalls: string[] } {
  const records = new Map(initial.map((r) => [r.slotId, r]))
  const putCalls: string[] = []
  return {
    records,
    putCalls,
    list: async () => [...records.values()],
    put: async (r) => {
      putCalls.push(r.slotId)
      records.set(r.slotId, r)
    },
  }
}

describe('migrateGuestSaves', () => {
  it('tags every guest-owned save with the new owner', async () => {
    const store = memoryStore([save('autosave'), save('slot-1')])
    const result = await migrateGuestSaves(store, 'u1')
    expect(result).toEqual({ migrated: 2, skipped: 0 })
    expect(store.records.get('autosave')?.ownerId).toBe('u1')
    expect(store.records.get('slot-1')?.ownerId).toBe('u1')
  })

  it('leaves saves owned by another account untouched', async () => {
    const store = memoryStore([save('slot-1', 'other'), save('slot-2')])
    const result = await migrateGuestSaves(store, 'u1')
    expect(result).toEqual({ migrated: 1, skipped: 1 })
    expect(store.records.get('slot-1')?.ownerId).toBe('other')
    expect(store.records.get('slot-2')?.ownerId).toBe('u1')
  })

  it('is idempotent when re-run for the same owner', async () => {
    const store = memoryStore([save('slot-1')])
    await migrateGuestSaves(store, 'u1')
    const second = await migrateGuestSaves(store, 'u1')
    expect(second).toEqual({ migrated: 0, skipped: 1 })
  })

  it('issues a put for every guest save when migrating in parallel', async () => {
    // The concurrent `Promise.all` conversion must still write each guest record
    // exactly once — and only the guest ones, never the already-owned save.
    const store = countingStore([
      save('autosave'),
      save('slot-1'),
      save('slot-2'),
      save('owned', 'other'),
    ])
    const result = await migrateGuestSaves(store, 'u1')
    expect(result).toEqual({ migrated: 3, skipped: 1 })
    expect([...store.putCalls].sort()).toEqual(['autosave', 'slot-1', 'slot-2'])
    expect(store.records.get('owned')?.ownerId).toBe('other')
  })

  it('rejects the whole migration when one put fails', async () => {
    // Pre-existing contract: a single put failure rejects; a partial migration is
    // retried (idempotently) on the next upgrade rather than silently swallowed.
    const records = new Map([save('slot-1'), save('slot-2')].map((r) => [r.slotId, r]))
    const store: SaveStore = {
      list: async () => [...records.values()],
      put: async (r) => {
        if (r.slotId === 'slot-2') throw new Error('put failed')
        records.set(r.slotId, r)
      },
    }
    await expect(migrateGuestSaves(store, 'u1')).rejects.toThrow('put failed')
  })

  it('is idempotent when retried after a transient put failure', async () => {
    // First run: slot-2's put throws once, so the migration rejects with slot-1
    // already tagged. The retry must migrate only the leftover guest save, and a
    // further run must migrate nothing at all.
    const records = new Map([save('slot-1'), save('slot-2')].map((r) => [r.slotId, r]))
    let failNext = true
    const store: SaveStore = {
      list: async () => [...records.values()],
      put: async (r) => {
        if (failNext && r.slotId === 'slot-2') {
          failNext = false
          throw new Error('transient')
        }
        records.set(r.slotId, r)
      },
    }
    await expect(migrateGuestSaves(store, 'u1')).rejects.toThrow('transient')

    const retry = await migrateGuestSaves(store, 'u1')
    expect(retry).toEqual({ migrated: 1, skipped: 1 })
    expect([...records.values()].every((r) => r.ownerId === 'u1')).toBe(true)

    const third = await migrateGuestSaves(store, 'u1')
    expect(third).toEqual({ migrated: 0, skipped: 2 })
  })
})
