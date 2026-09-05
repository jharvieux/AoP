// @vitest-environment jsdom

import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { FACTIONS, GAME_SETUP } from '@aop/content'
import { createGame, type GameConfig } from '@aop/engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CityBuildingModal, playerFacingName } from './cityModals'

const theme = vi.hoisted(() => ({
  spriteUrl: vi.fn<(contentId: string) => string | undefined>(),
}))

vi.mock('./theme/ThemeContext', () => ({
  useTheme: () => ({
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

function modalProps(buildingId: string) {
  const game = createGame(config)
  const baseCity = game.cities.find((candidate) => candidate.ownerId === 'player-0')!
  const baseCaptain = game.captains.find((candidate) => candidate.ownerId === 'player-0')!
  const firstUnit = FACTIONS.pirates.units[0]!
  const captain = {
    ...baseCaptain,
    xp: 400,
    troops: [{ unitId: firstUnit.id, count: 2 }],
    items: [],
  }
  const city = {
    ...baseCity,
    builtThisRound: false,
    buildings: ['townhall', 'barracks', 'shipyard', 'tavern'],
    garrison: { ...baseCity.garrison, [firstUnit.id]: 3 },
    unitAvailability: { ...baseCity.unitAvailability, [firstUnit.id]: 3 },
  }
  return {
    buildingId,
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

afterEach(cleanup)

describe('CityBuildingModal in-place management router', () => {
  beforeEach(() => theme.spriteUrl.mockReset())

  it('keeps building actions and unavailable explanations data-derived', () => {
    const props = modalProps('townhall')
    const view = render(<CityBuildingModal {...props} />)
    const sawmillRow = view.getByText('Sawmill').closest('li')!
    const build = within(sawmillRow).getByRole('button', { name: 'Build' })

    expect((build as HTMLButtonElement).disabled).toBe(false)
    expect(within(sawmillRow).getByLabelText('200 gold')).not.toBeNull()
    fireEvent.click(build)
    expect(props.onBuild).toHaveBeenCalledWith('sawmill')

    const townHallRow = view.getAllByText('Town Hall').at(-1)!.closest('li')!
    expect(within(townHallRow).getByText(/Already built/)).not.toBeNull()
    expect(
      (within(townHallRow).getByRole('button', { name: 'Build' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('preserves recruit, load, and unload callback payloads', () => {
    const props = modalProps('barracks')
    const unitId = props.city.unitAvailability
      ? Object.keys(props.city.unitAvailability).find(
          (id) => (props.city.unitAvailability[id] ?? 0) > 0,
        )!
      : ''
    const view = render(<CityBuildingModal {...props} />)

    fireEvent.click(view.getByRole('button', { name: /Recruit \(/ }))
    fireEvent.click(view.getByRole('button', { name: 'Load' }))
    fireEvent.click(view.getByRole('button', { name: 'Unload' }))
    expect(props.onRecruit).toHaveBeenCalledWith(unitId)
    expect(props.onTransfer).toHaveBeenNthCalledWith(1, 'toShip', unitId)
    expect(props.onTransfer).toHaveBeenNthCalledWith(2, 'toGarrison', unitId)
  })

  it('preserves ship upgrade and captain-management callback payloads', () => {
    const shipyardProps = modalProps('shipyard')
    const shipyard = render(<CityBuildingModal {...shipyardProps} />)
    fireEvent.click(shipyard.getAllByRole('button', { name: 'Upgrade' })[0]!)
    expect(shipyardProps.onUpgradeShip).toHaveBeenCalledWith('hull')
    shipyard.unmount()

    const tavernProps = modalProps('tavern')
    const tavern = render(<CityBuildingModal {...tavernProps} />)
    fireEvent.click(tavern.getByRole('button', { name: /Recruit \(/ }))
    fireEvent.click(tavern.getAllByRole('button', { name: 'Set' })[1]!)
    fireEvent.click(tavern.getAllByRole('button', { name: 'Set' })[3]!)
    fireEvent.click(tavern.getAllByRole('button', { name: 'Learn' })[0]!)
    fireEvent.click(tavern.getAllByRole('button', { name: 'Train' })[0]!)
    expect(tavernProps.onRecruitCaptain).toHaveBeenCalledWith()
    expect(tavernProps.onSetStandingOrders).toHaveBeenCalledWith([
      { when: 'outgunned', tactic: 'evade' },
      { when: 'always', tactic: 'broadside' },
    ])
    expect(tavernProps.onSetBoardOrders).toHaveBeenCalledWith([
      { when: 'always', doctrine: 'holdLine' },
    ])
    expect(tavernProps.onChooseCaptainSkill).toHaveBeenCalledWith('pirates-gunnery-1')
    expect(tavernProps.onChooseCaptainStat).toHaveBeenCalledWith('attack')
  })

  it('preserves captain ransom and inventory-transfer identifiers', () => {
    const base = modalProps('tavern')
    const captive = {
      ...base.captain,
      captured: true,
      capturedBy: 'player-1',
      captivityReturnRound: base.round + 2,
    }
    const ransom = render(<CityBuildingModal {...base} captain={undefined} captains={[captive]} />)
    fireEvent.click(ransom.getByRole('button', { name: /Ransom \(/ }))
    expect(base.onRansomCaptain).toHaveBeenCalledWith(captive.id)
    ransom.unmount()

    const itemId = 'rusty-cutlass'
    const transfers = modalProps('tavern')
    const captain = { ...transfers.captain, items: [itemId] }
    const inventory = render(
      <CityBuildingModal
        {...transfers}
        captain={captain}
        captains={[captain]}
        playerItemStash={[itemId]}
      />,
    )
    fireEvent.click(inventory.getByRole('button', { name: 'Deposit' }))
    fireEvent.click(inventory.getByRole('button', { name: /Take for/ }))
    expect(transfers.onDepositItem).toHaveBeenCalledWith(itemId)
    expect(transfers.onTakeItem).toHaveBeenCalledWith(itemId)
  })

  it('uses override then local building art, retaining a named CSS fallback', () => {
    theme.spriteUrl.mockImplementation((contentId) =>
      contentId === 'building:shipyard' ? '/theme/shipyard.webp' : undefined,
    )
    const view = render(<CityBuildingModal {...modalProps('shipyard')} />)
    const art = view.container.querySelector<HTMLElement>('.building-graphic')!
    expect(art.classList.contains('city-building-art--shipyard')).toBe(true)
    let image = art.querySelector<HTMLImageElement>('.city-building-art__image')!
    expect(image.getAttribute('src')).toBe('/theme/shipyard.webp')

    fireEvent.error(image)
    image = art.querySelector<HTMLImageElement>('.city-building-art__image')!
    expect(image.getAttribute('src')).toBe('/art/city/shipyard.webp')
    fireEvent.error(image)
    expect(art.querySelector('.city-building-art__image')).toBeNull()
    expect(art.querySelector('.city-building-art__fallback')).not.toBeNull()
  })

  it('corrects the player-facing possessive without mutating unrelated names', () => {
    expect(playerFacingName("You's Capital")).toBe('Your Capital')
    expect(playerFacingName("You's Flagship")).toBe('Your Flagship')
    expect(playerFacingName("Anne's Flagship")).toBe("Anne's Flagship")
  })
})
