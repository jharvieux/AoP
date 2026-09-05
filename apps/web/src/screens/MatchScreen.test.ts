// @ts-expect-error Vitest runs this test in Node; the production web config intentionally omits Node types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import gameScreenSource from './GameScreen.tsx?raw'
import matchScreenSource from './MatchScreen.tsx?raw'

const stylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

const CITY_ACTION_PROPS = [
  'onBuild',
  'onRecruit',
  'onTransfer',
  'onSetStandingOrders',
  'onSetBoardOrders',
  'onChooseCaptainSkill',
  'onChooseCaptainStat',
  'onUpgradeShip',
  'onRecruitCaptain',
  'onRansomCaptain',
  'onGarrisonCaptain',
  'onUngarrisonCaptain',
  'onTakeItem',
  'onDepositItem',
] as const

describe('single-player and multiplayer city mounting parity', () => {
  it('routes both modes through the dedicated CityScreen with the complete callback surface', () => {
    expect(gameScreenSource).toContain('import { CityScreen }')
    expect(matchScreenSource).toContain('import { CityScreen }')
    expect(gameScreenSource).toContain('<CityScreen')
    expect(matchScreenSource).toContain('<CityScreen')

    for (const prop of CITY_ACTION_PROPS) {
      expect(gameScreenSource, `GameScreen ${prop}`).toContain(`${prop}:`)
      expect(matchScreenSource, `MatchScreen ${prop}`).toContain(`${prop}=`)
    }
  })

  it('keeps city cycling and close state local to each screen', () => {
    expect(gameScreenSource).toContain('onSelectCity={openCity}')
    expect(gameScreenSource).toContain('onClose={() => setCityOpen(false)}')
    expect(matchScreenSource).toContain('onSelectCity={setOpenCityId}')
    expect(matchScreenSource).toContain('onClose={() => setOpenCityId(null)}')
  })

  it('locks the city layout contract for compact, modern, large phones, tablet, landscape, and desktop', () => {
    for (const breakpoint of [
      '@media (max-width: 374px)',
      '@media (min-width: 375px) and (max-width: 429px)',
      '@media (min-width: 430px) and (max-width: 767px)',
      '@media (min-width: 768px)',
      '@media (max-height: 430px) and (orientation: landscape)',
      '@media (min-width: 1200px)',
    ]) {
      expect(stylesSource, breakpoint).toContain(breakpoint)
    }
    expect(stylesSource).toContain('.city-overlay__body')
    expect(stylesSource).toContain('grid-template-columns: minmax(0, 1fr) minmax(320px, 390px)')
    expect(stylesSource).toContain('overflow: hidden')
    expect(stylesSource).toContain('max-height: min(50dvh, calc(100% - 96px))')
    expect(stylesSource).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('keeps the fitted harbor at the top of portrait phones without disabling zoom panning', () => {
    const start = stylesSource.indexOf('@media (max-width: 767px) and (orientation: portrait)')
    const end = stylesSource.indexOf('/* 320px compact phones', start)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)

    const portraitPhoneStyles = stylesSource.slice(start, end)
    expect(portraitPhoneStyles).toContain('.city-scene-frame')
    expect(portraitPhoneStyles).toContain('grid-template-rows: auto auto')
    expect(portraitPhoneStyles).toContain('align-content: start')
    expect(portraitPhoneStyles).toContain('.city-scene-viewport')
    expect(portraitPhoneStyles).toContain('width: 100%')
    expect(portraitPhoneStyles).toContain('aspect-ratio: 16 / 11')
  })
})
