import { GUEST_STATE, type AuthSession, type AuthState } from './types'

/**
 * Pure transitions for the guest⇄account state machine. Kept separate from the
 * React provider and the network backend so the transition rules are testable
 * in isolation and can never diverge from what the UI renders.
 */
export type AuthEvent =
  | { type: 'authenticated'; session: AuthSession }
  | { type: 'session_refreshed'; session: AuthSession }
  | { type: 'signed_out' }

export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'authenticated':
      return { status: 'authenticated', user: event.session.user, session: event.session }
    case 'session_refreshed':
      // Only meaningful while authenticated; a refresh in guest state is a no-op.
      if (state.status !== 'authenticated') return state
      return { status: 'authenticated', user: event.session.user, session: event.session }
    case 'signed_out':
      return GUEST_STATE
  }
}
