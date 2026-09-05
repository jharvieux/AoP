import {
  StrictMode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from 'react'
import { createRoot } from 'react-dom/client'
import type { Coord } from '@aop/shared'
import { MapCanvas } from '../../../../../apps/web/src/MapCanvas'
import { MAP_CAMERA_PADDING_PX, fitMapCamera } from '../../../../../apps/web/src/mapCamera'
import { cellCenter } from '../../../../../apps/web/src/mapLayout'
import { ThemeProvider } from '../../../../../apps/web/src/theme/ThemeContext'
import '../../../../../apps/web/src/styles.css'
import './styles.css'
import {
  ALL_MAP_KEYS,
  COURSE_STEP_COUNT,
  COURSE_TARGET,
  FIXTURE_VERSION,
  MAP,
  SELECTED_CAPTAIN,
  SOURCE_HEAD,
  SOURCE_TREE,
  TILE_SIZE,
  VIEWER_ID,
} from './fixtureData'

const TARGET_LABEL = 'Known course target at column 10, row 8'
const FIT_SETTLE_MS = 450

interface TargetPlacement {
  x: number
  y: number
  normalizedX: number
  normalizedY: number
  scale: number
}

interface RectMeasurement {
  x: number
  y: number
  width: number
  height: number
  top: number
  right: number
  bottom: number
  left: number
}

interface TouchRecordingMeasurement {
  source_head: string
  source_tree: string
  fixture_version: string
  map_busy: boolean
  canvas_rect: RectMeasurement | null
  target_rect: RectMeasurement | null
  target_cell: Coord
  target_normalized: [number, number] | null
  course_steps: number
  captain_movement_points: number
  target_empty: true
  fit_target_ready: boolean
  preview_hint: string | null
  queued_confirmation: string | null
  unexpected_tile_action: string | null
}

declare global {
  interface Window {
    __AOP_TOUCH_RECORDING__: {
      readonly sourceHead: string
      readonly sourceTree: string
      readonly fixtureVersion: string
      readonly measure: () => TouchRecordingMeasurement
    }
  }
}

function rectJson(element: Element | null): RectMeasurement | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
  }
}

function computeFitPlacement(container: HTMLElement): TargetPlacement | null {
  const width = container.clientWidth
  const height = container.clientHeight
  if (width <= 0 || height <= 0) return null
  const camera = fitMapCamera({
    topology: 'square',
    mapWidth: MAP.width,
    mapHeight: MAP.height,
    tileSize: TILE_SIZE,
    viewportWidth: width,
    viewportHeight: height,
    padding: MAP_CAMERA_PADDING_PX,
    minimumScale: 0.4,
    absoluteMinimumScale: 0.08,
    maximumScale: 3,
  })
  const center = cellCenter('square', COURSE_TARGET.x, COURSE_TARGET.y, TILE_SIZE)
  const x = camera.x + center.x * camera.scale
  const y = camera.y + center.y * camera.scale
  return {
    x,
    y,
    normalizedX: x / width,
    normalizedY: y / height,
    scale: camera.scale,
  }
}

function useFitPlacement(containerRef: RefObject<HTMLDivElement | null>) {
  const [placement, setPlacement] = useState<TargetPlacement | null>(null)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => setPlacement(computeFitPlacement(container))
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(container)
    return () => observer?.disconnect()
  }, [containerRef])
  return placement
}

