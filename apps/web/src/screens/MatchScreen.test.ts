// @ts-expect-error Vitest runs this test in Node; the production web config intentionally omits Node types.
import { readFileSync } from 'node:fs'
import type { GameMap } from '@aop/engine'
import { describe, expect, it, vi } from 'vitest'
import { findViewerCaptainAtCity } from '../cityDocking'
import gameScreenSource from './GameScreen.tsx?raw'
import matchScreenSource from './MatchScreen.tsx?raw'

const stylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

const HEX_MAP: GameMap = {
  width: 6,
  height: 6,
  tiles: [],
  startPositions: [],
  topology: 'hex',
}
const CITY_POSITION = { x: 2, y: 2 }

function captainAt(position: { x: number; y: number }) {
  return { id: `captain-${position.x}-${position.y}`, ownerId: 'viewer', position }
}

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
  it.each([
    { x: 3, y: 2 },
    { x: 2, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 2 },
    { x: 1, y: 3 },
    { x: 2, y: 3 },
  ])('accepts true hex neighbor $x,$y for multiplayer city actions', (position) => {
    const captain = captainAt(position)
    expect(findViewerCaptainAtCity([captain], HEX_MAP, 'viewer', CITY_POSITION)).toEqual(captain)
  })

  it.each([
    { x: 3, y: 1 },
    { x: 3, y: 3 },
  ])('rejects square-only diagonal $x,$y for multiplayer city actions', (position) => {
    expect(
      findViewerCaptainAtCity([captainAt(position)], HEX_MAP, 'viewer', CITY_POSITION),
    ).toBeUndefined()
  })

  it('keeps a rejected square-only diagonal out of a gated city callback', () => {
    const submitGarrison = vi.fn()
    const captain = findViewerCaptainAtCity(
      [captainAt({ x: 3, y: 1 })],
      HEX_MAP,
      'viewer',
      CITY_POSITION,
    )

    if (captain) submitGarrison(captain.id)

    expect(submitGarrison).not.toHaveBeenCalled()
    expect(matchScreenSource).toContain('if (!captainAtOpenCity) return')
  })

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
      '@media (min-width: 768px) and (max-width: 899px) and (orientation: portrait)',
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

  it('removes city child motion while preserving static reduced-motion states', () => {
    const start = stylesSource.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(start).toBeGreaterThanOrEqual(0)
    const reducedMotionStyles = stylesSource.slice(start)

    for (const selector of [
      '.city-scene__building',
      '.city-scene__label',
      '.city-scene-zoom button',
      '.info-toggle',
    ]) {
      expect(reducedMotionStyles, selector).toContain(selector)
    }
    expect(reducedMotionStyles).toContain('transition: none')
    expect(reducedMotionStyles).toContain('.city-scene__building:active')
    expect(reducedMotionStyles).toContain('transform: none')
  })

  it('keeps compact captain, defense, and 44px action status visible in short landscape', () => {
    const start = stylesSource.indexOf('@media (max-height: 430px) and (orientation: landscape)')
    expect(start).toBeGreaterThanOrEqual(0)
    const landscapeStyles = stylesSource.slice(start, stylesSource.indexOf('.battle-intro', start))

    expect(landscapeStyles).toContain('.city-status-strip')
    expect(landscapeStyles).toContain('display: grid')
    expect(landscapeStyles).not.toContain('display: none')
    expect(landscapeStyles).toContain('.city-status-card--action button')
    expect(landscapeStyles).toContain('min-height: 44px')
    expect(stylesSource).toContain('.city-overlay {')
    expect(stylesSource).toContain('overflow: hidden')
  })

  it('gives portrait tablets a dominant scene above one bounded inspector', () => {
    const start = stylesSource.indexOf(
      '@media (min-width: 768px) and (max-width: 899px) and (orientation: portrait)',
    )
    expect(start).toBeGreaterThanOrEqual(0)
    const end = stylesSource.indexOf('/* 1440px desktop', start)
    const tabletStyles = stylesSource.slice(start, end)

    expect(tabletStyles).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(tabletStyles).toContain('grid-template-rows: minmax(0, 1fr) minmax(240px, 30dvh)')
    expect(tabletStyles).toContain('.city-inspector')
    expect(tabletStyles).toContain('border-top: 1px solid var(--stroke-emphasized)')
    expect(tabletStyles).toContain('(70dvh - 208px) * 16 / 11')
  })
})
