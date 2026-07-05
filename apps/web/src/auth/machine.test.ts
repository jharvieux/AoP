import { describe, expect, it } from 'vitest'
import { authReducer } from './machine'
import { GUEST_STATE, type AuthSession, type AuthState } from './types'

const SESSION: AuthSession = {
  accessToken: 'a',
  refreshToken: 'r',
  expiresAt: 1000,
  user: { id: 'u1', email: 'cap@plunder.io' },
}

describe('authReducer', () => {
  it('promotes a guest to authenticated on sign-in', () => {
    const next = authReducer(GUEST_STATE, { type: 'authenticated', session: SESSION })
    expect(next).toEqual({ status: 'authenticated', user: SESSION.user, session: SESSION })
  })

  it('returns to guest on sign-out', () => {
    const authed: AuthState = { status: 'authenticated', user: SESSION.user, session: SESSION }
    expect(authReducer(authed, { type: 'signed_out' })).toEqual(GUEST_STATE)
  })

  it('signing out while already a guest is idempotent', () => {
    expect(authReducer(GUEST_STATE, { type: 'signed_out' })).toEqual(GUEST_STATE)
  })

  it('applies a refreshed session while authenticated', () => {
    const authed: AuthState = { status: 'authenticated', user: SESSION.user, session: SESSION }
    const fresh: AuthSession = { ...SESSION, accessToken: 'a2', expiresAt: 2000 }
    const next = authReducer(authed, { type: 'session_refreshed', session: fresh })
    expect(next).toEqual({ status: 'authenticated', user: fresh.user, session: fresh })
  })

  it('ignores a refresh while a guest (no session to update)', () => {
    expect(authReducer(GUEST_STATE, { type: 'session_refreshed', session: SESSION })).toEqual(
      GUEST_STATE,
    )
  })
})
