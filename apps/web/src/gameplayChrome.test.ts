// @ts-expect-error Vitest runs in Node; the browser app intentionally excludes Node ambient types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import mapCanvasSource from './MapCanvas.tsx?raw'
import bottomSheetSource from './components/BottomSheet.tsx?raw'
import gameScreenSource from './screens/GameScreen.tsx?raw'
import matchScreenSource from './screens/MatchScreen.tsx?raw'

const stylesSource = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string

const sources = {
  'MapCanvas.tsx': mapCanvasSource,
  'components/BottomSheet.tsx': bottomSheetSource,
  'screens/GameScreen.tsx': gameScreenSource,
  'screens/MatchScreen.tsx': matchScreenSource,
}

describe('gameplay chrome source contract', () => {
  it('keeps GameScreen and MatchScreen on the same shared header, screen, and dock hooks', () => {
    for (const file of ['screens/GameScreen.tsx', 'screens/MatchScreen.tsx'] as const) {
      const source = sources[file]
      expect(source, file).toContain('<GameplayHud')
      expect(source, file).toContain('game-screen-container gameplay-chrome')
      expect(source, file).toContain('bottom-action-bar gameplay-command-dock')
      expect(source, file).toContain('data-gameplay-chrome="screen"')
      expect(source, file).toContain('data-gameplay-chrome="command-dock"')
    }
  })

  it('removes platform glyph controls from the #610-owned gameplay path', () => {
    const forbidden = />\s*[+−×✓•⌖⛶]\s*</u
    for (const [file, source] of Object.entries(sources)) {
      expect(source.match(forbidden), file).toBeNull()
    }
  })

  it('locks 44 px touched controls plus focus and non-color disabled cues', () => {
    const css = stylesSource
    for (const selector of [
      'button.primary',
      'button.secondary',
      'button.danger',
      '.map-nav-button',
      '.city-roster-entry',
      '.building-option',
      '.garrison-row__actions button',
      '.build-row__build',
      '.city-scene__building',
      '.city-scene-zoom button',
      '.city-scene-nav',
      '.info-toggle',
      '.sheet__close',
    ]) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
      expect(block, selector).toMatch(/(?:min-)?width: 44px/)
      expect(block, selector).toMatch(/(?:min-)?height: 44px/)
    }
    expect(css).toContain('button:disabled::after')
    expect(css).toContain('outline: 2px solid var(--stroke-focus)')
    expect(css).toContain('.city-roster-entry.selected')
    expect(css).toContain('0 0 0 4px var(--selected-glow)')
  })
})
