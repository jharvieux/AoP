// @vitest-environment jsdom
import { FACTIONS } from '@aop/content'
import { turretUnitId } from '@aop/shared'
import { fireEvent, render } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  BoardDefs,
  boardUnitFallbackName,
  StackToken,
  TerrainHex,
  unitTierIconUrl,
} from './battleBoardSvg'
import { UI_ICON } from './uiIcons'

describe('unitTierIconUrl', () => {
  it('resolves a sprite for every unit of every faction now that tier 1 art exists', () => {
    for (const faction of Object.values(FACTIONS)) {
      for (const unit of faction.units) {
        const url = unitTierIconUrl(unit.id)
        expect(url).toBe(faction.unitTierSpriteUrls?.[unit.tier])
        expect(url).toBeDefined()
      }
    }
  })

  it('falls back to undefined for an unknown unit id', () => {
    expect(unitTierIconUrl('not-a-real-unit')).toBeUndefined()
  })

  it('gives the synthetic turret pieces (#441) an icon, via the shared id builder', () => {
    expect(unitTierIconUrl(turretUnitId('pirates', 2))).toBe(UI_ICON.attack)
    expect(unitTierIconUrl(turretUnitId('pirates', 2))).toBeDefined()
  })
})

describe('boardUnitFallbackName (#441)', () => {
  it('names roster units from their definition', () => {
    expect(boardUnitFallbackName('deckhand')).toBe('Deckhand')
  })

  it('names turret pieces instead of leaking the raw synthetic id', () => {
    for (const faction of Object.keys(FACTIONS)) {
      for (const tier of [1, 2, 3, 4]) {
        expect(boardUnitFallbackName(turretUnitId(faction, tier))).toBe('Turret')
      }
    }
  })

  it('falls back to the raw id for anything else', () => {
    expect(boardUnitFallbackName('not-a-real-unit')).toBe('not-a-real-unit')
  })
})

describe('battle-board SVG primitives', () => {
  it('renders textured terrain and an interactive fallback-label token', () => {
    const onHexClick = vi.fn()
    const onTokenClick = vi.fn()
    const { container } = render(
      createElement(
        'svg',
        undefined,
        createElement(BoardDefs),
        createElement(TerrainHex, {
          hex: { col: 1, row: 2 },
          terrain: 'rough',
          onClick: onHexClick,
        }),
        createElement(StackToken, {
          side: 'attacker',
          unitId: 'unknown-unit',
          count: 7,
          position: { col: 1, row: 2 },
          label: 'Marines',
          ghost: true,
          hitKey: 'hit-3',
          onClick: onTokenClick,
        }),
      ),
    )

    expect(container.querySelectorAll('pattern')).toHaveLength(4)
    expect(container.querySelector('#terrain-rough rect')!.getAttribute('fill')).toBe(
      'var(--color-terrain-rough)',
    )
    const terrain = container.querySelector('polygon')!
    expect(terrain.getAttribute('fill')).toBe('url(#terrain-rough)')
    expect(terrain.getAttribute('points')).toBeTruthy()
    fireEvent.click(terrain)
    expect(onHexClick).toHaveBeenCalledOnce()

    const token = container.querySelector('.battle-board-svg__token-pos')!
    expect(token.getAttribute('transform')).toBe('translate(60.1051177665153 88)')
    expect(token.getAttribute('style')).toContain('cursor: pointer')
    expect(container.querySelector('.battle-board-svg__ghost')).not.toBeNull()
    expect(container.querySelector('.battle-board-svg__hit')).not.toBeNull()
    expect(container.querySelector('.battle-board-svg__hit-flash')).not.toBeNull()
    expect(container.querySelector('.battle-board-svg__unit')!.textContent).toBe('Ma')
    expect(container.querySelector('.battle-board-svg__count')!.textContent).toBe('7')
    fireEvent.click(token)
    expect(onTokenClick).toHaveBeenCalledOnce()
  })
})
