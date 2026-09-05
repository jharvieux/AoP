// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Captain, CityState, GameMap, LandingParty } from '@aop/engine'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAP_CAMERA_CHANGE_EVENT, type CameraView } from './mapCamera'

vi.mock('./MapCanvas', () => ({
  TILE_COLOR: {
    deep: '#1b4a6b',
    shallows: '#2a6a8f',
    land: '#4a7c3f',
    port: '#c9a227',
  },
}))

import { Minimap } from './Minimap'

interface FillRecord {
  shape: 'arc' | 'rect' | 'path'
  color: string
}

let fills: FillRecord[]
let activeShape: FillRecord['shape']

const context = {
  fillStyle: '',
  filter: 'none',
  beginPath: vi.fn(() => {
    activeShape = 'path'
  }),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  arc: vi.fn(() => {
    activeShape = 'arc'
  }),
  fill: vi.fn(() => {
    fills.push({ shape: activeShape, color: context.fillStyle })
  }),
  fillRect: vi.fn(() => {
    fills.push({ shape: 'rect', color: context.fillStyle })
  }),
}

const map: GameMap = {
  width: 4,
  height: 4,
  tiles: Array.from({ length: 16 }, () => ({ type: 'deep' as const, island: -1 })),
  startPositions: [],
  topology: 'square',
}

function captain(ownerId: string): Captain {
  return {
    id: `captain-${ownerId}`,
    ownerId,
    name: 'Anne',
    position: { x: 1, y: 1 },
    shipClassId: 'sloop',
    movementPoints: 3,
    maxMovementPoints: 3,
    troops: [],
    xp: 0,
    skills: [],
    stats: { attack: 0, defense: 0, speed: 0 },
    items: [],
    shipUpgrades: {},
    captured: false,
  }
}

function party(ownerId: string): LandingParty {
  return {
    id: `party-${ownerId}`,
    ownerId,
    name: 'Shore party',
    position: { x: 2, y: 2 },
    movementPoints: 2,
    maxMovementPoints: 2,
    troops: [],
  }
}

function renderMinimap(
  options: {
    cities?: CityState[]
    captains?: Captain[]
    parties?: LandingParty[]
    exploredKeys?: Set<string>
    visibleKeys?: Set<string>
    onJump?: (tile: { x: number; y: number }) => void
    onFit?: () => void
  } = {},
) {
  const cameraRef = createRef<CameraView>()
  cameraRef.current = { x: 0, y: 0, scale: 1 }
  const mapContainer = document.createElement('div')
  Object.defineProperties(mapContainer, {
    clientWidth: { configurable: true, value: 320 },
    clientHeight: { configurable: true, value: 160 },
  })
  const containerRef = createRef<HTMLDivElement>()
  containerRef.current = mapContainer
  const onJump = vi.fn(options.onJump)
  const onFit = vi.fn(options.onFit)
  const result = render(
    <Minimap
      map={map}
      cities={options.cities ?? []}
      captains={options.captains ?? []}
      parties={options.parties ?? []}
      viewerId="viewer"
      exploredKeys={options.exploredKeys ?? new Set()}
      visibleKeys={options.visibleKeys ?? new Set()}
      cameraRef={cameraRef}
      containerRef={containerRef}
      tileSize={32}
      onJump={onJump}
      onFit={onFit}
    />,
  )
  return { ...result, cameraRef, mapContainer, onJump, onFit }
}

beforeEach(() => {
  fills = []
  activeShape = 'path'
  vi.clearAllMocks()
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => context),
  })
})

afterEach(cleanup)

describe('accessible minimap navigation', () => {
  it('is a named, focusable control with an explicit non-color viewport label', () => {
    renderMinimap()
    const control = screen.getByRole('button', {
      name: /Map overview.*Selected column 3, row 3.*arrow keys.*Enter.*Home/i,
    })
    expect(control.getAttribute('tabindex')).toBe('0')
    expect(control.querySelector('.map-minimap__viewport-label')?.textContent).toBe('View')
    control.focus()
    expect(document.activeElement).toBe(control)
  })

  it('maps primary pointer input through the rendered canvas to a tile', () => {
    const { onJump } = renderMinimap()
    const control = screen.getByRole('button', { name: /Map overview/i })
    const canvas = control.querySelector('canvas')!
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 150,
      bottom: 150,
      width: 150,
      height: 150,
      toJSON: () => ({}),
    })
    fireEvent.pointerDown(control, { button: 0, clientX: 75, clientY: 75 })
    expect(onJump).toHaveBeenCalledWith({ x: 2, y: 2 })
  })

  it('offers keyboard region selection and a Home fit action', () => {
    const { onJump, onFit } = renderMinimap()
    const control = screen.getByRole('button', { name: /Map overview/i })
    const bubbled = vi.fn()
    document.body.addEventListener('keydown', bubbled)
    fireEvent.keyDown(control, { key: 'ArrowLeft' })
    fireEvent.keyDown(control, { key: 'ArrowUp' })
    expect(control.getAttribute('aria-label')).toMatch(/Selected column 2, row 2/)
    fireEvent.keyDown(control, { key: 'Enter' })
    expect(onJump).toHaveBeenCalledWith({ x: 1, y: 1 })
    fireEvent.keyDown(control, { key: 'Home' })
    expect(onFit).toHaveBeenCalledTimes(1)
    expect(bubbled).not.toHaveBeenCalled()
    document.body.removeEventListener('keydown', bubbled)
  })

  it('updates its viewport only from camera/resize signals and removes its listener', () => {
    const requestFrame = vi.spyOn(globalThis, 'requestAnimationFrame')
    const { cameraRef, mapContainer, unmount } = renderMinimap()
    cameraRef.current = { x: -64, y: -32, scale: 1 }
    mapContainer.dispatchEvent(new Event(MAP_CAMERA_CHANGE_EVENT))
    const viewport = document.querySelector<HTMLElement>('.map-minimap__viewport')!
    expect(viewport.style.left).toBe('50%')
    expect(viewport.style.top).toBe('25%')
    expect(requestFrame).not.toHaveBeenCalled()
    const remove = vi.spyOn(mapContainer, 'removeEventListener')
    unmount()
    expect(remove).toHaveBeenCalledWith(MAP_CAMERA_CHANGE_EVENT, expect.any(Function))
  })
})

