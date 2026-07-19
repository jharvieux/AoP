// Deno tests for `_shared/http.ts`'s error envelope, origin-aware CORS (#541),
// and `_shared/reporting.ts`'s disabled-by-default path (#252). Run permissionless
// like match.test.ts:
//   deno test --import-map supabase/functions/deno.json supabase/functions/_shared/http.test.ts
// `deno test` grants no --allow-env, which doubles as the DSN-less production
// case: reporting must be a silent no-op, never a throw into the handler. Without
// --allow-env, corsHeaders falls back to the default allowlist (the production
// web origin), so these tests are deterministic against that.
import { assertEquals } from 'jsr:@std/assert@1'
import {
  AppError,
  corsHeaders,
  errorResponse,
  guardMethod,
  isAllowedOrigin,
  jsonResponse,
} from './http.ts'
import { reportUnexpectedError } from './reporting.ts'

const PROD = 'https://age-of-plunder.vercel.app'

/** A bare Request carrying an optional Origin header. */
function req(origin?: string, method = 'POST'): Request {
  return new Request('https://fn.example', {
    method,
    headers: origin ? { Origin: origin } : {},
  })
}

Deno.test('errorResponse: AppError maps to its envelope and status', async () => {
  const res = errorResponse(req(), new AppError('NOT_YOUR_TURN', 'seat 2 is up'))
  assertEquals(res.status, 409)
  const body = await res.json()
  assertEquals(body, { error: { code: 'NOT_YOUR_TURN', message: 'seat 2 is up' } })
})

Deno.test('errorResponse: an unexpected throw still returns the INTERNAL envelope', async () => {
  const res = errorResponse(req(), new TypeError('cannot read properties of undefined'))
  assertEquals(res.status, 500)
  const body = await res.json()
  assertEquals(body.error.code, 'INTERNAL')
})

Deno.test('errorResponse: a non-Error throw gets the generic message', async () => {
  const res = errorResponse(req(), 'boom')
  assertEquals(res.status, 500)
  const body = await res.json()
  assertEquals(body.error.message, 'Unexpected error')
})

Deno.test('reportUnexpectedError: no-op without a DSN (and without env permission)', () => {
  reportUnexpectedError(new Error('unreported'))
})

Deno.test('isAllowedOrigin: exact allowlist, dev/app patterns, and rejects', () => {
  const list = [PROD]
  // Exact allowlist entry.
  assertEquals(isAllowedOrigin(PROD, list), true)
  // Vercel preview deploys for this project.
  assertEquals(isAllowedOrigin('https://age-of-plunder-git-feat-abc123.vercel.app', list), true)
  // Localhost / loopback dev origins, any port, http or https (Android Capacitor too).
  assertEquals(isAllowedOrigin('http://localhost:5173', list), true)
  assertEquals(isAllowedOrigin('https://localhost', list), true)
  assertEquals(isAllowedOrigin('http://127.0.0.1:3000', list), true)
  // iOS Capacitor WebView origin.
  assertEquals(isAllowedOrigin('capacitor://localhost', list), true)
  // Rejections: a foreign origin, a look-alike host, an all-of-vercel origin, and no origin.
  assertEquals(isAllowedOrigin('https://evil.example', list), false)
  assertEquals(isAllowedOrigin('https://age-of-plunder.vercel.app.evil.com', list), false)
  assertEquals(isAllowedOrigin('https://some-other-app.vercel.app', list), false)
  assertEquals(isAllowedOrigin(null, list), false)
  assertEquals(isAllowedOrigin('', list), false)
})

Deno.test('corsHeaders: echoes an allowed origin with Vary: Origin', () => {
  const headers = corsHeaders(req(PROD))
  assertEquals(headers['Access-Control-Allow-Origin'], PROD)
  assertEquals(headers['Vary'], 'Origin')
})

Deno.test('corsHeaders: no ACAO for a disallowed origin, but still Vary: Origin', () => {
  const headers = corsHeaders(req('https://evil.example'))
  assertEquals(headers['Access-Control-Allow-Origin'], undefined)
  assertEquals(headers['Vary'], 'Origin')
})

Deno.test('corsHeaders: server-to-server (no Origin) gets no ACAO header', () => {
  const headers = corsHeaders(req())
  assertEquals(headers['Access-Control-Allow-Origin'], undefined)
})

Deno.test('guardMethod: OPTIONS preflight echoes an allowed origin', () => {
  const res = guardMethod(req(PROD, 'OPTIONS'))
  assertEquals(res?.headers.get('Access-Control-Allow-Origin'), PROD)
})

Deno.test('jsonResponse: echoes an allowed origin onto the response', () => {
  const res = jsonResponse(req(PROD), { ok: true })
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), PROD)
  assertEquals(res.headers.get('Vary'), 'Origin')
})
