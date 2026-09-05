// @vitest-environment jsdom
// @ts-expect-error Vitest supplies Node built-ins; the browser app intentionally omits Node types.
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { GameMap, PlayerView } from '@aop/engine'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import mapAlertRegionSource from '../MapAlertRegion.tsx?raw'
import mapCanvasSource from '../MapCanvas.tsx?raw'
import minimapSource from '../Minimap.tsx?raw'
import { findViewerCaptainAtCity } from '../cityDocking'
import gameScreenSource from './GameScreen.tsx?raw'
import matchScreenSource from './MatchScreen.tsx?raw'

const multiplayerHarness = vi.hoisted(() => ({
  getPlayerView: vi.fn(),
  submitWithRetry: vi.fn(),
}))

vi.mock('../auth', () => ({
  useAuth: () => ({
    state: {
      status: 'authenticated',
      user: { id: 'user-0', email: 'anne@example.test' },
      session: {
        accessToken: 'access-test',
        refreshToken: 'refresh-test',
        expiresAt: Number.MAX_SAFE_INTEGER,
        user: { id: 'user-0', email: 'anne@example.test' },
      },
    },
  }),
}))
vi.mock('../auth/config', () => ({
  resolveSupabaseConfig: () => ({ url: 'https://example.test', anonKey: 'anon-test' }),
}))
vi.mock('../audio/feedback', () => ({
  impactFeedback: vi.fn(),
  shipMoveFeedback: vi.fn(),
  tapFeedback: vi.fn(),
}))
vi.mock('../multiplayer/spectateClient', () => ({
  SpectateClient: class {
    getPlayerView = multiplayerHarness.getPlayerView
  },
  SpectateError: class SpectateError extends Error {
    code?: string
  },
}))
vi.mock('../multiplayer/realtimeTransport', () => ({
  supabaseRealtimeClient: () => ({}),
  createMatchRealtimeTransport: () => ({
    subscribe: () => () => undefined,
    onChannelStatusChange: () => () => undefined,
    setAuth: vi.fn(),
    dispose: vi.fn(),
  }),
}))
vi.mock('../multiplayer/turnSync', () => ({ subscribeTurnSync: () => () => undefined }))
vi.mock('../multiplayer/spectatePoll', () => ({ subscribeSpectatePoll: () => () => undefined }))
vi.mock('../multiplayer/reconnectSync', () => ({
  subscribeReconnectSync: () => () => undefined,
}))
vi.mock('../multiplayer/submitWithRetry', () => ({
  submitActionWithRetry: multiplayerHarness.submitWithRetry,
}))
vi.mock('../MapCanvas', async () => {
  const { createElement: element } = await import('react')
  return {
    MapCanvas: (props: {
      captains: Array<{ ownerId: string; position: { x: number; y: number } }>
      viewerId: string
      onTileClick: (x: number, y: number) => void
    }) => {
      const ownCaptain = props.captains.find((captain) => captain.ownerId === props.viewerId)
      return element('div', { 'data-testid': 'multiplayer-map-collision-fixture' }, [
        element(
          'button',
          {
            key: 'select-fixture-unit',
            type: 'button',
            onClick: () => {
              if (ownCaptain) props.onTileClick(ownCaptain.position.x, ownCaptain.position.y)
            },
          },
          'Select multiplayer fixture unit',
        ),
        element('div', { key: 'navigation', 'data-map-overlay-region': 'navigation' }),
        element('div', { key: 'route', 'data-map-overlay-region': 'route' }),
        element('div', {
          key: 'minimap',
          'data-map-overlay-region': 'minimap',
          role: 'button',
          tabIndex: 0,
          'aria-label': 'Multiplayer map overview fixture',
        }),
      ])
    },
  }
})

import { MatchScreen } from './MatchScreen'

const workingDirectory = (
  globalThis as typeof globalThis & { process: { cwd: () => string } }
).process.cwd()
const stylesSource = readFileSync(
  workingDirectory.endsWith('/apps/web')
    ? `${workingDirectory}/src/styles.css`
    : `${workingDirectory}/apps/web/src/styles.css`,
  'utf8',
) as string

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

afterEach(() => {
  cleanup()
  multiplayerHarness.getPlayerView.mockReset()
  multiplayerHarness.submitWithRetry.mockReset()
})

