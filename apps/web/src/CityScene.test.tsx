// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { GAME_SETUP } from '@aop/content'
import { createGame, type GameConfig } from '@aop/engine'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CityScene } from './CityScene'
import { CityScreen } from './CityScreen'
import citySceneLayout from './citySceneLayout.json'

const theme = vi.hoisted(() => ({
  spriteUrl: vi.fn<(contentId: string) => string | undefined>(),
}))

const FOCUSABLE_SELECTOR = 'button:not(:disabled), [tabindex]:not([tabindex="-1"])'

afterEach(cleanup)

vi.mock('./theme/ThemeContext', () => ({
  useTheme: () => ({
    factionName: (_id: string, fallback: string) => fallback,
    shipName: (_id: string, fallback: string) => fallback,
    spriteUrl: theme.spriteUrl,
    unitName: (_id: string, fallback: string) => fallback,
  }),
}))

vi.mock('./audio/feedback', () => ({ tapFeedback: vi.fn() }))

const config: GameConfig = {
  seed: 612,
  mapSize: 'small',
  setup: GAME_SETUP,
  players: [
    { id: 'player-0', name: 'You', faction: 'pirates', isAI: false },
    { id: 'player-1', name: 'Morgan', faction: 'british', isAI: true },
  ],
}

function cityScreenProps() {
  const game = createGame(config)
  const city = game.cities.find((candidate) => candidate.ownerId === 'player-0')!
  const captain = game.captains.find((candidate) => candidate.ownerId === 'player-0')!
  return {
    city,
    captain,
    captains: [captain],
    parties: [],
    faction: 'pirates' as const,
    resources: { gold: 20_000, timber: 20_000, iron: 20_000, rum: 20_000 },
    setup: game.config.setup,
    round: game.round,
    playerName: (id: string) => id,
    playerItemStash: [],
    portDefenderCount: 1,
    onClose: vi.fn(),
    onBuild: vi.fn(),
    onRecruit: vi.fn(),
    onTransfer: vi.fn(),
    onSetStandingOrders: vi.fn(),
    onSetBoardOrders: vi.fn(),
    onChooseCaptainSkill: vi.fn(),
    onChooseCaptainStat: vi.fn(),
    onUpgradeShip: vi.fn(),
    onRecruitCaptain: vi.fn(),
    onRansomCaptain: vi.fn(),
    onGarrisonCaptain: vi.fn(),
    onUngarrisonCaptain: vi.fn(),
    onTakeItem: vi.fn(),
    onDepositItem: vi.fn(),
  }
}

