// Deno tests for `_shared/http.ts`'s error envelope and `_shared/reporting.ts`'s
// disabled-by-default path (#252). Run permissionless like match.test.ts:
//   deno test --import-map supabase/functions/deno.json supabase/functions/_shared/http.test.ts
// `deno test` grants no --allow-env, which doubles as the DSN-less production
// case: reporting must be a silent no-op, never a throw into the handler.
import { assertEquals } from 'jsr:@std/assert@1'
import { AppError, errorResponse } from './http.ts'
import { reportUnexpectedError } from './reporting.ts'

Deno.test('errorResponse: AppError maps to its envelope and status', async () => {
  const res = errorResponse(new AppError('NOT_YOUR_TURN', 'seat 2 is up'))
  assertEquals(res.status, 409)
  const body = await res.json()
  assertEquals(body, { error: { code: 'NOT_YOUR_TURN', message: 'seat 2 is up' } })
})

Deno.test('errorResponse: an unexpected throw still returns the INTERNAL envelope', async () => {
  const res = errorResponse(new TypeError('cannot read properties of undefined'))
  assertEquals(res.status, 500)
  const body = await res.json()
  assertEquals(body.error.code, 'INTERNAL')
})

Deno.test('errorResponse: a non-Error throw gets the generic message', async () => {
  const res = errorResponse('boom')
  assertEquals(res.status, 500)
  const body = await res.json()
  assertEquals(body.error.message, 'Unexpected error')
})

Deno.test('reportUnexpectedError: no-op without a DSN (and without env permission)', () => {
  reportUnexpectedError(new Error('unreported'))
})
