// @vitest-environment jsdom
// @ts-expect-error Vitest runs in Node; the browser app intentionally excludes Node ambient types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workingDirectory = (
  globalThis as typeof globalThis & { process: { cwd: () => string } }
).process.cwd()
const stylesSource = readFileSync(
  workingDirectory.endsWith('/apps/web')
    ? `${workingDirectory}/src/styles.css`
    : `${workingDirectory}/apps/web/src/styles.css`,
  'utf8',
) as string

type Box = readonly [x: number, y: number, width: number, height: number]
type RegionName = 'alerts' | 'events' | 'minimap' | 'navigation' | 'roster' | 'route'

interface CollisionFrame {
  label: string
  mode: 'sp' | 'mp'
  viewport: readonly [width: number, height: number]
  map: Box
  regions: Record<RegionName, Box>
}

const COLLISION_FRAMES: CollisionFrame[] = [
  {
    label: '375x667 SP',
    mode: 'sp',
    viewport: [375, 667],
    map: [0, 104.5938, 375, 472.6094],
    regions: {
      navigation: [179, 112.5938, 188, 44],
      minimap: [262, 464.2031, 105, 105],
      events: [8, 112.5938, 155, 47.5938],
      alerts: [8, 164.5938, 359, 102],
      roster: [8, 517.2031, 246, 52],
      route: [93.75, 412.2031, 187.5, 44],
    },
  },
  {
    label: '390x844 SP',
    mode: 'sp',
    viewport: [390, 844],
    map: [0, 104.5938, 390, 649.6094],
    regions: {
      navigation: [194, 112.5938, 188, 44],
      minimap: [272.8047, 637.0078, 109.1953, 109.1953],
      events: [8, 112.5938, 170, 47.5938],
      alerts: [8, 164.5938, 374, 102],
      roster: [8, 702.2031, 247.5234, 44],
      route: [97.5, 585.0078, 195, 44],
    },
  },
  {
    label: '844x390 SP',
    mode: 'sp',
    viewport: [844, 390],
    map: [0, 64, 844, 236.203],
    regions: {
      navigation: [644, 76, 188, 44],
      minimap: [736, 192.203, 96, 96],
      events: [12, 76, 240, 44],
      alerts: [162, 128, 520, 62],
      roster: [12, 236.203, 236.3125, 52],
      route: [300.0742, 240.203, 243.8516, 48],
    },
  },
  {
    label: '768x1024 SP',
    mode: 'sp',
    viewport: [768, 1024],
    map: [0, 64, 768, 870.2031],
    regions: {
      navigation: [712, 76, 44, 200],
      minimap: [636, 802.2031, 120, 120],
      events: [12, 76, 240, 44],
      alerts: [124, 128, 520, 62],
      roster: [12, 878.2031, 263.5234, 44],
      route: [262.0742, 818.2031, 243.8516, 48],
    },
  },
  {
    label: '1024x768 MP',
    mode: 'mp',
    viewport: [1024, 768],
    map: [0, 64, 1024, 639],
    regions: {
      navigation: [968, 76, 44, 200],
      minimap: [889.125, 586.0078, 122.875, 104.9922],
      events: [12, 76, 240, 44],
      alerts: [252, 128, 520, 62],
      roster: [12, 647, 234.2734, 44],
      route: [390.0742, 587, 243.8516, 48],
    },
  },
  {
    label: '1440x900 SP',
    mode: 'sp',
    viewport: [1440, 900],
    map: [0, 69.7969, 1440, 740.4063],
    regions: {
      navigation: [1384, 81.7969, 44, 200],
      minimap: [1278, 648.2031, 150, 150],
      events: [12, 81.7969, 240, 55.5938],
      alerts: [460, 81.7969, 520, 62],
      roster: [12, 754.2031, 263.5234, 44],
      route: [598.0742, 694.2031, 243.8516, 48],
    },
  },
  {
    label: '844x390 MP supplemental',
    mode: 'mp',
    viewport: [844, 390],
    map: [0, 64, 844, 261],
    regions: {
      navigation: [644, 76, 188, 44],
      minimap: [736, 230.9766, 96, 82.0234],
      events: [12, 76, 240, 44],
      alerts: [162, 128, 520, 62],
      roster: [12, 269, 234.2734, 44],
      route: [300.0742, 265, 243.8516, 48],
    },
  },
]

const BOTTOM_ANCHORED_REGIONS = new Set<RegionName>(['minimap', 'roster', 'route'])

function domRect([x, y, width, height]: Box): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    toJSON: () => ({ x, y, width, height }),
  }
}

function moveUp(box: Box, distance: number): Box {
  return [box[0], box[1] - distance, box[2], box[3]]
}

function resolvedPixels(value: string, style: CSSStyleDeclaration): number {
  let resolved = value.trim()
  for (let depth = 0; depth < 4 && resolved.includes('var('); depth++) {
    resolved = resolved.replace(/var\((--[\w-]+)\)/g, (_, property: string) =>
      style.getPropertyValue(property).trim(),
    )
  }
  const match = resolved.match(/^(-?\d+(?:\.\d+)?)px$/)
  if (!match) throw new Error(`Expected a resolved pixel value, got "${resolved}"`)
  return Number(match[1])
}

function setRect(element: Element, box: Box): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => domRect(box),
  })
}

function intersectionArea(a: DOMRect, b: DOMRect): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  return width * height
}

function collisionElements(root: ParentNode): Element[] {
  return [
    ...root.querySelectorAll('[data-map-overlay-region]'),
    ...root.querySelectorAll('.map-command-more[open] > .map-command-more__menu'),
  ]
}

