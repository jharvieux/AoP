/**
 * Generated action-icon art (#26/#89), served from `apps/web/public/art/ui`. This is a
 * bounded, representative subset of the app's buttons (core play-loop actions), not
 * exhaustive coverage — every consumer treats an entry as optional and keeps its existing
 * text-only button as the fallback if a specific icon isn't here, same convention as
 * `FACTIONS`' sprite fields (#115).
 */
export const UI_ICON: Partial<
  Record<'attack' | 'endTurn' | 'build' | 'recruit' | 'load' | 'unload' | 'upgradeShip', string>
> = {
  attack: '/art/ui/attack.png',
  endTurn: '/art/ui/end_turn.png',
  build: '/art/ui/build.png',
  recruit: '/art/ui/recruit.png',
  load: '/art/ui/load.png',
  unload: '/art/ui/unload.png',
  upgradeShip: '/art/ui/upgrade.png',
}

/**
 * Match-outcome status icons (#89 item 4 follow-up audit): `GameOverScreen` was the one
 * remaining spot still rendering raw platform emoji (🏆/💀/⚔️) instead of generated art —
 * inconsistent across devices/OSes and the single most visible "status" moment in a match.
 * Same optional-lookup, text-fallback convention as `UI_ICON` above.
 *
 * Only `victory` shipped: `defeat` and `draw` both came back wrapped in an unwanted circular
 * badge frame on the first sd-v1.5 generation (same failure class D-016 documented for
 * DreamShaper, reproduced here for these two subjects specifically), and a second attempt
 * with a strengthened anti-circle negative prompt produced a malformed cutout (defeat) and
 * an unreadable "crossed swords" composition (draw). Per the one-retry-budget precedent
 * (see D-016), these two keep the emoji fallback rather than burning a third attempt.
 */
export const GAME_OVER_ICON: Partial<Record<'victory' | 'defeat' | 'draw', string>> = {
  victory: '/art/ui/victory.png',
}
