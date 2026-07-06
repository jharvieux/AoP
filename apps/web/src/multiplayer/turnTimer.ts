/**
 * Turn-timer countdown + turn-change detection (#35), the client-visible half
 * of the §8 turn-clock machinery. The server already runs the authoritative
 * timer (`matches.turn_deadline`, set on every turn advance) and the sweep
 * (`sweep-turns`: auto-skip, `missed_turns`, `ai_takeover`); nothing here is a
 * source of truth. These are pure projections of the `turnDeadline` string
 * `get-player-view` returns and of view-to-view transitions, so the match
 * screen can show "your move, N:NN left before auto-skip" and fire a local
 * "your turn" notification — unit-testable with no clock and no React.
 */

/** Seconds-left threshold below which the UI styles the countdown as urgent. */
export const URGENT_COUNTDOWN_SECONDS = 60

export interface TurnCountdown {
  /** Whole seconds until the server's auto-skip deadline, clamped at 0. */
  remainingSeconds: number
  /** Deadline passed: the sweep may skip this turn at any moment. */
  expired: boolean
  urgent: boolean
}

/**
 * Project `turnDeadline` (ISO timestamp, or null for an untimed match) against
 * `nowMs`. Returns null when there is no ticking clock to show — no deadline,
 * or an unparseable one (never render garbage off a malformed server string).
 */
export function turnCountdown(turnDeadline: string | null, nowMs: number): TurnCountdown | null {
  if (!turnDeadline) return null
  const deadlineMs = Date.parse(turnDeadline)
  if (Number.isNaN(deadlineMs)) return null
  const remainingSeconds = Math.max(0, Math.floor((deadlineMs - nowMs) / 1000))
  return {
    remainingSeconds,
    expired: deadlineMs <= nowMs,
    urgent: remainingSeconds <= URGENT_COUNTDOWN_SECONDS,
  }
}

/** `"m:ss"` under an hour, `"1h 05m"` above — async turn clocks can be hours long. */
export function formatCountdown(remainingSeconds: number): string {
  const s = Math.max(0, Math.floor(remainingSeconds))
  if (s < 3600) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

/**
 * The minimal `PlayerView` slice turn logic reads, kept structural so tests
 * (and any caller holding a full `PlayerView`) satisfy it without casts.
 */
export interface TurnViewLike {
  viewerId: string
  currentPlayerIndex: number
  players: readonly { id: string }[]
  status: string
}

/** Whether the viewer's own seat is on the clock in `view`. */
export function isViewerTurn(view: TurnViewLike): boolean {
  return view.status === 'active' && view.players[view.currentPlayerIndex]?.id === view.viewerId
}

export type TurnTransition = 'your-turn' | 'turn-passed' | null

/**
 * Classify a view refetch for notification purposes: `'your-turn'` when the
 * turn just arrived on the viewer's seat (including the first fetch of a match
 * that is already waiting on them — coming back to a match you're holding up
 * deserves the nudge), `'turn-passed'` when it just left it, null otherwise.
 */
export function detectTurnTransition(
  prev: TurnViewLike | null,
  next: TurnViewLike,
): TurnTransition {
  const wasMyTurn = prev !== null && isViewerTurn(prev)
  const isMyTurn = isViewerTurn(next)
  if (!wasMyTurn && isMyTurn) return 'your-turn'
  if (wasMyTurn && !isMyTurn) return 'turn-passed'
  return null
}