function multiplayerCollisionView(): PlayerView {
  const tiles: PlayerView['tiles'] = []
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      tiles.push({ coord: { x, y }, type: 'shallows', island: -1, visible: true })
    }
  }
  const sailOrder: NonNullable<PlayerView['captains'][number]['sailOrder']> = {
    destination: { x: 3, y: 3 },
    knownContactIds: [],
    interrupted: true,
  }
  return {
    viewerId: 'seat-0',
    round: 2,
    currentPlayerIndex: 0,
    status: 'active',
    winnerId: null,
    rules: { setup: {} as PlayerView['rules']['setup'], mapSize: 'small' },
    mapWidth: 4,
    mapHeight: 4,
    topology: 'hex',
    tiles,
    players: [
      {
        id: 'seat-0',
        name: 'Anne',
        faction: 'pirates',
        isAI: false,
        eliminated: false,
        reputation: 0,
        resources: { gold: 999, timber: 999, iron: 999, rum: 999 },
      },
      {
        id: 'seat-1',
        name: 'Morgan',
        faction: 'british',
        isAI: false,
        eliminated: false,
        reputation: 0,
      },
    ],
    cities: [
      {
        id: 'city-own',
        ownerId: 'seat-0',
        name: 'Nassau',
        position: { x: 2, y: 2 },
        buildings: ['dock'],
        garrison: {},
        unitAvailability: {},
        builtThisRound: false,
      },
      {
        id: 'city-own-2',
        ownerId: 'seat-0',
        name: 'New Providence',
        position: { x: 2, y: 3 },
        buildings: ['dock'],
        garrison: {},
        unitAvailability: {},
        builtThisRound: false,
      },
    ],
    captains: [
      {
        id: 'cap-anne',
        ownerId: 'seat-0',
        name: 'Anne',
        position: { x: 0, y: 0 },
        shipClassId: 'sloop',
        troops: [{ unitId: 'swashbuckler', count: 6 }],
        movementPoints: 2,
        maxMovementPoints: 3,
        captured: false,
        sailOrder,
      },
      {
        id: 'cap-jack',
        ownerId: 'seat-0',
        name: 'Calico Jack',
        position: { x: 1, y: 0 },
        shipClassId: 'sloop',
        troops: [{ unitId: 'swashbuckler', count: 4 }],
        movementPoints: 2,
        maxMovementPoints: 3,
        captured: false,
        sailOrder,
      },
    ],
    parties: [],
    encounters: [],
    landSites: [],
    landEncounters: [],
    alliances: { allies: [], outgoingProposals: [], incomingProposals: [] },
    rngState: null,
  }
}

