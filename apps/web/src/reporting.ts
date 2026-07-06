/**
 * Client error reporting (#252). Before this, a production crash was a white
 * screen reported by nobody — no SDK, no global handlers, first detection
 * channel a user complaint.
 *
 * Sentry is loaded lazily and only when `VITE_SENTRY_DSN` is configured, so
 * local dev and DSN-less deploys pay zero bundle/runtime cost and tests never
 * touch the real SDK. Once initialized, Sentry's default integrations install
 * the global `window.onerror`/`onunhandledrejection` hooks; `reportError` is
 * for errors our own code already catches (the ErrorBoundary, the engine
 * unrecoverable path) that would otherwise never reach those hooks.
 */

interface SentryLike {
  init(options: { dsn: string; environment: string; release?: string }): void
  captureException(error: unknown, context?: { extra?: Record<string, unknown> }): unknown
}

const loadSentry = () => import('@sentry/browser')

let sdk: SentryLike | null = null
let loading: Promise<void> | null = null

/**
 * Start loading + initializing Sentry if a DSN is configured. Safe to call
 * unconditionally at startup; a no-op without a DSN or on repeat calls.
 * Injection points (`dsn`, `load`) exist for tests only.
 */
export function initErrorReporting(
  options: { dsn?: string; environment?: string; load?: () => Promise<SentryLike> } = {},
): void {
  const dsn = options.dsn ?? import.meta.env.VITE_SENTRY_DSN
  if (!dsn || loading) return
  const load = options.load ?? loadSentry
  loading = load()
    .then((sentry) => {
      sentry.init({ dsn, environment: options.environment ?? import.meta.env.MODE })
      sdk = sentry
    })
    .catch((err: unknown) => {
      // Reporting must never break the app it reports on — but say so once.
      console.error('Error reporting failed to initialize', err)
    })
}

/**
 * Capture a caught error. No-op unless `initErrorReporting` found a DSN.
 * Errors raised while the SDK is still loading are captured once it lands
 * (they ride the `loading` promise), not dropped.
 */
export function reportError(error: unknown, extra?: Record<string, unknown>): void {
  if (!loading) return
  void loading.then(() => {
    sdk?.captureException(error, extra ? { extra } : undefined)
  })
}

/** Test-only: reset module state between cases. */
export function resetErrorReportingForTests(): void {
  sdk = null
  loading = null
}
