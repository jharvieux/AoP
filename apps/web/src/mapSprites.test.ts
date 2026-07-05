import { describe, expect, it } from 'vitest'
import { cityContentId, encounterContentId, resolveSpriteUrl, tileContentId } from './mapSprites'

describe('mapSprites content ids', () => {
  it('namespaces tile content ids by tile type', () => {
    expect(tileContentId('land')).toBe('tile:land')
    expect(tileContentId('deep')).toBe('tile:deep')
  })

  it('namespaces city content ids by ownership', () => {
    expect(cityContentId(true)).toBe('city:own')
    expect(cityContentId(false)).toBe('city:enemy')
  })

  it('namespaces encounter content ids by kind', () => {
    expect(encounterContentId('merchant')).toBe('encounter:merchant')
  })
})

describe('resolveSpriteUrl', () => {
  it('prefers the theme pack override when one is set', () => {
    const spriteUrl = (id: string) => (id === 'tile:land' ? '/override/land.png' : undefined)
    expect(resolveSpriteUrl(spriteUrl, 'tile:land', '/art/tiles/land.png')).toBe(
      '/override/land.png',
    )
  })

  it('falls back to the default art when no override is set', () => {
    const spriteUrl = () => undefined
    expect(resolveSpriteUrl(spriteUrl, 'tile:land', '/art/tiles/land.png')).toBe(
      '/art/tiles/land.png',
    )
  })

  it('falls back to undefined when neither an override nor default art exists', () => {
    const spriteUrl = () => undefined
    expect(resolveSpriteUrl(spriteUrl, 'tile:deep', undefined)).toBeUndefined()
  })

  it('an override wins even when there is no default art for that content id', () => {
    const spriteUrl = (id: string) => (id === 'tile:deep' ? '/override/deep.png' : undefined)
    expect(resolveSpriteUrl(spriteUrl, 'tile:deep', undefined)).toBe('/override/deep.png')
  })
})