describe('#613 map overlay and command contract', () => {
  it('assigns every overlay to one coordinated region in both SP and MP', () => {
    for (const region of ['navigation', 'route']) {
      expect(mapCanvasSource).toContain(`data-map-overlay-region="${region}"`)
    }
    expect(minimapSource).toContain('data-map-overlay-region="minimap"')
    for (const source of [gameScreenSource, matchScreenSource]) {
      for (const region of ['events', 'roster']) {
        expect(source).toContain(`data-map-overlay-region="${region}"`)
      }
      expect(source).toContain('<MapAlertRegion orders={haltedOrders} />')
    }
    expect(mapAlertRegionSource).toContain('data-map-overlay-region="alerts"')
    expect(stylesSource).toContain('env(safe-area-inset-top, 0px)')
    expect(stylesSource).toContain('env(safe-area-inset-right, 0px)')
    expect(stylesSource).toContain('env(safe-area-inset-bottom, 0px)')
    expect(stylesSource).toContain('env(safe-area-inset-left, 0px)')
  })

  it('keeps the six required collision viewports tied to compact layout rules', () => {
    const requiredViewports = [
      [375, 667],
      [390, 844],
      [844, 390],
      [768, 1024],
      [1024, 768],
      [1440, 900],
    ]
    expect(requiredViewports).toHaveLength(6)
    expect(stylesSource).toContain('--map-minimap-size: min(112px, 28vw)')
    expect(stylesSource).toContain('--map-minimap-size: min(96px, 20vw)')
    expect(stylesSource).toMatch(/\.map-nav-controls\s*\{[^}]*flex-direction: row/s)
    expect(stylesSource).toMatch(
      /@media \(max-height: 419px\)[\s\S]*?\.map-nav-controls\s*\{[^}]*flex-direction: row/s,
    )
    expect(stylesSource).toMatch(/\.city-roster\s*\{[^}]*overflow-x: auto/s)
    expect(stylesSource).toContain('.turn-event-feed li:nth-child(n + 3)')
    expect(stylesSource).toMatch(
      /@media \(max-height: 419px\)[\s\S]*?\.map-minimap\s*\{\s*display: block;/,
    )
    expect(stylesSource).toMatch(/\.map-alert-picker\s*\{[^}]*min-width: 0/s)
    expect(stylesSource).toMatch(/\.map-alert-picker select\s*\{[^}]*min-height: 44px/s)
  })

  it('routes every SP and MP sail/march interruption through the shared one-card aggregator', () => {
    expect(mapAlertRegionSource).toContain('orders.find((order) => order.id === selectedId)')
    expect(mapAlertRegionSource).toContain('orders.length > 1')
    expect(mapAlertRegionSource.match(/className="sail-interrupt-banner"/g)).toHaveLength(1)
    expect(mapAlertRegionSource).toContain('aria-label="Choose halted order"')

    for (const source of [gameScreenSource, matchScreenSource]) {
      expect(source).toContain('...interruptedCaptains.map((captain) => ({')
      expect(source).toContain('...interruptedParties.map((party) => ({')
      expect(source).toContain('onResume: () => resumeSailOrder(captain.id)')
      expect(source).toContain('onCancel: () => cancelSailOrder(captain.id)')
      expect(source).toContain('onResume: () => resumeMarchOrder(party.id)')
      expect(source).toContain('onCancel: () => cancelMarchOrder(party.id)')
      expect(source.match(/<MapAlertRegion orders=\{haltedOrders\} \/>/g)).toHaveLength(1)
      expect(source).not.toContain('className="sail-interrupt-banner"')
    }
  })

  it('keeps primary actions visible and every prior secondary multiplayer action reachable', () => {
    const layoutStart = matchScreenSource.indexOf('button-group map-command-layout')
    const detailsStart = matchScreenSource.indexOf(
      '<details className="map-command-more">',
      layoutStart,
    )
    const detailsEnd = matchScreenSource.indexOf('</details>', detailsStart)
    const primary = matchScreenSource.slice(layoutStart, detailsStart)
    const secondary = matchScreenSource.slice(detailsStart, detailsEnd)
    expect(primary).toContain('City')
    expect(primary).toContain('End Turn')
    for (const action of ['Diplomacy', 'Chat', 'Resign', 'Leave']) {
      expect(secondary).toContain(action)
    }
    expect(secondary).toContain('Confirm Resign')
    expect(secondary).toContain('Cancel')
    expect(matchScreenSource).toContain('disabled={!myTurn || !firstOwnCityId}')
    expect(matchScreenSource).toContain("disabled={view.status !== 'active'}")
    expect(matchScreenSource).toContain(
      "disabled={!myTurn || submitting || view.status !== 'active'}",
    )
    expect(matchScreenSource).toContain('disabled={!myTurn || submitting}')
    expect(matchScreenSource).toContain('onClick={onBack}')
  })

  it('keeps Saves and resign confirmation reachable without demoting City or End Turn', () => {
    const layoutStart = gameScreenSource.indexOf('button-group map-command-layout')
    const detailsStart = gameScreenSource.indexOf(
      '<details className="map-command-more">',
      layoutStart,
    )
    const detailsEnd = gameScreenSource.indexOf('</details>', detailsStart)
    const primary = gameScreenSource.slice(layoutStart, detailsStart)
    const secondary = gameScreenSource.slice(detailsStart, detailsEnd)
    expect(primary).toContain('City')
    expect(primary).toContain('End Turn')
    expect(secondary).toContain('Saves')
    expect(secondary).toContain('Resign')
    expect(secondary).toContain('Confirm Resign')
    expect(secondary).toContain('Cancel')
    expect(gameScreenSource).toContain('disabled={!isViewerTurn}')
    expect(gameScreenSource).toContain('disabled={player.isAI}')
  })
})

describe('#613 multiplayer multi-alert collision consumer', () => {
  it('mounts two live interrupted orders as one selectable card at 844 x 390', async () => {
    const view = multiplayerCollisionView()
    multiplayerHarness.getPlayerView.mockResolvedValue({
      seq: 7,
      seat: 0,
      role: 'player',
      view,
      turnDeadline: null,
    })
    multiplayerHarness.submitWithRetry.mockResolvedValue({ kind: 'stale' })
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 844 },
      innerHeight: { configurable: true, value: 390 },
    })

    render(createElement(MatchScreen, { matchId: 'match-map-alerts', onBack: vi.fn() }))

    const alerts = await screen.findByRole('region', { name: '2 halted orders' })
    expect(alerts.querySelectorAll('.sail-interrupt-banner')).toHaveLength(1)
    expect(document.querySelector('[data-map-overlay-region="route"]')).not.toBeNull()
    expect(document.querySelector('[data-gameplay-chrome="command-dock"]')).not.toBeNull()
    expect(screen.getByRole('list', { name: 'Your cities' })).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Select multiplayer fixture unit' }))
    expect(document.querySelector('.selection-info')?.textContent).toMatch(/Movement/)

    const picker = screen.getByRole('combobox', { name: 'Choose halted order' })
    expect(picker.querySelectorAll('option')).toHaveLength(2)
    fireEvent.change(picker, { target: { value: 'captain:cap-jack' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resume Calico Jack' }))

    await waitFor(() => expect(multiplayerHarness.submitWithRetry).toHaveBeenCalledOnce())
    expect(multiplayerHarness.submitWithRetry.mock.calls[0]?.[2]).toMatchObject({
      type: 'setSailOrder',
      playerId: 'seat-0',
      captainId: 'cap-jack',
      destination: { x: 3, y: 3 },
    })
  })
})

describe('#613 reduced-motion and input regression contract', () => {
  it('performs zero ambient writes from the reduced-motion ticker branch', () => {
    expect(mapCanvasSource).toMatch(
      /function animateAmbient\([^)]*\) \{\s*if \(reducedMotion\) return/,
    )
    expect(mapCanvasSource).toContain('if (!reducedMotion) animateAmbient(ticker.deltaMS)')
    expect(mapCanvasSource).toContain('const animating = !reducedMotion && shipAnims.size > 0')
    expect(mapCanvasSource).toContain('selectionPulse.alpha = hasSelectionRef.current ? 1 : 0')
    expect(mapCanvasSource).toContain('shipAnims.clear()')
    expect(mapCanvasSource).toContain('publishCamera(target)')
    expect(mapCanvasSource).toMatch(/!reducedMotion &&\s*path &&/)
  })

  it('cancels programmatic motion on pointer/wheel input and clamps every mutation path', () => {
    const pointerDown = mapCanvasSource.slice(
      mapCanvasSource.indexOf('function onPointerDown'),
      mapCanvasSource.indexOf('function onPointerMove'),
    )
    const wheel = mapCanvasSource.slice(
      mapCanvasSource.indexOf('function onWheel'),
      mapCanvasSource.indexOf('function onResize'),
    )
    expect(pointerDown).toContain('stopCameraMotion()')
    expect(wheel).toContain('stopCameraMotion()')
    expect(mapCanvasSource).toContain('publishCamera({ x: dragStart.viewX + dx')
    expect(mapCanvasSource).toContain('zoomCameraAt(')
    expect(mapCanvasSource).toContain('centerCameraOnTile(')
    expect(mapCanvasSource).toContain('fitMapCamera(')
    expect(mapCanvasSource).toContain('publishCamera(view)')
  })

  it('retains touch course confirmation and keyboard cursor/live announcements', () => {
    expect(mapCanvasSource).toContain("e.pointerType === 'touch' && updateTouchPreview")
    expect(mapCanvasSource).toContain('const isSecondTap =')
    expect(mapCanvasSource).toContain('onSetCourse?.(cell)')
    expect(mapCanvasSource).toContain('moveCursor(cursor, e.key')
    expect(mapCanvasSource).toContain('controlsRef.current?.keepTileVisible(next)')
    expect(mapCanvasSource).toContain('aria-live="polite"')
  })

  it('uses event-driven minimap updates with symmetric lifecycle cleanup', () => {
    expect(minimapSource).not.toContain('requestAnimationFrame')
    expect(minimapSource).toContain('role="button"')
    expect(minimapSource).toContain('tabIndex={0}')
    expect(minimapSource).toContain('map-minimap__viewport-label')
    expect(minimapSource).toContain('addEventListener(MAP_CAMERA_CHANGE_EVENT, update)')
    expect(minimapSource).toContain('removeEventListener(MAP_CAMERA_CHANGE_EVENT, update)')
    expect(mapCanvasSource).toContain('pixiApp.ticker.add(tick)')
    expect(mapCanvasSource).toContain('pixiApp.ticker.remove(tick)')
    expect(mapCanvasSource).toContain("addEventListener('change', onReducedMotionChange)")
    expect(mapCanvasSource).toContain("removeEventListener('change', onReducedMotionChange)")
  })
})

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
