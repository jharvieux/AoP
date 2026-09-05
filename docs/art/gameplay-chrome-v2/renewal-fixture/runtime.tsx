import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { presentationBand } from '../../../../apps/web/src/mapPresentation'
import { GameScreen } from '../../../../apps/web/src/screens/GameScreen'
import { ThemeProvider } from '../../../../apps/web/src/theme/ThemeContext'
import '../../../../apps/web/src/styles.css'
import {
  SOURCE_HEAD,
  SOURCE_TREE,
  TERRAIN_SEED,
  fullCityGame,
  terrainAndWorldGame,
} from './fixtureData'

type Scene = 'chrome-world' | 'chrome-city' | 'terrain'

type EvidenceApi = {
  readonly sourceHead: string
  readonly sourceTree: string
  readonly scene: Scene
  readonly fixture: Readonly<Record<string, unknown>>
  measure(): Record<string, unknown>
}

declare global {
  interface Window {
    __AOP_CROSS_EVIDENCE__: EvidenceApi
  }
}

function rectangle(selector: string): [number, number, number, number] | null {
  const element = document.querySelector<HTMLElement>(selector)
  return element ? elementRectangle(element) : null
}

function elementRectangle(element: Element): [number, number, number, number] {
  const value = element.getBoundingClientRect()
  return [value.x, value.y, value.width, value.height].map(
    (part) => Math.round(part * 10_000) / 10_000,
  ) as [number, number, number, number]
}

function intersectionArea(first: DOMRect, second: DOMRect): number {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
  const height = Math.max(
    0,
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top),
  )
  return Math.round(width * height * 10_000) / 10_000
}

function collisionLabel(element: Element): string {
  if (element.matches('.map-container')) return 'map'
  return (
    element.getAttribute('data-map-overlay-region') ??
    element.getAttribute('aria-label') ??
    element.textContent?.replace(/\s+/g, ' ').trim() ??
    element.tagName.toLowerCase()
  )
}

function moreGeometry() {
  const details = document.querySelector<HTMLDetailsElement>('.map-command-more')
  const toggle = details?.querySelector<HTMLElement>('.map-command-more__toggle')
  const menu = details?.querySelector<HTMLElement>('.map-command-more__menu')
  const dock = document.querySelector<HTMLElement>('.gameplay-command-dock')
  if (!details || !toggle || !menu || !dock) return null

  const actions = [...menu.querySelectorAll<HTMLButtonElement>('button')]
  const state = !details.open
    ? 'closed'
    : actions.some((action) => action.textContent?.trim() === 'Confirm Resign')
      ? 'confirm'
      : 'open'
  const menuBox = menu.getBoundingClientRect()
  const collisionCandidates = [
    ...document.querySelectorAll<HTMLElement>(
      '.map-container, [data-map-overlay-region], .selection-info, .idle-city-hint, .map-command-layout > button, .map-command-more__toggle',
    ),
  ]
  const positiveIntersections = details.open
    ? collisionCandidates
        .map((candidate) => ({
          with: collisionLabel(candidate),
          area: intersectionArea(menuBox, candidate.getBoundingClientRect()),
        }))
        .filter(({ area }) => area > 0)
    : []
  const dockBox = dock.getBoundingClientRect()
  return {
    state,
    open: details.open,
    details: elementRectangle(details),
    toggle: elementRectangle(toggle),
    menu: elementRectangle(menu),
    actions: actions.map((action) => ({
      label: action.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      disabled: action.disabled,
      rect: elementRectangle(action),
    })),
    positive_intersections: positiveIntersections,
    menu_within_viewport:
      !details.open ||
      (menuBox.left >= 0 &&
        menuBox.top >= 0 &&
        menuBox.right <= window.innerWidth &&
        menuBox.bottom <= window.innerHeight),
    menu_within_command_dock:
      !details.open ||
      (menuBox.left >= dockBox.left &&
        menuBox.top >= dockBox.top &&
        menuBox.right <= dockBox.right &&
        menuBox.bottom <= dockBox.bottom),
  }
}

function directTargetMinimum(): { minimum: number | null; undersized: string[] } {
  const visible = [...document.querySelectorAll<HTMLElement>('button, summary, [tabindex="0"]')]
    .filter((element) => {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return (
        style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
      )
    })
    .map((element) => ({
      label:
        element.getAttribute('aria-label') ??
        element.textContent?.replace(/\s+/g, ' ').trim() ??
        '',
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    }))
  const sizes = visible.map(({ width, height }) => Math.min(width, height))
  return {
    minimum: sizes.length ? Math.round(Math.min(...sizes) * 10_000) / 10_000 : null,
    undersized: visible
      .filter(({ width, height }) => width < 44 || height < 44)
      .map(({ label, width, height }) => `${label}: ${width.toFixed(2)}x${height.toFixed(2)}`),
  }
}

