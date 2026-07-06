import { describe, expect, it } from 'vitest'
import { pickMusicSource, selectGameplayMusicContext, type MusicSources } from './musicClips'

const sources: MusicSources = {
  ogg: '/audio/music/menu_theme.ogg',
  m4a: '/audio/music/menu_theme.m4a',
}

describe('pickMusicSource', () => {
  it('picks the OGG/Opus source when the browser reports support', () => {
    const canPlayType = (mimeType: string) => (mimeType.includes('opus') ? 'probably' : '')
    expect(pickMusicSource(sources, canPlayType)).toBe(sources.ogg)
  })

  it('falls back to M4A/AAC when Opus is unsupported (Safari)', () => {
    const canPlayType = () => ''
    expect(pickMusicSource(sources, canPlayType)).toBe(sources.m4a)
  })

  it('treats "maybe" the same as "probably" — any non-empty answer counts as support', () => {
    const canPlayType = (mimeType: string) => (mimeType.includes('opus') ? 'maybe' : '')
    expect(pickMusicSource(sources, canPlayType)).toBe(sources.ogg)
  })
})

describe('selectGameplayMusicContext', () => {
  it('picks exploration ambience by default (no battle sheet open)', () => {
    expect(selectGameplayMusicContext({ battleReportOpen: false, boardingOpen: false })).toBe(
      'exploration',
    )
  })

  it('switches to battle music once the post-battle report sheet opens', () => {
    expect(selectGameplayMusicContext({ battleReportOpen: true, boardingOpen: false })).toBe(
      'battle',
    )
  })

  it('switches to battle music during an interactive boarding melee', () => {
    expect(selectGameplayMusicContext({ battleReportOpen: false, boardingOpen: true })).toBe(
      'battle',
    )
  })

  it('stays on battle music if both happen to be open at once', () => {
    expect(selectGameplayMusicContext({ battleReportOpen: true, boardingOpen: true })).toBe(
      'battle',
    )
  })
})
