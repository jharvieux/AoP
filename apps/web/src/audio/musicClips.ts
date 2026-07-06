const BASE = '/audio/music'

/** Where to find one track's audio, one entry per encoded format. */
export interface MusicSources {
  /** Opus-in-Ogg — Chrome/Firefox/Edge. ~5-7x smaller than the WAV master at no
   * audible quality loss for a background loop. */
  ogg: string
  /** AAC-in-M4A — Safari, which has no native Ogg/Opus decoder. */
  m4a: string
}

/**
 * Background music loops generated locally via MusicGen (facebook/musicgen-small,
 * see docs/runbooks/music-sfx-generation.md). Each clip is pre-processed with a
 * self-crossfade so it loops seamlessly when played with `loop: true`, then encoded
 * to OGG/M4A by `scripts/encode-music.mjs` (#253) — the WAV masters are 10x larger
 * and are never referenced by the client.
 */
export const MUSIC: Record<MusicContext, MusicSources> = {
  menu: { ogg: `${BASE}/menu_theme.ogg`, m4a: `${BASE}/menu_theme.m4a` },
  exploration: { ogg: `${BASE}/exploration_ambient.ogg`, m4a: `${BASE}/exploration_ambient.m4a` },
  battle: { ogg: `${BASE}/battle_theme.ogg`, m4a: `${BASE}/battle_theme.m4a` },
}

export type MusicContext = 'menu' | 'exploration' | 'battle'

/**
 * Picks the smallest format the current browser can actually decode: Opus/Ogg
 * everywhere it's supported, falling back to AAC/M4A for Safari. `canPlayType` is
 * injected (rather than reading `HTMLAudioElement.prototype.canPlayType` directly)
 * so this is unit-testable without a real browser — jsdom's implementation always
 * returns `''`, which would otherwise make every test look like a Safari-only
 * environment.
 */
export function pickMusicSource(
  sources: MusicSources,
  canPlayType: (mimeType: string) => string,
): string {
  return canPlayType('audio/ogg; codecs="opus"') !== '' ? sources.ogg : sources.m4a
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