describe('minimap fog parity', () => {
  it('does not draw a hidden enemy fleet or party, then draws both in current vision', () => {
    const enemyCaptain = captain('enemy')
    const enemyParty = party('enemy')
    const { rerender, cameraRef, mapContainer, onJump, onFit } = renderMinimap({
      captains: [enemyCaptain],
      parties: [enemyParty],
      exploredKeys: new Set(['1,1', '2,2']),
    })
    expect(fills.some((fill) => fill.shape === 'arc' && fill.color === '#e23b3b')).toBe(false)
    expect(fills.some((fill) => fill.shape === 'rect' && fill.color === '#e23b3b')).toBe(false)

    fills = []
    rerender(
      <Minimap
        map={map}
        cities={[]}
        captains={[enemyCaptain]}
        parties={[enemyParty]}
        viewerId="viewer"
        exploredKeys={new Set(['1,1', '2,2'])}
        visibleKeys={new Set(['1,1', '2,2'])}
        cameraRef={cameraRef}
        containerRef={{ current: mapContainer }}
        tileSize={32}
        onJump={onJump}
        onFit={onFit}
      />,
    )
    expect(fills.some((fill) => fill.shape === 'arc' && fill.color === '#e23b3b')).toBe(true)
    expect(fills.some((fill) => fill.shape === 'rect' && fill.color === '#e23b3b')).toBe(true)
  })

  it('always draws own units but never turns an unexplored enemy city into a marker', () => {
    const hiddenCity = {
      id: 'enemy-city',
      ownerId: 'enemy',
      name: 'Hidden Harbor',
      position: { x: 3, y: 3 },
    } as CityState
    renderMinimap({ cities: [hiddenCity], captains: [captain('viewer')], exploredKeys: new Set() })
    expect(fills.some((fill) => fill.shape === 'arc' && fill.color === '#3be2a1')).toBe(true)
    expect(fills.some((fill) => fill.shape === 'arc' && fill.color === '#9aa0a6')).toBe(false)
  })

  it('removes newly fogged enemy markers and never revives a pooled captain position', () => {
    const enemyCaptain = captain('enemy')
    const enemyParty = party('enemy')
    const pooledCaptain = { ...captain('viewer'), id: 'pooled-captain', shipLost: true as const }
    const { rerender, cameraRef, mapContainer, onJump, onFit } = renderMinimap({
      captains: [enemyCaptain, pooledCaptain],
      parties: [enemyParty],
      exploredKeys: new Set(['1,1', '2,2']),
      visibleKeys: new Set(['1,1', '2,2']),
    })
    expect(fills.filter((fill) => fill.shape === 'arc' && fill.color === '#e23b3b')).toHaveLength(1)
    expect(fills.some((fill) => fill.shape === 'rect' && fill.color === '#e23b3b')).toBe(true)
    expect(fills.some((fill) => fill.shape === 'arc' && fill.color === '#3be2a1')).toBe(false)

    fills = []
    rerender(
      <Minimap
        map={map}
        cities={[]}
        captains={[enemyCaptain, pooledCaptain]}
        parties={[enemyParty]}
        viewerId="viewer"
        exploredKeys={new Set(['1,1', '2,2'])}
        visibleKeys={new Set()}
        cameraRef={cameraRef}
        containerRef={{ current: mapContainer }}
        tileSize={32}
        onJump={onJump}
        onFit={onFit}
      />,
    )
    expect(fills.some((fill) => fill.color === '#e23b3b')).toBe(false)
    expect(fills.some((fill) => fill.color === '#3be2a1')).toBe(false)
  })
})
