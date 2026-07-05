/**
 * Pairs the existing haptic categories (`../haptics`) with the matching SFX
 * clip, so call sites get one function instead of two parallel calls. Mirrors
 * the haptic doc-comments' own categories (light tap, confirmed action,
 * notify) rather than inventing a new taxonomy.
 */
import { hapticImpact, hapticNotify, hapticTap } from '../haptics'
import { audioManager } from './audioManager'
import { SFX } from './sfxClips'

/** Light tap — selection, sheet dismiss, tile tap: haptic + UI click SFX. */
export function tapFeedback(): void {
  hapticTap()
  audioManager.play(SFX.uiClick, { key: 'sfx-ui-click', category: 'sfx' })
}

/** Confirmed action — build, recruit, end turn, resign: haptic + UI click SFX. */
export function impactFeedback(): void {
  hapticImpact()
  audioManager.play(SFX.uiClick, { key: 'sfx-ui-click', category: 'sfx' })
}

/** Combat resolved (battle report / boarding melee opens): haptic + hit SFX. */
export function combatFeedback(): void {
  hapticNotify()
  audioManager.play(SFX.combatHit, { key: 'sfx-combat-hit', category: 'sfx' })
}

/** A captain relocates on the map: sail/wind whoosh, no haptic category fits. */
export function shipMoveFeedback(): void {
  audioManager.play(SFX.shipMovement, { key: 'sfx-ship-move', category: 'sfx' })
}

/** Gold/resource reward granted (encounter reward, trade, quest). */
export function coinFeedback(): void {
  audioManager.play(SFX.coinPickup, { key: 'sfx-coin', category: 'sfx' })
}

/** Generic success/notification — victory, level complete. */
export function notifyFeedback(): void {
  hapticNotify()
  audioManager.play(SFX.notificationChime, { key: 'sfx-notify', category: 'sfx' })
}
