// Shared HTTP plumbing for every Edge Function: CORS, the error envelope, and
// JSON responses. Error codes match docs/MULTIPLAYER.md §5.

import { reportUnexpectedError } from './reporting.ts'

// --- CORS (#541) -------------------------------------------------------------
//
// Responses used to carry `Access-Control-Allow-Origin: *`. Instead we validate
// the request `Origin` against an allowlist and echo only a matching origin
// (with `Vary: Origin`). The allowlist is:
//   - the operator-configured `ALLOWED_ORIGINS` env var (comma-separated exact
//     origins), defaulting to the production web origin when unset;
//   - this project's Vercel preview deploys (`https://age-of-plunder-*.vercel.app`);
//   - localhost / loopback dev origins (any port, http or https);
//   - the iOS Capacitor WebView origin (`capacitor://localhost`). Android
//     Capacitor uses `https://localhost`, already covered by the localhost rule.
//
// A request with no `Origin` header (server-to-server: the Stripe webhook, cron
// sweeps) is unaffected — CORS is a browser mechanism, so those responses simply
// carry no ACAO header, exactly as a non-browser caller expects. No
// `Access-Control-Allow-Credentials` is set, so no credentialed-wildcard risk.

const DEFAULT_ALLOWED_ORIGINS = ['https://age-of-plunder.vercel.app']

/** Vercel preview URLs for this project: `https://age-of-plunder-<suffix>.vercel.app`. */
const VERCEL_PREVIEW = /^https:\/\/age-of-plunder-[a-z0-9-]+\.vercel\.app$/
/** Localhost / loopback dev origins, any port, http or https (covers Android Capacitor). */
const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/
/** iOS Capacitor WebView origin. */
const CAPACITOR = /^capacitor:\/\/localhost$/

const DEV_ORIGIN_PATTERNS = [VERCEL_PREVIEW, LOCALHOST, CAPACITOR]

/**
 * Pure origin-matcher (unit-tested): true when `origin` is exactly on the
 * `allowlist` or matches one of the always-allowed dev/app patterns. A missing
 * origin is never a match.
 */
export function isAllowedOrigin(
  origin: string | null | undefined,
  allowlist: readonly string[],
): boolean {
  if (!origin) return false
  if (allowlist.includes(origin)) return true
  return DEV_ORIGIN_PATTERNS.some((re) => re.test(origin))
}

/** The env-configured exact-origin allowlist, or the production default when unset. */
function configuredOrigins(): string[] {
  let raw: string | undefined
  try {
    // deno-lint-ignore no-explicit-any
    raw = (globalThis as any).Deno?.env?.get('ALLOWED_ORIGINS')
  } catch {
    // No --allow-env (e.g. unit tests): fall back to the production default.
  }
  const parsed = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  return parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_ORIGINS]
}

/**
 * CORS headers for a given request: static allow-headers/methods plus `Vary:
 * Origin`, and `Access-Control-Allow-Origin` echoed only when the request's
 * `Origin` is allowed. Requests with no/disallowed origin get no ACAO header.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  const origin = req.headers.get('Origin')
  if (isAllowedOrigin(origin, configuredOrigins())) {
    headers['Access-Control-Allow-Origin'] = origin!
  }
  return headers
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

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

/**
 * Turn any thrown value into the error envelope. Deliberately terse: a
 * `SEQ_CONFLICT` (or any rejection) carries no action content, so it can never
 * become a side channel for an opponent's move (§7 leak-audit checklist).
 * INTERNAL errors (#337) never leak raw database error messages to the client,
 * but are logged server-side for debugging.
 */
export function errorResponse(req: Request, err: unknown): Response {
  if (err instanceof AppError) {
    if (err.code === 'INTERNAL') {
      console.error('Internal error', err.message)
    }
    const message = err.code === 'INTERNAL' ? 'Internal error' : err.message
    return jsonResponse(req, { error: { code: err.code, message } }, STATUS[err.code])
  }
  // Anything that isn't an AppError is an unexpected throw — a bug, not a
  // domain failure. Log it for the pull-logs and report it to Sentry (#252).
  console.error('Unexpected error', err)
  reportUnexpectedError(err)
  return jsonResponse(
    req,
    { error: { code: 'INTERNAL', message: 'Unexpected error' } },
    STATUS.INTERNAL,
  )
}

/** Standard preflight + method guard. Returns a Response to short-circuit, or null to proceed. */
export function guardMethod(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return errorResponse(req, new AppError('BAD_REQUEST', 'POST only'))
  return null
}
