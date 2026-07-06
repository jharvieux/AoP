/**
 * Debounce scheduler for map-editor draft autosave (#238): sculpting fires a
 * `schedule(draft)` call on every change, and the actual write only happens
 * once `delayMs` passes with no further calls, so a continuous paint stroke
 * doesn't hammer IndexedDB on every tile.
 *
 * The timer is injected (same DI pattern as multiplayer/spectatePoll.ts) so
 * the debounce behavior is unit-testable without real wall-clock time or a
 * DOM environment; the actual persistence (mapEditor/storage.ts's
 * saveDraft/setActiveDraftId) is wired up by the caller's `save` callback.
 */
export interface DebounceTimer {
  setTimeout(handler: () => void, ms: number): number
  clearTimeout(id: number): void
}

const globalTimer: DebounceTimer = {
  setTimeout: (handler, ms) => setTimeout(handler, ms) as unknown as number,
  clearTimeout: (id) => clearTimeout(id),
}

export interface AutosaveSchedulerOptions<T> {
  delayMs: number
  save: (value: T) => void | Promise<void>
  timer?: DebounceTimer
}

export interface AutosaveScheduler<T> {
  /** Call on every change; (re)starts the debounce window from now. */
  schedule(value: T): void
  /** Cancels a pending save with nothing scheduled in its place — call this on
   * unmount so a stale write doesn't land after the caller's torn down. */
  cancel(): void
}

export function createAutosaveScheduler<T>(
  options: AutosaveSchedulerOptions<T>,
): AutosaveScheduler<T> {
  const { delayMs, save, timer = globalTimer } = options
  let pendingId: number | null = null

  function schedule(value: T): void {
    if (pendingId !== null) timer.clearTimeout(pendingId)
    pendingId = timer.setTimeout(() => {
      pendingId = null
      void save(value)
    }, delayMs)
  }

  function cancel(): void {
    if (pendingId !== null) timer.clearTimeout(pendingId)
    pendingId = null
  }

  return { schedule, cancel }
}
