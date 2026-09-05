// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { GAME_SETUP, buildContentCatalog } from '@aop/content'
import { createGame, hexDistance, type Captain, type GameConfig, type GameMap } from '@aop/engine'
import type { Coord } from '@aop/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../MapCanvas', async () => {
  const { createElement: element } = await import('react')
  return {
    MapCanvas: (props: {
      captains: Array<{ ownerId: string; position: Coord }>
      viewerId: string
      onTileClick: (x: number, y: number) => void
    }) => {
      const ownCaptain = props.captains.find((captain) => captain.ownerId === props.viewerId)
      return element('div', { 'data-testid': 'map-collision-fixture' }, [
        element(
          'button',
          {
            key: 'select-fixture-unit',
            type: 'button',
            onClick: () => {
              if (ownCaptain) props.onTileClick(ownCaptain.position.x, ownCaptain.position.y)
            },
          },
          'Select fixture unit',
        ),
        element('div', { key: 'navigation', 'data-map-overlay-region': 'navigation' }),
        element('div', {
          key: 'minimap',
          'data-map-overlay-region': 'minimap',
          role: 'button',
          tabIndex: 0,
          'aria-label': 'Map overview fixture',
        }),
        element('div', { key: 'route', 'data-map-overlay-region': 'route' }),
      ])
    },
  }
})
vi.mock('../theme/ThemeContext', () => ({
  useTheme: () => ({
    factionName: (_id: string, fallback: string) => fallback,
    spriteUrl: () => undefined,
    unitName: (_id: string, fallback: string) => fallback,
  }),
}))
vi.mock('../audio/useBackgroundMusic', () => ({ useBackgroundMusic: () => undefined }))
vi.mock('../audio/useEncounterAudio', () => ({ useEncounterAudio: () => undefined }))
vi.mock('../audio/feedback', () => ({
  coinFeedback: vi.fn(),
  combatFeedback: vi.fn(),
  impactFeedback: vi.fn(),
  shipMoveFeedback: vi.fn(),
  tapFeedback: vi.fn(),
}))
vi.mock('../audio/audioManager', () => ({ audioManager: { play: vi.fn(), stop: vi.fn() } }))

import {
  classifySelectedPartyTileTap,
  factionOfOwner,
  factionOfPlayer,
  findViewerCaptainAtCity,
  GameScreen,
} from './GameScreen'

afterEach(cleanup)

/**
 * #385: `viewerCaptainAtCity` gates recruit/load-troops/unload-troops/
 * standing-order actions. It used to compare with `chebyshevDistance`, which
 * on hex maps treats some hex-distance-2 tiles as adjacent (the same bug
 * #370 fixed for the attack/encounter gates). `findViewerCaptainAtCity` is
 * the extracted pure predicate so this is unit-testable without rendering
 * the screen.
 */
describe('findViewerCaptainAtCity on a hex map (#385: mapDistance, not chebyshevDistance)', () => {
  const hexMap: GameMap = {
    width: 5,
    height: 5,
    tiles: Array.from({ length: 25 }, () => ({ type: 'shallows' as const, island: -1 })),
    startPositions: [],
    topology: 'hex',
  }

  function captainAt(position: Coord): Captain {
    return {
      id: 'cap-own',
      ownerId: 'seat-0',
      name: 'Anne',
      position,
      shipClassId: 'sloop',
      movementPoints: 2,
      maxMovementPoints: 3,
      troops: [{ unitId: 'swashbuckler', count: 6 }],
      xp: 0,
      skills: [],
      stats: { attack: 0, defense: 0, speed: 0 },
      items: [],
      shipUpgrades: {},
      captured: false,
    }
  }

  // City sits at (2,2) — an even row. Its six true hex neighbors are
  // (3,2)/(2,1)/(1,1)/(1,2)/(1,3)/(2,3). (3,1) and (3,3) are Chebyshev-1 but
  // hex-distance-2: exactly the divergence #385 fixes.
  const cityPosition: Coord = { x: 2, y: 2 }

  it('does not treat a Chebyshev-adjacent, hex-distance-2 captain as docked', () => {
    for (const position of [
      { x: 3, y: 1 },
      { x: 3, y: 3 },
    ]) {
      expect(hexDistance({ col: 2, row: 2 }, { col: position.x, row: position.y })).toBe(2)
      expect(
        findViewerCaptainAtCity([captainAt(position)], hexMap, 'seat-0', cityPosition),
      ).toBeUndefined()
    }
  })

  it('treats every true hex neighbor as docked', () => {
    const neighbors: Coord[] = [
      { x: 3, y: 2 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 3 },
    ]
    for (const position of neighbors) {
      expect(hexDistance({ col: 2, row: 2 }, { col: position.x, row: position.y })).toBe(1)
      const found = findViewerCaptainAtCity([captainAt(position)], hexMap, 'seat-0', cityPosition)
      expect(found?.id).toBe('cap-own')
    }
  })
})

