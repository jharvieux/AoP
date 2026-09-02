// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { createElement, useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const pixi = vi.hoisted(() => {
  const init = vi.fn(() => Promise.resolve())
  const destroy = vi.fn()
  class Application {
    canvas = document.createElement('canvas')
    renderer = {}
    init = init
    destroy = destroy
  }
  return { init, destroy, Application }
})

vi.mock('pixi.js', () => ({
  Application: pixi.Application,
  TextureSource: { defaultOptions: {} },
}))

import { toError, usePixiApp } from './usePixiApp'

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

describe('usePixiApp', () => {
  afterEach(() => {
    pixi.init.mockClear()
    pixi.destroy.mockClear()
  })

  it('initializes the real hook lifecycle, appends the canvas, and tears it down', async () => {
    let latest: ReturnType<typeof usePixiApp> | undefined
    function Probe() {
      const value = usePixiApp({ background: '#123456' })
      useEffect(() => {
        latest = value
      })
      return createElement('div', { 'data-testid': 'pixi-container', ref: value.containerRef })
    }
    const { getByTestId, unmount } = render(createElement(Probe))
    const container = getByTestId('pixi-container')

    await waitFor(() => expect(pixi.init).toHaveBeenCalledOnce())
    await waitFor(() => expect(latest?.app).toBeDefined())
    expect(pixi.init).toHaveBeenCalledWith(
      expect.objectContaining({
        preference: 'webgl',
        resizeTo: container,
        background: '#123456',
        antialias: true,
        roundPixels: true,
      }),
    )
    expect(container.querySelector('canvas')).toBe(latest!.app!.canvas)

    unmount()
    expect(pixi.destroy).toHaveBeenCalledWith(true)
  })
})