function expectStableBackdropCells(container: HTMLElement, missing: readonly number[] = []) {
  const cells = [...container.querySelectorAll<HTMLElement>('.city-scene__backdrop-cell')]
  expect(cells).toHaveLength(citySceneLayout.backdrop.tiles.length)
  for (const [index, tile] of citySceneLayout.backdrop.tiles.entries()) {
    const cell = cells[index]!
    expect(cell.dataset.backdropTile).toBe(tile.id)
    expect(cell.style.position).toBe('absolute')
    expect(cell.style.overflow).toBe('hidden')
    expect(cell.style.left).toBe(`${tile.left}%`)
    expect(cell.style.top).toBe(`${tile.top}%`)
    expect(cell.style.width).toBe(`${tile.width}%`)
    expect(cell.style.height).toBe(`${tile.height}%`)
    const image = cell.querySelector<HTMLImageElement>('.city-scene__backdrop-tile')
    if (missing.includes(index)) {
      expect(image).toBeNull()
      expect(cell.childElementCount).toBe(0)
      expect(cell.style.background).toBe('')
    } else {
      expect(image?.getAttribute('src')).toBe(tile.src)
    }
  }
}

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
    let sprite = button.querySelector<HTMLImageElement>('.city-building-art__image')!
    expect(sprite.getAttribute('src')).toBe('/theme/townhall.webp')

    fireEvent.error(sprite)
    await waitFor(() => {
      sprite = button.querySelector<HTMLImageElement>('.city-building-art__image')!
      expect(sprite.getAttribute('src')).toBe('/art/city/townhall.webp')
    })
    fireEvent.load(sprite)
    expect(button.classList.contains('city-scene__building--art')).toBe(true)

    fireEvent.error(sprite)
    await waitFor(() => {
      expect(button.querySelector('.city-building-art__image')).toBeNull()
      expect(button.classList.contains('city-scene__building--art')).toBe(false)
    })
  })

  it('exposes selected state without changing the constructed-only building set', () => {
    const { container } = render(
      <CityScene
        buildings={['townhall', 'shipyard', 'not-a-building']}
        faction="pirates"
        selectedBuildingId="shipyard"
        onOpenBuilding={() => undefined}
      />,
    )

    const buildings = [...container.querySelectorAll<HTMLButtonElement>('[data-building-id]')]
    expect(buildings.map((button) => button.dataset.buildingId)).toEqual(['townhall', 'shipyard'])
    expect(buildings.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
    ])
    expect(buildings[1]?.getAttribute('aria-label')).toBe('Manage Shipyard')
  })

  it('reports bounded zoom state and resets the scene to 100 percent', () => {
    const { container, getByRole } = render(
      <CityScene buildings={['townhall']} faction="pirates" onOpenBuilding={() => undefined} />,
    )
    const viewport = container.querySelector<HTMLElement>('.city-scene-viewport')!
    viewport.scrollTo = vi.fn()
    const zoomIn = getByRole('button', { name: 'Zoom in' })
    const zoomOut = getByRole('button', { name: 'Zoom out' })

    expect((zoomOut as HTMLButtonElement).disabled).toBe(true)
    expect(getByRole('status', { name: 'City zoom level' }).textContent).toBe('100%')
    for (let index = 0; index < citySceneLayout.zoomStops.length + 2; index += 1) {
      fireEvent.click(zoomIn)
    }
    expect((zoomIn as HTMLButtonElement).disabled).toBe(true)
    expect(getByRole('status', { name: 'City zoom level' }).textContent).toBe('300%')

    fireEvent.click(getByRole('button', { name: 'Reset city view' }))
    expect(getByRole('status', { name: 'City zoom level' }).textContent).toBe('100%')
    expect(viewport.scrollTo).toHaveBeenCalledWith({ left: 0, top: 0 })
  })

  it('supports keyboard panning and an explicit recenter control', () => {
    const { container, getByRole } = render(
      <CityScene buildings={['townhall']} faction="pirates" onOpenBuilding={() => undefined} />,
    )
    const viewport = container.querySelector<HTMLElement>('.city-scene-viewport')!
    viewport.scrollBy = vi.fn()
    viewport.scrollTo = vi.fn()
    Object.defineProperties(viewport, {
      scrollWidth: { configurable: true, value: 600 },
      clientWidth: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 400 },
      clientHeight: { configurable: true, value: 200 },
    })

    fireEvent.keyDown(viewport, { key: 'ArrowRight' })
    expect(viewport.scrollBy).toHaveBeenCalledWith({ left: 48 })
    fireEvent.click(getByRole('button', { name: 'Recenter city' }))
    expect(viewport.scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      left: 150,
      top: 100,
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
    expect(flagpole.style.getPropertyValue('--city-flag-left')).toBe(
      `${citySceneLayout.flag.poleLeftPercent}%`,
    )
    expect(flagpole.style.getPropertyValue('--city-flag-mast-width')).toBe(
      `${citySceneLayout.flag.mastWidthPercent}%`,
    )
    expect(flagpole.style.getPropertyValue('--city-flag-cloth-left')).toBe(
      `${citySceneLayout.flag.clothLeftPercent}%`,
    )
    expect(flagpole.style.getPropertyValue('--city-flag-mount-width')).toBe(
      `${citySceneLayout.flag.mountWidthPercent}%`,
    )
    expect(flagpole.style.getPropertyValue('--city-flag-mount-height')).toBe(
      `${citySceneLayout.flag.mountHeightPercent}%`,
    )
    expect(flagpole.querySelector('.city-scene__flagpole-mount')).not.toBeNull()
    const tower = container.querySelector<HTMLImageElement>('.city-scene__sprite--tower')!
    expect(tower.style.width).toBe(`${citySceneLayout.tower.widthPercent}%`)
    expect(tower.style.right).toBe(`${citySceneLayout.tower.rightPercent}%`)
    expect(container.querySelectorAll('.city-scene__backdrop-tile')).toHaveLength(24)
  })

  it.each(['pirates', 'british', 'spanish', 'french', 'dutch'] as const)(
    'mounts the %s flag on Town Hall without changing its tap target or label',
    (faction) => {
      const onOpenBuilding = vi.fn()
      const { container } = render(
        <CityScene buildings={['townhall']} faction={faction} onOpenBuilding={onOpenBuilding} />,
      )

      const townHall = container.querySelector<HTMLButtonElement>('.city-scene__building')!
      const flagpole = townHall.querySelector<HTMLElement>('.city-scene__flagpole')!
      expect(flagpole.getAttribute('aria-hidden')).toBe('true')
      expect(flagpole.querySelector('.city-scene__flagpole-mast')).not.toBeNull()
      expect(flagpole.querySelector('.city-scene__flagpole-mount')).not.toBeNull()
      expect(flagpole.querySelector<HTMLImageElement>('.city-scene__flag img')?.src).toContain(
        `/art/factions/${faction}/flag.png`,
      )
      expect(townHall.querySelector('.city-scene__label')?.textContent).toBe('Town Hall')

      fireEvent.click(townHall)
      expect(onOpenBuilding).toHaveBeenCalledOnce()
      expect(onOpenBuilding).toHaveBeenCalledWith('townhall')
    },
  )

  it.each([
    ['first', 0],
    ['middle', 11],
    ['last', 23],
  ])('keeps every backdrop cell fixed when the %s tile fails', async (_position, failedIndex) => {
    const { container } = render(
      <CityScene buildings={['townhall']} faction="pirates" onOpenBuilding={() => undefined} />,
    )
    expectStableBackdropCells(container)

    const failedCell = container.querySelectorAll<HTMLElement>('.city-scene__backdrop-cell')[
      failedIndex
    ]!
    fireEvent.error(failedCell.querySelector<HTMLImageElement>('.city-scene__backdrop-tile')!)

    await waitFor(() => expectStableBackdropCells(container, [failedIndex]))
  })

  it('keeps positions and surviving URLs stable across multiple backdrop failures', async () => {
    const { container } = render(
      <CityScene buildings={['townhall']} faction="pirates" onOpenBuilding={() => undefined} />,
    )
    const failedIndices = [0, 12, 23]
    const cells = container.querySelectorAll<HTMLElement>('.city-scene__backdrop-cell')
    for (const index of failedIndices) {
      fireEvent.error(cells[index]!.querySelector<HTMLImageElement>('.city-scene__backdrop-tile')!)
    }

    await waitFor(() => expectStableBackdropCells(container, failedIndices))
  })
})

