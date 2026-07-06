import { describe, expect, it } from 'vitest'
import { toError } from './usePixiApp'

/**
 * `usePixiApp` itself (a hook wrapping the real Pixi `Application.init()`
 * lifecycle against a live canvas/WebGL context) isn't unit-testable in this
 * project — there's no jsdom/testing-library setup for mounting hooks, and no
 * existing precedent for it (every other test in this app drives plain
 * functions or the engine directly). `toError` is the one piece of real
 * branching logic in the #241 fix — normalizing whatever
 * `Application.init()`'s rejection carries into a genuine `Error` so
 * `MapCanvas`'s fallback can always read `.message` — so that's what's
 * covered here.
 */
describe('toError', () => {
  it('passes an Error instance through unchanged', () => {
    const err = new Error('context lost')
    expect(toError(err)).toBe(err)
  })

  it('wraps a non-Error rejection reason (e.g. a bare string) in an Error', () => {
    const wrapped = toError('WebGL context creation failed')
    expect(wrapped).toBeInstanceOf(Error)
    expect(wrapped.message).toBe('WebGL context creation failed')
  })

  it('wraps undefined/null rejection reasons without throwing', () => {
    expect(toError(undefined).message).toBe('undefined')
    expect(toError(null).message).toBe('null')
  })
})
