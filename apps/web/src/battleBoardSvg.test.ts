import { FACTIONS } from '@aop/content'
import { describe, expect, it } from 'vitest'
import { unitTierIconUrl } from './battleBoardSvg'

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
})
