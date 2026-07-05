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
})
