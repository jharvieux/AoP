// Shared HTTP plumbing for every Edge Function: CORS, the error envelope, and
// JSON responses. Error codes match docs/MULTIPLAYER.md §5.

import { reportUnexpectedError } from './reporting.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export type ErrorCode =
  | 'NOT_FOUND'
  | 'NOT_YOUR_TURN'
  | 'SEQ_CONFLICT'
  | 'INVALID_ACTION'
  | 'MATCH_STATE'
  | 'FORBIDDEN'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'ALREADY_OWNED'
  // Battle sessions (#408, docs/design/multiplayer-tactical-probe.md §3): an
  // interactive battle is open, so a state-advancing action is blocked; a stale
  // per-side order CAS lost; or a non-participant seat tried to record a pick.
  | 'BATTLE_PENDING'
  | 'ORDERS_CONFLICT'
  | 'NOT_A_PARTICIPANT'
  | 'INTERNAL'

const STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  NOT_YOUR_TURN: 409,
  SEQ_CONFLICT: 409,
  INVALID_ACTION: 422,
  MATCH_STATE: 409,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  RATE_LIMITED: 429,
  ALREADY_OWNED: 409,
  BATTLE_PENDING: 409,
  ORDERS_CONFLICT: 409,
  NOT_A_PARTICIPANT: 403,
  INTERNAL: 500,
}

/** A failure that maps to the shared `{ error: { code, message } }` envelope. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Turn any thrown value into the error envelope. Deliberately terse: a
 * `SEQ_CONFLICT` (or any rejection) carries no action content, so it can never
 * become a side channel for an opponent's move (§7 leak-audit checklist).
 * INTERNAL errors (#337) never leak raw database error messages to the client,
 * but are logged server-side for debugging.
 */
export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    if (err.code === 'INTERNAL') {
      console.error('Internal error', err.message)
    }
    const message = err.code === 'INTERNAL' ? 'Internal error' : err.message
    return jsonResponse({ error: { code: err.code, message } }, STATUS[err.code])
  }
  // Anything that isn't an AppError is an unexpected throw — a bug, not a
  // domain failure. Log it for the pull-logs and report it to Sentry (#252).
  console.error('Unexpected error', err)
  reportUnexpectedError(err)
  return jsonResponse({ error: { code: 'INTERNAL', message: 'Unexpected error' } }, STATUS.INTERNAL)
}

/** Standard preflight + method guard. Returns a Response to short-circuit, or null to proceed. */
export function guardMethod(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorResponse(new AppError('BAD_REQUEST', 'POST only'))
  return null
}