function cameraMeasurement() {
  const map = document.querySelector<HTMLElement>('.map-container')
  const viewport = document.querySelector<HTMLElement>('.map-minimap__viewport')
  if (!map || !viewport) return null
  const widthPercent = Number.parseFloat(viewport.style.width)
  if (!Number.isFinite(widthPercent) || widthPercent <= 0) return null
  const scale = map.clientWidth / ((widthPercent / 100) * 32 * 96)
  const tilePixels = scale * 32
  return {
    scale: Math.round(scale * 1_000_000) / 1_000_000,
    tile_pixels: Math.round(tilePixels * 1_000_000) / 1_000_000,
    nominal_band: presentationBand(tilePixels),
    minimap_viewport_percent: {
      left: Number.parseFloat(viewport.style.left),
      top: Number.parseFloat(viewport.style.top),
      width: widthPercent,
      height: Number.parseFloat(viewport.style.height),
    },
  }
}

function measure() {
  const targets = directTargetMinimum()
  const images = [...document.images]
  return {
    source_head: SOURCE_HEAD,
    source_tree: SOURCE_TREE,
    scene,
    viewport: [window.innerWidth, window.innerHeight],
    device_pixel_ratio: window.devicePixelRatio,
    document: {
      client: [document.documentElement.clientWidth, document.documentElement.clientHeight],
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    },
    fonts_status: document.fonts.status,
    busy: Boolean(document.querySelector('[aria-busy="true"]')),
    images: {
      count: images.length,
      incomplete: images.filter((image) => !image.complete || image.naturalWidth === 0).length,
    },
    map_error: Boolean(document.querySelector('.map-canvas-error')),
    map: rectangle('.map-container'),
    hud: rectangle('.gameplay-hud'),
    command_dock: rectangle('.gameplay-command-dock'),
    navigation: rectangle('[data-map-overlay-region="navigation"]'),
    minimap: rectangle('[data-map-overlay-region="minimap"]'),
    city_overlay: rectangle('[data-city-overlay]'),
    city_scene: rectangle('.city-scene-frame'),
    city_inspector: rectangle('.city-inspector'),
    open_building: document.querySelector<HTMLElement>('[data-building-id][aria-pressed="true"]')
      ?.dataset.buildingId,
    focused_label:
      document.activeElement?.getAttribute('aria-label') ??
      document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() ??
      null,
    target_minimum: targets.minimum,
    undersized_targets: targets.undersized,
    camera: cameraMeasurement(),
    more: moreGeometry(),
  }
}

const requested = new URLSearchParams(window.location.search).get('scene')
const scene: Scene =
  requested === 'chrome-city' || requested === 'terrain' ? requested : 'chrome-world'
const game = scene === 'chrome-city' ? fullCityGame() : terrainAndWorldGame()

document.documentElement.dataset.evidenceSourceHead = SOURCE_HEAD
document.documentElement.dataset.evidenceSourceTree = SOURCE_TREE
document.documentElement.dataset.evidenceScene = scene

window.__AOP_CROSS_EVIDENCE__ = {
  sourceHead: SOURCE_HEAD,
  sourceTree: SOURCE_TREE,
  scene,
  fixture:
    scene === 'chrome-city'
      ? { state: 'full-city', round: 54, buildings: 14, faction: 'pirates' }
      : {
          state: 'untouched-round-1-xlarge',
          seed: TERRAIN_SEED,
          dimensions: [96, 96],
          topology: 'square',
          seats: 5,
          faction: 'pirates',
        },
  measure,
}

const rootElement = document.getElementById('root')!
createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <GameScreen
        game={game}
        battleReport={null}
        onDismissBattleReport={() => undefined}
        itemFound={null}
        onAction={() => undefined}
        onSaveSlot={async () => undefined}
        onLoadSlot={async () => undefined}
        onWatchSlot={() => undefined}
        autosaveFailing={false}
      />
    </ThemeProvider>
  </StrictMode>,
)

const evidenceOutput = document.createElement('output')
evidenceOutput.id = 'aop-cross-evidence-measurement'
evidenceOutput.hidden = true
document.body.append(evidenceOutput)

let measurementPending = false
function publishMeasurement() {
  measurementPending = false
  evidenceOutput.textContent = JSON.stringify(measure())
}
function scheduleMeasurement() {
  if (measurementPending) return
  measurementPending = true
  requestAnimationFrame(publishMeasurement)
}

new MutationObserver(scheduleMeasurement).observe(rootElement, {
  attributes: true,
  childList: true,
  subtree: true,
})
window.addEventListener('resize', scheduleMeasurement)
document.fonts.ready.then(scheduleMeasurement)
scheduleMeasurement()