describe('CityScreen dedicated overlay', () => {
  it('contains focus, inerts the map, restores the opener, and uses Escape one layer at a time', async () => {
    const props = cityScreenProps()

    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button">Outside city branch</button>
          <div>
            <button type="button" onClick={() => setOpen(true)}>
              Open city
            </button>
            {open && (
              <CityScreen
                {...props}
                onClose={() => {
                  props.onClose()
                  setOpen(false)
                }}
              />
            )}
          </div>
        </>
      )
    }

    const view = render(<Harness />)
    const opener = view.getByRole('button', { name: 'Open city' })
    opener.focus()
    fireEvent.click(opener)

    const dialog = view.getByRole('dialog', { name: 'Your Capital' })
    expect(opener.hasAttribute('inert')).toBe(true)
    expect(opener.getAttribute('aria-hidden')).toBe('true')
    expect(view.getByText('Outside city branch').hasAttribute('inert')).toBe(true)
    expect(document.activeElement).toBe(view.getByRole('button', { name: 'Return to world map' }))
    expect(view.getAllByRole('dialog')).toHaveLength(1)
    expect(view.queryByText("You's Capital")).toBeNull()
    expect(view.queryByText("You's Flagship")).toBeNull()
    expect(view.getByText('Your Flagship')).not.toBeNull()

    const townHall = view.getByRole('button', { name: 'Manage Town Hall' })
    fireEvent.click(townHall)
    await waitFor(() =>
      expect(document.activeElement).toBe(
        view.getByRole('button', { name: 'Close building details' }),
      ),
    )
    expect(view.getAllByRole('dialog')).toHaveLength(1)
    expect(view.container.querySelector('.sheet')).toBeNull()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(townHall))
    expect(view.queryByRole('button', { name: 'Close building details' })).toBeNull()
    expect(props.onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledOnce()
    expect(view.queryByRole('dialog')).toBeNull()
    expect(opener.hasAttribute('inert')).toBe(false)
    expect(opener.getAttribute('aria-hidden')).toBeNull()
    expect(view.getByRole('button', { name: 'Outside city branch' }).hasAttribute('inert')).toBe(
      false,
    )
    expect(document.activeElement).toBe(opener)
  })

  it('consumes native back to close details first and the city second', async () => {
    const props = cityScreenProps()

    function Harness() {
      const [open, setOpen] = useState(true)
      return open ? <CityScreen {...props} onClose={() => setOpen(false)} /> : null
    }

    const view = render(<Harness />)
    fireEvent.click(view.getByRole('button', { name: 'Manage Town Hall' }))

    const closeDetails = new Event('aop:native-back', { cancelable: true })
    fireEvent(window, closeDetails)
    expect(closeDetails.defaultPrevented).toBe(true)
    await waitFor(() =>
      expect(view.queryByRole('button', { name: 'Close building details' })).toBeNull(),
    )
    expect(view.getByRole('dialog')).not.toBeNull()

    const closeCity = new Event('aop:native-back', { cancelable: true })
    fireEvent(window, closeCity)
    expect(closeCity.defaultPrevented).toBe(true)
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull())
  })

  it('uses backdrop activation to close details first and the city second', async () => {
    const props = cityScreenProps()

    function Harness() {
      const [open, setOpen] = useState(true)
      return open ? (
        <CityScreen
          {...props}
          onClose={() => {
            props.onClose()
            setOpen(false)
          }}
        />
      ) : null
    }

    const view = render(<Harness />)
    const townHall = view.getByRole('button', { name: 'Manage Town Hall' })
    fireEvent.click(townHall)
    await waitFor(() =>
      expect(document.activeElement).toBe(
        view.getByRole('button', { name: 'Close building details' }),
      ),
    )

    const overlay = view.container.querySelector<HTMLElement>('[data-city-overlay]')!
    fireEvent.click(overlay)
    await waitFor(() => expect(document.activeElement).toBe(townHall))
    expect(view.queryByRole('button', { name: 'Close building details' })).toBeNull()
    expect(props.onClose).not.toHaveBeenCalled()

    fireEvent.click(overlay)
    expect(props.onClose).toHaveBeenCalledOnce()
    expect(view.queryByRole('dialog')).toBeNull()
  })

  it('does not treat shell, building, or control click bubbling as backdrop activation', () => {
    const props = cityScreenProps()
    const view = render(<CityScreen {...props} />)
    const shell = view.container.querySelector<HTMLElement>('.city-overlay__shell')!

    fireEvent.click(shell)
    fireEvent.click(view.getByRole('button', { name: 'Manage Town Hall' }))
    expect(view.getByRole('button', { name: 'Close building details' })).not.toBeNull()
    expect(props.onClose).not.toHaveBeenCalled()

    fireEvent.click(view.getByRole('button', { name: 'Close building details' }))
    fireEvent.click(view.getByRole('button', { name: 'Garrison' }))
    expect(props.onGarrisonCaptain).toHaveBeenCalledOnce()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('cycles cities, clears stale building selection, and preserves garrison callbacks', () => {
    const props = cityScreenProps()
    const secondCity = { ...props.city, id: 'city-second', name: 'Second Harbor' }

    function Harness() {
      const [city, setCity] = useState(props.city)
      return (
        <CityScreen
          {...props}
          city={city}
          cities={[props.city, secondCity]}
          onSelectCity={(id) => setCity(id === secondCity.id ? secondCity : props.city)}
        />
      )
    }

    const view = render(<Harness />)
    fireEvent.click(view.getByRole('button', { name: 'Manage Town Hall' }))
    expect(view.getByRole('button', { name: 'Close building details' })).not.toBeNull()

    fireEvent.click(view.getByRole('button', { name: 'Next city' }))
    expect(view.getByRole('dialog', { name: 'Second Harbor' })).not.toBeNull()
    expect(view.queryByRole('button', { name: 'Close building details' })).toBeNull()

    fireEvent.click(view.getByRole('button', { name: 'Garrison' }))
    expect(props.onGarrisonCaptain).toHaveBeenCalledOnce()
  })

  it('preserves the ungarrison callback and explains a disabled garrison action', () => {
    const props = cityScreenProps()
    const withoutCaptain = render(<CityScreen {...props} captain={undefined} />)
    const disabled = withoutCaptain.getByRole('button', { name: 'Garrison' })
    expect((disabled as HTMLButtonElement).disabled).toBe(true)
    expect(disabled.getAttribute('aria-describedby')).not.toBeNull()
    expect(withoutCaptain.getByText('Dock a captain to manage ships')).not.toBeNull()
    withoutCaptain.unmount()

    const garrisonedCity = { ...props.city, garrisonCaptainId: props.captain.id }
    const garrisoned = render(<CityScreen {...props} city={garrisonedCity} />)
    fireEvent.click(garrisoned.getByRole('button', { name: 'Ungarrison' }))
    expect(props.onUngarrisonCaptain).toHaveBeenCalledOnce()
  })

  it('wraps focus at both ends of its one modal boundary', () => {
    const props = cityScreenProps()
    const view = render(<CityScreen {...props} />)
    const dialog = view.getByRole('dialog')
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    first.focus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })
})
