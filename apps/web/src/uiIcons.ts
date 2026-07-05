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