/**
 * #476: a tap on the already-selected party's own tile used to hit the
 * own-party match in handleTileClick first and unconditionally re-select,
 * which made capturing the site underfoot (and resolving a co-located land
 * encounter) unreachable from any tap. `classifySelectedPartyTileTap` is the
 * extracted act-vs-reselect decision (the findViewerCaptainAtCity pattern
 * from #385) so that precedence stays unit-testable without rendering.
 */
describe('classifySelectedPartyTileTap (#476: act on own tile, not re-select)', () => {
  const viewerId = 'seat-0'
  const party = { position: { x: 3, y: 4 }, movementPoints: 2 }
  const siteHere = { id: 'site-1', position: { x: 3, y: 4 }, active: true }
  const encounterHere = { id: 'enc-1', position: { x: 3, y: 4 }, active: true }

  it('chooses captureSite for a capturable site underfoot', () => {
    expect(classifySelectedPartyTileTap(party, viewerId, [siteHere], [])).toEqual({
      action: 'captureSite',
      siteId: 'site-1',
    })
  })

  it('chooses resolveEncounter for an unresolved land encounter sharing the tile', () => {
    expect(classifySelectedPartyTileTap(party, viewerId, [], [encounterHere])).toEqual({
      action: 'resolveEncounter',
      encounterId: 'enc-1',
    })
  })

  it('re-selects on an empty own tile (the pre-existing behavior)', () => {
    expect(classifySelectedPartyTileTap(party, viewerId, [], [])).toEqual({ action: 'reselect' })
  })

  it('regression: a capturable site underfoot must never fall through to re-select', () => {
    // Before the fix, every tap on this tile behaved as 'reselect' — exactly
    // the unconditional own-party match this classifier now front-runs.
    const tap = classifySelectedPartyTileTap(party, viewerId, [siteHere], [encounterHere])
    expect(tap.action).not.toBe('reselect')
    // Site wins over a co-located encounter, preserving the tap handler's
    // long-standing site-before-encounter order.
    expect(tap).toEqual({ action: 'captureSite', siteId: 'site-1' })
  })

  it('re-selects when nothing underfoot is actionable: spent party, own claim, inactive, elsewhere', () => {
    const spent = { ...party, movementPoints: 0 }
    expect(classifySelectedPartyTileTap(spent, viewerId, [siteHere], [encounterHere])).toEqual({
      action: 'reselect',
    })
    expect(
      classifySelectedPartyTileTap(party, viewerId, [{ ...siteHere, claimedBy: viewerId }], []),
    ).toEqual({ action: 'reselect' })
    expect(
      classifySelectedPartyTileTap(
        party,
        viewerId,
        [{ ...siteHere, active: false }],
        [{ ...encounterHere, active: false }],
      ),
    ).toEqual({ action: 'reselect' })
    expect(
      classifySelectedPartyTileTap(
        party,
        viewerId,
        [{ ...siteHere, position: { x: 4, y: 4 } }],
        [{ ...encounterHere, position: { x: 4, y: 4 } }],
      ),
    ).toEqual({ action: 'reselect' })
  })

  it('a site claimed by an enemy is still capturable underfoot', () => {
    expect(
      classifySelectedPartyTileTap(party, viewerId, [{ ...siteHere, claimedBy: 'seat-1' }], []),
    ).toEqual({ action: 'captureSite', siteId: 'site-1' })
  })
})

/**
 * #AOP-CLIENT-1: `GameScreen`'s owner-id-to-faction lookup used to be a
 * single `game.players.find((p) => p.id === ownerId)!.faction` shared by
 * every caller. Inland settlements seed `ownerId: 'neutral'`
 * (packages/engine/src/game.ts:198), which never matches a player, so any
 * city-rendering path crashed with "Cannot read properties of undefined
 * (reading 'faction')". The fix splits the lookup by domain instead of
 * defensively `?.`-guarding every call site: `factionOfPlayer` stays strict
 * for captain/party owners (always real players), and `factionOfOwner`
 * layers the one legitimate neutral-sentinel case on top.
 */
