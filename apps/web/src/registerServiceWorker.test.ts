import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './registerServiceWorker'

type Listener = () => void

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const originalWindow = globalThis.window

afterEach(() => {
  if (originalServiceWorker) {
    Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
  } else {
    // @ts-expect-error -- test-only cleanup of a property we stub per-test
    delete navigator.serviceWorker
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
})

function stubWindow() {
  const listeners = new Map<string, Listener>()
  const reload = vi.fn()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: vi.fn((type: string, listener: Listener) => listeners.set(type, listener)),
      location: { reload },
    },
  })
  return { listeners, reload }
}

describe('registerServiceWorker', () => {
  it('is a no-op when serviceWorker is present but unavailable', () => {
    const { listeners } = stubWindow()
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined })

    expect(() => registerServiceWorker(vi.fn())).not.toThrow()
    expect(listeners).toEqual(new Map())
  })

  it('registers and reloads on controllerchange with a supported container', () => {
    const { listeners, reload } = stubWindow()
    const controllerChange = vi.fn()
    const serviceWorker = {
      register: vi.fn().mockResolvedValue({ addEventListener: vi.fn() }),
      addEventListener: vi.fn((type: string, listener: Listener) => {
        if (type === 'controllerchange') controllerChange.mockImplementation(listener)
      }),
    }
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })

    registerServiceWorker(vi.fn())
    listeners.get('load')?.()
    controllerChange()
    controllerChange()

    expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js')
    expect(reload).toHaveBeenCalledOnce()
  })
})
