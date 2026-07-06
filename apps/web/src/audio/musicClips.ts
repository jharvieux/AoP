const BASE = '/audio/music'

/**
 * Background music loops generated locally via MusicGen (facebook/musicgen-small,
 * see docs/runbooks/music-sfx-generation.md). Each clip is pre-processed with a
 * self-crossfade so it loops seamlessly when played with `loop: true`.
 */
export const MUSIC = {
  menuTheme: `${BASE}/menu_theme.wav`,
  explorationAmbient: `${BASE}/exploration_ambient.wav`,
  battleTheme: `${BASE}/battle_theme.wav`,
} as const

export type MusicContext = 'menu' | 'exploration' | 'battle'

export const MUSIC_TRACK_URL: Record<MusicContext, string> = {
  menu: MUSIC.menuTheme,
  exploration: MUSIC.explorationAmbient,
  battle: MUSIC.battleTheme,
}

/**
 * Which background music context should play during active gameplay, given
 * whether a battle report or boarding-melee sheet is currently open. Pure so
 * it's unit-testable without mounting the audio manager.
 */
export function selectGameplayMusicContext(params: {
  battleReportOpen: boolean
  boardingOpen: boolean
}): MusicContext {
  return params.battleReportOpen || params.boardingOpen ? 'battle' : 'exploration'
}
