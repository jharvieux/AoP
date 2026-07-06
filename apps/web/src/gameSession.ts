/**
 * Pure `isTestPlay` transition rules for App's game session (#236). Kept
 * separate from the React component so the load/rematch/autosave rules are
 * unit-testable without mounting a DOM.
 */

/**
 * Loading a saved slot always resumes a real game: the test-play flag never
 * survives a load, whatever it was set to beforehand. Without this, test-
 * playing a map and then loading a real save silently disables autosave for
 * the rest of that session.
 */
export function isTestPlayAfterLoadSlot(): boolean {
  return false
}

/**
 * A rematch replays the same config that just finished, so it must stay on
 * whichever side of test-play/real-game the finished match was — otherwise
 * "Play Again" from a finished test-play match flips isTestPlay to false and
 * autosaves a scratch match over the real autosave slot.
 */
export function isTestPlayAfterRematch(previousIsTestPlay: boolean): boolean {
  return previousIsTestPlay
}

/** Test-play matches skip autosave entirely (#41). */
export function shouldAutosave(isTestPlay: boolean): boolean {
  return !isTestPlay
}