describe('factionOfPlayer / factionOfOwner (#AOP-CLIENT-1: neutral-owned cities)', () => {
  const players = [
    { id: 'seat-0', faction: 'pirates' as const },
    { id: 'seat-1', faction: 'british' as const },
  ]

  it('factionOfPlayer resolves a real player id to its faction', () => {
    expect(factionOfPlayer(players, 'seat-0')).toBe('pirates')
    expect(factionOfPlayer(players, 'seat-1')).toBe('british')
  })

  it('factionOfPlayer throws for an unmatched id (fail loud, never neutral)', () => {
    expect(() => factionOfPlayer(players, 'neutral')).toThrow(/no player/i)
    expect(() => factionOfPlayer(players, 'nobody')).toThrow(/no player/i)
  })

  it('factionOfOwner resolves a real player id exactly like factionOfPlayer', () => {
    expect(factionOfOwner(players, 'seat-0')).toBe('pirates')
    expect(factionOfOwner(players, 'seat-1')).toBe('british')
  })

  it('factionOfOwner returns undefined for the neutral sentinel', () => {
    expect(factionOfOwner(players, 'neutral')).toBeUndefined()
  })

  it('factionOfOwner still throws for a genuinely unmatched, non-neutral id', () => {
    expect(() => factionOfOwner(players, 'nobody')).toThrow(/no player/i)
  })
})

