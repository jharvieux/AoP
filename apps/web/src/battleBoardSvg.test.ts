import { FACTIONS } from '@aop/content'
import { turretUnitId } from '@aop/shared'
import { describe, expect, it } from 'vitest'
import { boardUnitFallbackName, unitTierIconUrl } from './battleBoardSvg'
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
