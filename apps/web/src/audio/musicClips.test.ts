import { describe, expect, it } from 'vitest'
import { selectGameplayMusicContext } from './musicClips'

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