function TouchRecordingHarness() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const fitTimerRef = useRef<number | null>(null)
  const [fitTargetReady, setFitTargetReady] = useState(false)
  const [queuedCourse, setQueuedCourse] = useState<Coord | null>(null)
  const [unexpectedTile, setUnexpectedTile] = useState<Coord | null>(null)
  const placement = useFitPlacement(mapContainerRef)

  const queuedText = queuedCourse
    ? `Queued course confirmed — column ${queuedCourse.x + 1}, row ${queuedCourse.y + 1}`
    : null
  const unexpectedText = unexpectedTile
    ? `Unexpected one-tap map action — column ${unexpectedTile.x + 1}, row ${unexpectedTile.y + 1}`
    : null

  function observeFitClick(event: MouseEvent<HTMLDivElement>) {
    const element = event.target instanceof Element ? event.target : null
    if (!element?.closest('button[aria-label="Fit to map"]')) return
    setFitTargetReady(false)
    setQueuedCourse(null)
    setUnexpectedTile(null)
    if (fitTimerRef.current !== null) window.clearTimeout(fitTimerRef.current)
    fitTimerRef.current = window.setTimeout(() => {
      fitTimerRef.current = null
      setFitTargetReady(true)
    }, FIT_SETTLE_MS)
  }

  useEffect(
    () => () => {
      if (fitTimerRef.current !== null) window.clearTimeout(fitTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    window.__AOP_TOUCH_RECORDING__ = Object.freeze({
      sourceHead: SOURCE_HEAD,
      sourceTree: SOURCE_TREE,
      fixtureVersion: FIXTURE_VERSION,
      measure: (): TouchRecordingMeasurement => {
        const canvas = document.querySelector('.map-canvas-root canvas')
        const target = document.querySelector('[data-touch-course-target]')
        const preview = document.querySelector<HTMLElement>('.map-course-hint')
        const confirmation = document.querySelector<HTMLElement>('[data-queued-course]')
        const unexpected = document.querySelector<HTMLElement>('[data-unexpected-tile]')
        return {
          source_head: SOURCE_HEAD,
          source_tree: SOURCE_TREE,
          fixture_version: FIXTURE_VERSION,
          map_busy:
            document.querySelector('.map-canvas-root')?.getAttribute('aria-busy') !== 'false',
          canvas_rect: rectJson(canvas),
          target_rect: rectJson(target),
          target_cell: { ...COURSE_TARGET },
          target_normalized: placement ? [placement.normalizedX, placement.normalizedY] : null,
          course_steps: COURSE_STEP_COUNT,
          captain_movement_points: SELECTED_CAPTAIN.movementPoints,
          target_empty: true,
          fit_target_ready: fitTargetReady,
          preview_hint: preview?.textContent?.trim() ?? null,
          queued_confirmation: confirmation?.textContent?.trim() ?? null,
          unexpected_tile_action: unexpected?.textContent?.trim() ?? null,
        }
      },
    })
  }, [fitTargetReady, placement])

  const statusText =
    unexpectedText ??
    queuedText ??
    (fitTargetReady
      ? 'Exact target armed — tap the reticle twice'
      : 'Harness ready — use Fit to arm the exact target')

  return (
    <main
      className="touch-recording-app"
      data-source-head={SOURCE_HEAD}
      data-source-tree={SOURCE_TREE}
      data-fixture-version={FIXTURE_VERSION}
      onClickCapture={observeFitClick}
    >
      <div className="touch-recording-observation" aria-live="polite">
        <span className="touch-recording-observation__eyebrow">#613 touch observation</span>
        <span
          className="touch-recording-observation__state"
          role="status"
          data-queued-course={queuedCourse ? `${queuedCourse.x},${queuedCourse.y}` : undefined}
          data-unexpected-tile={
            unexpectedTile ? `${unexpectedTile.x},${unexpectedTile.y}` : undefined
          }
        >
          {statusText}
        </span>
      </div>

      <div ref={mapContainerRef} className="map-container touch-recording-map">
        <MapCanvas
          map={MAP}
          captains={[SELECTED_CAPTAIN]}
          cities={[]}
          encounters={[]}
          parties={[]}
          landSites={[]}
          landEncounters={[]}
          viewerId={VIEWER_ID}
          visibleKeys={ALL_MAP_KEYS}
          exploredKeys={ALL_MAP_KEYS}
          selectedCaptainId={SELECTED_CAPTAIN.id}
          selectedPartyId={null}
          onTileClick={(x, y) => setUnexpectedTile({ x, y })}
          onSetCourse={(cell) => {
            if (cell.x !== COURSE_TARGET.x || cell.y !== COURSE_TARGET.y) {
              setQueuedCourse(null)
              setUnexpectedTile({ ...cell })
              return
            }
            setUnexpectedTile(null)
            setQueuedCourse({ ...cell })
          }}
          rangeOverlay={{ green: [], red: [], yellow: [] }}
          factionOf={(ownerId) => {
            if (ownerId !== VIEWER_ID) throw new Error(`unknown touch-fixture owner: ${ownerId}`)
            return 'pirates'
          }}
        />

        {fitTargetReady && placement && (
          <div
            className="touch-recording-target"
            role="button"
            aria-label={TARGET_LABEL}
            data-touch-course-target={`${COURSE_TARGET.x},${COURSE_TARGET.y}`}
            data-canvas-normalized-x={placement.normalizedX.toFixed(8)}
            data-canvas-normalized-y={placement.normalizedY.toFixed(8)}
            data-fit-scale={placement.scale.toFixed(8)}
            style={{ left: placement.x, top: placement.y }}
          >
            <span aria-hidden="true">Target 10,8</span>
          </div>
        )}
      </div>
    </main>
  )
}

document.documentElement.dataset.evidenceSourceHead = SOURCE_HEAD
document.documentElement.dataset.evidenceSourceTree = SOURCE_TREE
document.documentElement.dataset.evidenceFixtureVersion = FIXTURE_VERSION

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TouchRecordingHarness />
    </ThemeProvider>
  </StrictMode>,
)
