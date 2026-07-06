import { afterEach, describe, expect, it, vi } from 'vitest'
import { initErrorReporting, reportError, resetErrorReportingForTests } from './reporting'

function fakeSentry() {
  return { init: vi.fn(), captureException: vi.fn() }
}

function flushMicrotasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  resetErrorReportingForTests()
})

describe('initErrorReporting', () => {
  it('never loads the SDK without a DSN', async () => {
    const load = vi.fn()
    initErrorReporting({ dsn: '', load })
    reportError(new Error('boom'))
    await flushMicrotasks()
    expect(load).not.toHaveBeenCalled()
  })

  it('initializes the SDK with the DSN and environment', async () => {
    const sentry = fakeSentry()
    initErrorReporting({
      dsn: 'https://dsn.example',
      environment: 'test',
      load: async () => sentry,
    })
    await flushMicrotasks()
    expect(sentry.init).toHaveBeenCalledWith({ dsn: 'https://dsn.example', environment: 'test' })
  })

  it('loads only once across repeat calls', async () => {
    const sentry = fakeSentry()
    const load = vi.fn(async () => sentry)
    initErrorReporting({ dsn: 'https://dsn.example', load })
    initErrorReporting({ dsn: 'https://dsn.example', load })
    await flushMicrotasks()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('a failed SDK load never throws into the app', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    initErrorReporting({
      dsn: 'https://dsn.example',
      load: () => Promise.reject(new Error('offline')),
    })
    reportError(new Error('boom'))
    await flushMicrotasks()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('reportError', () => {
  it('forwards the error and extra context to the SDK', async () => {
    const sentry = fakeSentry()
    initErrorReporting({ dsn: 'https://dsn.example', load: async () => sentry })
    await flushMicrotasks()
    const err = new Error('boom')
    reportError(err, { componentStack: 'at App' })
    await flushMicrotasks()
    expect(sentry.captureException).toHaveBeenCalledWith(err, {
      extra: { componentStack: 'at App' },
    })
  })

  it('captures errors raised while the SDK is still loading', async () => {
    const sentry = fakeSentry()
    let resolveLoad!: (s: typeof sentry) => void
    initErrorReporting({
      dsn: 'https://dsn.example',
      load: () => new Promise((resolve) => (resolveLoad = resolve)),
    })
    const err = new Error('early boom')
    reportError(err)
    resolveLoad(sentry)
    await flushMicrotasks()
    expect(sentry.captureException).toHaveBeenCalledWith(err, undefined)
  })
})
