// Bounded-concurrency map for per-match authoritative pipelines (#570). The
// turn sweep and snapshot compaction both loop over an unbounded (or 50-capped)
// match set, running a whole multi-statement pipeline per match. A naive
// `Promise.all` would fan out every match's transactions at once across the
// shared pgbouncer pool on the multiplayer authority surface — pool exhaustion
// and connection-starvation risk. This runs at most `limit` pipelines at a time
// while keeping each match's own pipeline internally sequential (the caller's
// `fn` awaits its own statements in order).
//
// Guarantees the callers depend on:
//  - Result order matches input order (`results[i]`), so oldest-deadline-first
//    sweep ordering and the returned result array are preserved regardless of
//    which match finishes first.
//  - Per-match failure isolation: one match's rejection never aborts the others;
//    every item is still attempted. If any `fn` rejected, the lowest-index
//    rejection is rethrown after all work settles, so the surfaced error is
//    deterministic (independent of completion timing).

/**
 * Map `items` through `fn` with at most `limit` concurrent in-flight calls,
 * returning results in input order. If one or more `fn` calls reject, all items
 * are still attempted and the rejection from the lowest input index is thrown.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const failures: { index: number; error: unknown }[] = []
  let nextIndex = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = nextIndex++
      if (i >= items.length) return
      try {
        results[i] = await fn(items[i]!, i)
      } catch (error) {
        failures.push({ index: i, error })
      }
    }
  }

  const width = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: width }, () => worker()))

  if (failures.length > 0) {
    failures.sort((a, b) => a.index - b.index)
    throw failures[0]!.error
  }
  return results
}
