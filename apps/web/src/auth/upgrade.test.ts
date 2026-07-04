import { describe, expect, it, vi } from 'vitest'
import { upgradeGuestToAccount } from './upgrade'
import type { AuthBackend, AuthSession, Profile } from './types'
import type { SaveRecord, SaveStore } from '../storage'

const SESSION: AuthSession = {
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: Date.now() + 3600_000,
  user: { id: 'user-1', email: 'cap@plunder.io' },
}
const PROFILE: Profile = { id: 'user-1', displayName: 'Captain' }

function guestSave(slotId: string): SaveRecord {
  return {
    slotId,
    schemaVersion: 2,
    config: {} as SaveRecord['config'],
    actions: [],
    round: 1,
    savedAt: 0,
  }
}

function fakeBackend(): AuthBackend {
  return {
    signUp: vi.fn(async () => SESSION),
    signInWithPassword: vi.fn(),
    refreshSession: vi.fn(),
    signOut: vi.fn(),
    oauthAuthorizeUrl: vi.fn(() => ''),
    ensureProfile: vi.fn(async () => PROFILE),
    getProfile: vi.fn(),
    updateDisplayName: vi.fn(),
  } as unknown as AuthBackend
}

function memoryStore(initial: SaveRecord[]): SaveStore & { records: Map<string, SaveRecord> } {
  const records = new Map(initial.map((r) => [r.slotId, r]))
  return {
    records,
    list: async () => [...records.values()],
    put: async (r) => void records.set(r.slotId, r),
  }
}

describe('upgradeGuestToAccount', () => {
  it('creates the account, writes the profile, and migrates guest saves', async () => {
    const backend = fakeBackend()
    const store = memoryStore([guestSave('autosave')])

    const result = await upgradeGuestToAccount(backend, store, {
      email: 'cap@plunder.io',
      password: 'hunter2',
      displayName: 'Captain',
    })

    expect(backend.signUp).toHaveBeenCalledWith('cap@plunder.io', 'hunter2', 'Captain')
    expect(backend.ensureProfile).toHaveBeenCalledWith(SESSION, 'Captain')
    expect(result.session).toBe(SESSION)
    expect(result.profile).toEqual(PROFILE)
    expect(result.migration).toEqual({ migrated: 1, skipped: 0 })
    expect(store.records.get('autosave')?.ownerId).toBe('user-1')
  })

  it('does not migrate saves if account creation fails', async () => {
    const backend = fakeBackend()
    ;(backend.signUp as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))
    const store = memoryStore([guestSave('autosave')])

    await expect(
      upgradeGuestToAccount(backend, store, {
        email: 'cap@plunder.io',
        password: 'hunter2',
        displayName: 'Captain',
      }),
    ).rejects.toThrow('boom')
    expect(backend.ensureProfile).not.toHaveBeenCalled()
    expect(store.records.get('autosave')?.ownerId).toBeUndefined()
  })
})
