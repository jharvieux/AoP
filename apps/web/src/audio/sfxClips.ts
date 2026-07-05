const BASE = '/audio/sfx'

/**
 * Generic gameplay SFX generated locally via procedural synthesis (numpy/scipy;
 * see docs/runbooks/music-sfx-generation.md) — no ML model, since short UI/impact
 * blips don't benefit from one.
 */
export const SFX = {
  uiClick: `${BASE}/ui_click.wav`,
  combatHit: `${BASE}/combat_hit.wav`,
  shipMovement: `${BASE}/ship_movement.wav`,
  coinPickup: `${BASE}/coin_pickup.wav`,
  notificationChime: `${BASE}/notification_chime.wav`,
} as const