function positiveIntersections(elements: Element[]): string[] {
  const collisions: string[] = []
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const first = elements[i]!
      const second = elements[j]!
      if (intersectionArea(first.getBoundingClientRect(), second.getBoundingClientRect()) > 0) {
        const name = (element: Element) =>
          element.getAttribute('data-map-overlay-region') ?? 'command-menu'
        collisions.push(`${name(first)}:${name(second)}`)
      }
    }
  }
  return collisions
}

function commandFixture(mode: 'sp' | 'mp', state: 'closed' | 'open' | 'confirm'): HTMLElement {
  const actionCount = state === 'confirm' ? (mode === 'sp' ? 3 : 5) : mode === 'sp' ? 2 : 4
  const root = document.createElement('div')
  root.className = 'game-screen-container'
  root.innerHTML = `
    <div class="map-container">
      ${(['alerts', 'events', 'minimap', 'navigation', 'roster', 'route'] as const)
        .map((region) => `<div data-map-overlay-region="${region}"></div>`)
        .join('')}
    </div>
    <div class="bottom-action-bar gameplay-command-dock">
      <div class="selection-info" role="status">Anne — Movement 2/3</div>
      <div class="idle-city-hint" role="status">1 idle city can still build</div>
      <div class="button-group map-command-layout" role="group" aria-label="Map commands">
        <button class="secondary">City</button>
        <button class="primary">End Turn</button>
        <details class="map-command-more"${state === 'closed' ? '' : ' open'}>
          <summary class="map-command-more__toggle">More</summary>
          <div class="map-command-more__menu" role="group" aria-label="More commands">
            ${Array.from({ length: actionCount }, (_, index) => `<button class="secondary">Action ${index + 1}</button>`).join('')}
          </div>
        </details>
      </div>
    </div>
  `
  document.body.replaceChildren(root)
  return root
}

describe('#613 in-flow map command geometry', () => {
  it('keeps closed, open, and confirm menus collision-free in every SP/MP viewport', () => {
    const style = document.createElement('style')
    style.textContent = stylesSource
    document.head.append(style)

    try {
      for (const frame of COLLISION_FRAMES) {
        for (const state of ['closed', 'open', 'confirm'] as const) {
          const root = commandFixture(frame.mode, state)
          const map = root.querySelector<HTMLElement>('.map-container')!
          const layout = root.querySelector<HTMLElement>('.map-command-layout')!
          const details = root.querySelector<HTMLDetailsElement>('.map-command-more')!
          const toggle = root.querySelector<HTMLElement>('.map-command-more__toggle')!
          const menu = root.querySelector<HTMLElement>('.map-command-more__menu')!
          const menuButton = menu.querySelector<HTMLElement>('button')!

          expect(getComputedStyle(map).overflow, `${frame.label} map clipping`).toBe('hidden')
          expect(getComputedStyle(layout).alignItems, `${frame.label} grid alignment`).toBe('end')
          expect(getComputedStyle(details).display, `${frame.label} details flow`).toBe('flex')
          expect(getComputedStyle(toggle).height, `${frame.label} More target`).toBe('44px')
          expect(getComputedStyle(menuButton).minHeight, `${frame.label} menu target`).toBe('44px')

          const menuStyle = getComputedStyle(menu)
          expect(menuStyle.position, `${frame.label} menu positioning`).toBe('static')
          expect(menuStyle.gridAutoFlow, `${frame.label} menu direction`).toBe('column')
          expect(menuStyle.overflowX, `${frame.label} bounded overflow`).toBe('auto')
          expect(menuStyle.maxWidth, `${frame.label} safe left inset`).toContain(
            'safe-area-inset-left',
          )
          expect(menuStyle.maxWidth, `${frame.label} safe right inset`).toContain(
            'safe-area-inset-right',
          )

          const menuHeight = resolvedPixels(menuStyle.height, menuStyle)
          const menuGap = resolvedPixels(menuStyle.marginBottom, menuStyle)
          const dockGrowth = state === 'closed' ? 0 : menuHeight + menuGap
          expect(menuHeight).toBe(44)
          expect(menuGap).toBe(0)

          const mapBottom = frame.map[1] + frame.map[3] - dockGrowth
          setRect(map, [frame.map[0], frame.map[1], frame.map[2], frame.map[3] - dockGrowth])
          for (const [name, box] of Object.entries(frame.regions) as [RegionName, Box][]) {
            const element = root.querySelector(`[data-map-overlay-region="${name}"]`)!
            setRect(element, BOTTOM_ANCHORED_REGIONS.has(name) ? moveUp(box, dockGrowth) : box)
          }

          if (state !== 'closed') {
            const [viewportWidth] = frame.viewport
            const layoutWidth = Math.min(680, viewportWidth - 24)
            const layoutRight = (viewportWidth + layoutWidth) / 2
            setRect(menu, [layoutRight - layoutWidth, mapBottom + 8, layoutWidth, menuHeight])
          }

          expect(positiveIntersections(collisionElements(root)), `${frame.label} ${state}`).toEqual(
            [],
          )
        }
      }
    } finally {
      style.remove()
      document.body.replaceChildren()
    }
  })

  it('detects the former escaped-upward menu overlap and retains details toggling', () => {
    const root = commandFixture('sp', 'closed')
    const details = root.querySelector<HTMLDetailsElement>('.map-command-more')!
    const summary = root.querySelector<HTMLElement>('.map-command-more__toggle')!
    expect(details.open).toBe(false)
    summary.click()
    expect(details.open).toBe(true)

    const route = root.querySelector('[data-map-overlay-region="route"]')!
    const menu = root.querySelector('.map-command-more__menu')!
    setRect(route, [598.0742, 694.2031, 243.8516, 48])
    setRect(menu, [840, 722, 220, 114])
    expect(positiveIntersections([route, menu])).toEqual(['route:command-menu'])

    summary.click()
    expect(details.open).toBe(false)
  })
})
