/**
 * Thin wrapper over the web Vibration API (#27) so call sites don't need
 * feature detection — most desktop browsers and iOS Safari have no
 * `navigator.vibrate`, so every export here is a safe no-op there. Phase 4
 * native builds can swap `fire()`'s body for `@capacitor/haptics` without
 * touching any call site, since the three named exports below are the
 * whole public surface.
 */

type VibratePattern = number | number[]

function fire(pattern: VibratePattern): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false
  return navigator.vibrate(pattern)
}

/** Light tap — selection, sheet swipe-dismiss, tile tap. */
export function hapticTap(): boolean {
  return fire(10)
}

/** Confirmed action — build, recruit, end turn, resign. */
export function hapticImpact(): boolean {
  return fire(20)
}

/** Combat resolution or other significant event. */
export function hapticNotify(): boolean {
  return fire([15, 40, 15])
}
