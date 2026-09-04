// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CityScene } from './CityScene'
import citySceneLayout from './citySceneLayout.json'

const theme = vi.hoisted(() => ({
  spriteUrl: vi.fn<(contentId: string) => string | undefined>(),
}))

vi.mock('./theme/ThemeContext', () => ({
  useTheme: () => ({ spriteUrl: theme.spriteUrl }),
}))

describe('CityScene production art consumer', () => {
  beforeEach(() => {
    theme.spriteUrl.mockReset()
  })

  it('renders constructed buildings in stable depth and baseline order', () => {
    const { container } = render(
      <CityScene
        buildings={['citadel', 'barracks', 'townhall', 'shipyard', 'tavern']}
        faction="pirates"
        onOpenBuilding={() => undefined}
      />,
    )

    const names = [...container.querySelectorAll<HTMLButtonElement>('.city-scene__building')].map(
      (button) => button.textContent,
    )
    expect(names).toEqual(['Town Hall', 'Shipyard', 'Grog House', 'Cutthroat Den', 'Citadel'])
  })

  it('falls back from a failed theme override to local art, then to the placeholder', async () => {
    theme.spriteUrl.mockImplementation((contentId) =>
      contentId === 'building:townhall' ? '/theme/townhall.webp' : undefined,
    )
    const { container } = render(
      <CityScene buildings={['townhall']} faction="pirates" onOpenBuilding={() => undefined} />,
    )
    const button = container.querySelector<HTMLButtonElement>('.city-scene__building')!
    let sprite = button.querySelector<HTMLImageElement>('.city-scene__sprite')!
    expect(sprite.getAttribute('src')).toBe('/theme/townhall.webp')

    fireEvent.error(sprite)
    await waitFor(() => {
      sprite = button.querySelector<HTMLImageElement>('.city-scene__sprite')!
      expect(sprite.getAttribute('src')).toBe('/art/city/townhall.webp')
    })
    fireEvent.load(sprite)
    expect(button.classList.contains('city-scene__building--art')).toBe(true)

    fireEvent.error(sprite)
    await waitFor(() => {
      expect(button.querySelector('.city-scene__sprite')).toBeNull()
      expect(button.classList.contains('city-scene__building--art')).toBe(false)
    })
  })

  it('uses the same override-to-local fallback for the backdrop, flag, and citadel tower', async () => {
    theme.spriteUrl.mockImplementation(
      (contentId) => `/theme/${contentId.replaceAll(':', '-')}.webp`,
    )
    const { container } = render(
      <CityScene
        buildings={['townhall', 'citadel']}
        faction="british"
        onOpenBuilding={() => undefined}
      />,
    )

    const backdrop = container.querySelector<HTMLImageElement>('.city-scene__backdrop')!
    expect(backdrop.getAttribute('src')).toBe('/theme/cityScene-backdrop.webp')
    fireEvent.error(backdrop)

    const flag = container.querySelector<HTMLImageElement>('.city-scene__flag img')!
    expect(flag.getAttribute('src')).toBe('/theme/british.webp')
    fireEvent.error(flag)

    const tower = container.querySelector<HTMLImageElement>('.city-scene__sprite--tower')!
    expect(tower.getAttribute('src')).toBe('/theme/building-citadel-tower.webp')
    fireEvent.error(tower)

    await waitFor(() => {
      const backdropTiles = [
        ...container.querySelectorAll<HTMLImageElement>('.city-scene__backdrop-tile'),
      ]
      expect(backdropTiles).toHaveLength(24)
      expect(backdropTiles.map((tile) => tile.getAttribute('src'))).toEqual(
        citySceneLayout.backdrop.tiles.map((tile) => tile.src),
      )
      expect(
        container.querySelector<HTMLImageElement>('.city-scene__flag img')!.getAttribute('src'),
      ).toBe('/art/factions/british/flag.png')
      expect(
        container
          .querySelector<HTMLImageElement>('.city-scene__sprite--tower')!
          .getAttribute('src'),
      ).toBe('/art/city/citadel-tower.webp')
    })
  })

  it('drives active shadows, flag, tower, and backdrop tiles from the shipping layout', () => {
    const { container } = render(
      <CityScene
        buildings={['townhall', 'citadel', 'shipyard']}
        faction="spanish"
        onOpenBuilding={() => undefined}
      />,
    )

    const buildings = [...container.querySelectorAll<HTMLButtonElement>('.city-scene__building')]
    expect(buildings).toHaveLength(3)
    expect(container.textContent).not.toContain('Grog House')
    for (const building of buildings) {
      expect(building.style.getPropertyValue('--city-shadow-opacity')).toBe(
        String(citySceneLayout.shadow.opacity),
      )
    }

    const flagpole = container.querySelector<HTMLElement>('.city-scene__flagpole')!
    expect(flagpole.style.getPropertyValue('--city-flag-top')).toBe(
      `${citySceneLayout.flag.poleTopPercent}%`,
    )
    const tower = container.querySelector<HTMLImageElement>('.city-scene__sprite--tower')!
    expect(tower.style.width).toBe(`${citySceneLayout.tower.widthPercent}%`)
    expect(tower.style.right).toBe(`${citySceneLayout.tower.rightPercent}%`)
    expect(container.querySelectorAll('.city-scene__backdrop-tile')).toHaveLength(24)
  })
})