describe('GameScreen', () => {
  it('renders the live game HUD and dispatches its End Turn control', () => {
    const config: GameConfig = {
      seed: 7,
      mapSize: 'small',
      setup: GAME_SETUP,
      players: [
        { id: 'player-0', name: 'Anne', faction: 'pirates', isAI: false },
        { id: 'player-1', name: 'Morgan', faction: 'british', isAI: true },
      ],
    }
    const onAction = vi.fn()
    render(
      createElement(GameScreen, {
        game: createGame(config),
        battleReport: null,
        onDismissBattleReport: vi.fn(),
        itemFound: null,
        onAction,
        onSaveSlot: async () => undefined,
        onLoadSlot: async () => undefined,
        onWatchSlot: vi.fn(),
        autosaveFailing: true,
      }),
    )

    expect(screen.getByRole('heading', { name: 'Age of Plunder' })).not.toBeNull()
    expect(document.querySelector('[data-gameplay-chrome="screen"]')).not.toBeNull()
    expect(document.querySelector('[data-gameplay-chrome="hud"]')).not.toBeNull()
    expect(document.querySelector('[data-gameplay-chrome="command-dock"]')).not.toBeNull()
    expect(screen.getByRole('group', { name: 'Resources' })).not.toBeNull()
    expect(screen.getByText(/Round 1.*Anne.*Pirates/)).not.toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/Autosave failing/)
    const endTurn = screen.getByRole('button', { name: 'End Turn' })
    expect(endTurn.querySelector('svg')).not.toBeNull()
    fireEvent.click(endTurn)
    expect(onAction).toHaveBeenCalledWith({ type: 'endTurn', playerId: 'player-0' })
  })

  it('marks only the current city in a multi-city roster', () => {
    const config: GameConfig = {
      seed: 7,
      mapSize: 'small',
      setup: GAME_SETUP,
      players: [
        { id: 'player-0', name: 'Anne', faction: 'pirates', isAI: false },
        { id: 'player-1', name: 'Morgan', faction: 'british', isAI: true },
      ],
    }
    const game = createGame(config)
    const firstCity = game.cities.find((city) => city.ownerId === 'player-0')!
    const secondCity = {
      ...firstCity,
      id: 'player-0-city-2',
      name: 'Second Harbor',
    }
    const multiCityGame = { ...game, cities: [...game.cities, secondCity] }

    render(
      createElement(GameScreen, {
        game: multiCityGame,
        battleReport: null,
        onDismissBattleReport: vi.fn(),
        itemFound: null,
        onAction: vi.fn(),
        onSaveSlot: async () => undefined,
        onLoadSlot: async () => undefined,
        onWatchSlot: vi.fn(),
        autosaveFailing: false,
      }),
    )

    const firstButton = screen.getByRole('button', { name: new RegExp(firstCity.name) })
    const secondButton = screen.getByRole('button', { name: /Second Harbor/ })
    expect(firstButton.getAttribute('aria-current')).toBe('true')
    expect(secondButton.getAttribute('aria-current')).toBeNull()

    fireEvent.click(secondButton)
    expect(firstButton.getAttribute('aria-current')).toBeNull()
    expect(secondButton.getAttribute('aria-current')).toBe('true')
  })

  it('renders the complete overlay collision-state fixture at every required viewport', () => {
    const config: GameConfig = {
      seed: 7,
      mapSize: 'small',
      setup: GAME_SETUP,
      players: [
        { id: 'player-0', name: 'Anne', faction: 'pirates', isAI: false },
        { id: 'player-1', name: 'Morgan', faction: 'british', isAI: true },
      ],
    }
    const game = createGame(config)
    const firstCity = game.cities.find((city) => city.ownerId === 'player-0')!
    const ownCaptain = game.captains.find((captain) => captain.ownerId === 'player-0')!
    const secondInterruptedCaptain = {
      ...ownCaptain,
      id: 'player-0-captain-2',
      name: 'Calico Jack',
      sailOrder: {
        destination: { ...ownCaptain.position },
        knownContactIds: [],
        interrupted: true,
      },
    }
    const collisionGame = {
      ...game,
      config: { ...game.config, content: buildContentCatalog() },
      players: game.players.map((player) =>
        player.id === 'player-0'
          ? { ...player, resources: { gold: 999, timber: 999, iron: 999, rum: 999 } }
          : player,
      ),
      cities: [...game.cities, { ...firstCity, id: 'player-0-city-2', name: 'Second Harbor' }],
      captains: [
        ...game.captains.map((captain) =>
          captain.id === ownCaptain.id
            ? {
                ...captain,
                sailOrder: {
                  destination: { ...captain.position },
                  knownContactIds: [],
                  interrupted: true,
                },
              }
            : captain,
        ),
        secondInterruptedCaptain,
      ],
    }

    const onAction = vi.fn()

    render(
      createElement(GameScreen, {
        game: collisionGame,
        battleReport: null,
        onDismissBattleReport: vi.fn(),
        itemFound: { itemId: 'fixture-item' },
        onAction,
        onSaveSlot: async () => undefined,
        onLoadSlot: async () => undefined,
        onWatchSlot: vi.fn(),
        autosaveFailing: false,
      }),
    )

    const requiredViewports = [
      [375, 667],
      [390, 844],
      [844, 390],
      [768, 1024],
      [1024, 768],
      [1440, 900],
    ]
    const expectedRegions = ['alerts', 'events', 'minimap', 'navigation', 'roster', 'route']
    for (const [width, height] of requiredViewports) {
      Object.defineProperties(window, {
        innerWidth: { configurable: true, value: width },
        innerHeight: { configurable: true, value: height },
      })
      window.dispatchEvent(new Event('resize'))
      expect(
        Array.from(document.querySelectorAll('[data-map-overlay-region]'))
          .map((node) => node.getAttribute('data-map-overlay-region'))
          .sort(),
      ).toEqual(expectedRegions)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Select fixture unit' }))

    const alerts = screen.getByRole('region', { name: '2 halted orders' })
    expect(alerts.querySelectorAll('.sail-interrupt-banner')).toHaveLength(1)
    const picker = screen.getByRole('combobox', { name: 'Choose halted order' })
    expect(picker.querySelectorAll('option')).toHaveLength(2)
    fireEvent.change(picker, { target: { value: `captain:${secondInterruptedCaptain.id}` } })
    fireEvent.click(screen.getByRole('button', { name: `Resume ${secondInterruptedCaptain.name}` }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'setSailOrder',
      playerId: 'player-0',
      captainId: secondInterruptedCaptain.id,
      destination: secondInterruptedCaptain.sailOrder.destination,
    })
    expect(screen.getByRole('list', { name: 'Recent events' })).not.toBeNull()
    expect(screen.getByRole('list', { name: 'Your cities' })).not.toBeNull()
    expect(document.querySelector('.selection-info')?.textContent).toMatch(/Movement/)
    expect(screen.getByText(/idle cit(?:y|ies) can still build/)).not.toBeNull()
  })

  it('keeps City and End Turn visible while preserving Saves and resign confirmation under More', () => {
    const config: GameConfig = {
      seed: 7,
      mapSize: 'small',
      setup: GAME_SETUP,
      players: [
        { id: 'player-0', name: 'Anne', faction: 'pirates', isAI: false },
        { id: 'player-1', name: 'Morgan', faction: 'british', isAI: true },
      ],
    }
    render(
      createElement(GameScreen, {
        game: createGame(config),
        battleReport: null,
        onDismissBattleReport: vi.fn(),
        itemFound: null,
        onAction: vi.fn(),
        onSaveSlot: async () => undefined,
        onLoadSlot: async () => undefined,
        onWatchSlot: vi.fn(),
        autosaveFailing: false,
      }),
    )

    const layout = document.querySelector<HTMLElement>('.map-command-layout')!
    const visible = Array.from(layout.children)
      .filter((child) => child.tagName === 'BUTTON')
      .map((button) => button.textContent?.trim())
    expect(visible).toEqual(['City', 'End Turn'])

    const more = layout.querySelector<HTMLDetailsElement>('.map-command-more')!
    expect(more.querySelector('summary')?.textContent).toMatch(/More/)
    const menu = more.querySelector<HTMLElement>('.map-command-more__menu')!
    const button = (name: string) =>
      Array.from(menu.querySelectorAll('button')).find((item) => item.textContent?.trim() === name)!
    expect(button('Saves')).not.toBeNull()
    expect(button('Resign')).not.toBeNull()

    fireEvent.click(button('Resign'))
    expect(button('Confirm Resign')).not.toBeNull()
    expect(button('Cancel')).not.toBeNull()
    fireEvent.click(button('Cancel'))
    expect(button('Resign')).not.toBeNull()
  })
})
