/**
 * Live-spectate refetch loop (#149), the polling sibling of turnSync.ts/
 * chatSync.ts. Those two react to a Realtime broadcast poke on `match:{id}`;
 * this app's client has no concrete Realtime transport wired up anywhere yet
 * (see turnSync.ts, reconnectSync.ts — deliberately headless, awaiting a
 * future live-match screen; and auth/supabaseAuth.ts, which avoids
 * `@supabase/supabase-js` outright), so the spectate screen instead drives its
 * `get-player-view` refetch off a plain interval timer.
 *
 * Headless and dependency-injected like its siblings: the caller supplies the
 * timer (real `setInterval`/`clearInterval` in the app, a fake in tests) and
 * the refetch callback, so the loop itself is unit-testable without real
 * wall-clock time.
 */

/** The timer a spectate screen wires up (the global `setInterval`/`clearInterval`, or a fake in tests). */
export interface PollTimer {
  setInterval(handler: () => void, ms: number): number
  clearInterval(id: number): void
}

const globalTimer: PollTimer = {
  setInterval: (handler, ms) => setInterval(handler, ms) as unknown as number,
  clearInterval: (id) => clearInterval(id),
}

export interface SpectatePollOptions {
  intervalMs: number
  /** Refetch `get-player-view` and apply the result. Errors are the caller's concern. */
  onTick: () => void | Promise<void>
  timer?: PollTimer
}

/**
 * Start polling `onTick` every `intervalMs`. Returns a function that stops the
 * loop. Does not call `onTick` immediately — the initial `get-player-view`
 * fetch is a separate, one-off call the screen makes on mount so it can show
 * an error state before the first interval elapses; this loop only covers the
 * ongoing refetch cadence.
 */
export function subscribeSpectatePoll(options: SpectatePollOptions): () => void {
  const { intervalMs, onTick, timer = globalTimer } = options
  const id = timer.setInterval(() => {
    void onTick()
  }, intervalMs)
  return () => timer.clearInterval(id)
}
