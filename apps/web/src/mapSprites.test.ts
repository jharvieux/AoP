import { describe, expect, it } from 'vitest'
import {
  buildingContentId,
  cityBackdropContentId,
  cityContentId,
  encounterContentId,
  factionFlagContentId,
  resolveSpriteUrl,
  tileContentId,
} from './mapSprites'

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

  it('namespaces building content ids by building id', () => {
    expect(buildingContentId('townhall')).toBe('building:townhall')
  })

  it('has a fixed content id for the city scene backdrop', () => {
    expect(cityBackdropContentId()).toBe('cityScene:backdrop')
  })

  it('uses the faction id directly as the flag content id', () => {
    expect(factionFlagContentId('pirates')).toBe('pirates')
    expect(factionFlagContentId('british')).toBe('british')
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

  it('resolves a faction flag override over the default flag art', () => {
    const spriteUrl = (id: string) => (id === 'pirates' ? '/override/pirates-flag.png' : undefined)
    expect(
      resolveSpriteUrl(
        spriteUrl,
        factionFlagContentId('pirates'),
        '/art/factions/pirates/flag.png',
      ),
    ).toBe('/override/pirates-flag.png')
  })

  it('falls back to the default flag art when no faction override is set', () => {
    const spriteUrl = () => undefined
    expect(
      resolveSpriteUrl(
        spriteUrl,
        factionFlagContentId('british'),
        '/art/factions/british/flag.png',
      ),
    ).toBe('/art/factions/british/flag.png')
  })
})
