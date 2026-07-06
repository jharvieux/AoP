// Server-side error reporting (#252). An unexpected throw in an Edge Function
// used to collapse to a 500 envelope plus, at best, a console.error into
// short-retention pull-only logs — nothing ever alerted anyone. errorResponse
// now routes every unexpected throw here; with a `SENTRY_DSN` secret set it
// lands in Sentry, without one this whole module is a no-op.

interface SentryLike {
  init(options: { dsn: string }): void
  captureException(error: unknown): unknown
  flush(timeout?: number): Promise<boolean>
}

function sentryDsn(): string | undefined {
  try {
    return Deno.env.get('SENTRY_DSN') ?? undefined
  } catch {
    // No --allow-env (deno test runs permissionless) — reporting disabled.
    return undefined
  }
}

let sdk: Promise<SentryLike> | null = null

/**
 * Fire-and-forget capture of an unexpected error. Never throws and never
 * blocks the response; the capture+flush promise is handed to
 * `EdgeRuntime.waitUntil` when available so the isolate outlives the response
 * long enough to deliver it.
 */
export function reportUnexpectedError(err: unknown): void {
  const dsn = sentryDsn()
  if (!dsn) return
  sdk ??= import('@sentry/deno').then((sentry) => {
    sentry.init({ dsn })
    return sentry
  })
  const delivery = sdk
    .then((sentry) => {
      sentry.captureException(err)
      return sentry.flush(2000)
    })
    .catch((reportingErr: unknown) => {
      console.error('Error reporting failed', reportingErr)
      return false
    })
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime
  if (runtime?.waitUntil) runtime.waitUntil(delivery)
}
