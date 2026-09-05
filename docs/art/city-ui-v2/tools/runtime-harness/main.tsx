import { GAME_SETUP, buildContentCatalog } from '@aop/content'
import { createGame, type GameConfig } from '@aop/engine'
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { CityScreen } from '../../../../../apps/web/src/CityScreen'
import { ThemeProvider } from '../../../../../apps/web/src/theme/ThemeContext'
import '../../../../../apps/web/src/styles.css'
import fixtures from './fixtures.json'

type FixtureStateId = keyof typeof fixtures.states

const config: GameConfig = {
  seed: 612,
  mapSize: 'small',
  setup: GAME_SETUP,
  content: buildContentCatalog(),
  players: [
    {
      id: 'player-0',
      name: 'You',
      faction: 'pirates',
      isAI: false,
      startingTroops: [{ unitId: 'deckhand', count: 6 }],
    },
    { id: 'player-1', name: 'Morgan', faction: 'british', isAI: true },
  ],
}

const captureId = new URLSearchParams(window.location.search).get('capture')
const capture = fixtures.captures.find((candidate) => candidate.id === captureId)

function EvidenceDiagnostics({
  requiredVisibleText,
  requireNoSemanticTextOverflow,
}: {
  requiredVisibleText: readonly string[]
  requireNoSemanticTextOverflow: boolean
}) {
  useEffect(() => {
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const root = document.querySelector<HTMLElement>('[data-evidence-fixture]')
        const semanticElements = [
          ...(root?.querySelectorAll<HTMLElement>(
            '.city-overlay__identity h1, .city-status-card, .city-status-card__label, .city-status-card strong, .city-status-card > span:not(.city-status-card__label)',
          ) ?? []),
        ]
        const normalise = (value: string) => value.replace(/\s+/g, ' ').trim()
        const tolerance = 1
        const escapes = (inner: DOMRect, outer: DOMRect) =>
          inner.left < outer.left - tolerance ||
          inner.top < outer.top - tolerance ||
          inner.right > outer.right + tolerance ||
          inner.bottom > outer.bottom + tolerance
        const clipped = (element: HTMLElement) => {
          const bounds = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          const viewport = new DOMRect(0, 0, window.innerWidth, window.innerHeight)
          const statusCard = element.closest<HTMLElement>('.city-status-card')
          const escapesStatusCard =
            statusCard !== null &&
            statusCard !== element &&
            escapes(bounds, statusCard.getBoundingClientRect())
          const clipsOverflow =
            ['hidden', 'clip'].includes(style.overflowX) ||
            ['hidden', 'clip'].includes(style.overflowY) ||
            style.textOverflow === 'ellipsis' ||
            style.whiteSpace === 'nowrap'
          const meaningfulOwnOverflow =
            element.scrollWidth - element.clientWidth > tolerance ||
            element.scrollHeight - element.clientHeight > tolerance
          return (
            style.visibility === 'hidden' ||
            style.display === 'none' ||
            bounds.width === 0 ||
            bounds.height === 0 ||
            escapes(bounds, viewport) ||
            escapesStatusCard ||
            (clipsOverflow && meaningfulOwnOverflow)
          )
        }
        const missingOrClippedText = requiredVisibleText.filter(
          (text) =>
            !semanticElements.some(
              (element) => normalise(element.textContent ?? '') === text && !clipped(element),
            ),
        )
        const overflow = semanticElements.filter(clipped)

        document.documentElement.dataset.evidenceRequiredVisibleText =
          requiredVisibleText.join(' | ') || 'none'
        document.documentElement.dataset.evidenceRequiredTextState =
          missingOrClippedText.length === 0
            ? 'visible'
            : `missing-or-clipped: ${missingOrClippedText.join(' | ')}`
        document.documentElement.dataset.evidenceSemanticTextOverflow =
          requireNoSemanticTextOverflow && overflow.length > 0 ? 'detected' : 'none'
      })
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [requiredVisibleText, requireNoSemanticTextOverflow])

  return null
}

function Fixture() {
  if (!capture) {
    return (
      <main style={{ padding: 24 }}>
        <h1>City evidence harness</h1>
        <p>Choose a declared capture id with the capture query parameter.</p>
        <ul>
          {fixtures.captures.map((candidate) => (
            <li key={candidate.id}>
              <a href={`/?capture=${candidate.id}`}>{candidate.id}</a>
            </li>
          ))}
        </ul>
      </main>
    )
  }

  const stateId = capture.state as FixtureStateId
  const captureRequirements = capture as typeof capture & {
    requiredVisibleText?: readonly string[]
    requireNoSemanticTextOverflow?: boolean
  }
  const fixture = fixtures.states[stateId]
  const game = createGame(config)
  const player = game.players.find((candidate) => candidate.id === 'player-0')!
  const startingCity = game.cities.find((candidate) => candidate.ownerId === player.id)!
  const startingCaptain = game.captains.find((candidate) => candidate.ownerId === player.id)!
  const city = {
    ...startingCity,
    buildings: [...fixture.buildings],
    builtThisRound: false,
    unitAvailability: { ...fixture.unitAvailability },
  }
  const captain = {
    ...startingCaptain,
    troops: [{ unitId: 'deckhand', count: 6 }],
  }

  document.documentElement.dataset.evidenceCapture = capture.id
  document.documentElement.dataset.evidenceSourceHead = fixtures.targetSourceHead
  document.documentElement.dataset.evidenceState = stateId
  document.documentElement.dataset.evidenceRound = String(fixture.round)
  document.documentElement.dataset.evidenceBuildingCount = String(city.buildings.length)
  document.documentElement.dataset.evidenceExpectedZoom = String(capture.zoom)
  document.documentElement.dataset.evidenceExpectedPanel = capture.panel ?? 'none'
  document.documentElement.dataset.evidenceExpectedFocus = capture.focus ?? 'none'
  document.title = `${capture.id} · ${fixtures.targetSourceHead.slice(0, 8)}`

  return (
    <ThemeProvider>
      <div className="app" data-evidence-fixture={capture.id}>
        <EvidenceDiagnostics
          requiredVisibleText={captureRequirements.requiredVisibleText ?? []}
          requireNoSemanticTextOverflow={captureRequirements.requireNoSemanticTextOverflow ?? false}
        />
        <CityScreen
          city={city}
          captain={captain}
          captains={[captain]}
          parties={[]}
          faction="pirates"
          resources={{ ...fixture.resources }}
          setup={game.config.setup}
          round={fixture.round}
          playerName={(id) => game.players.find((candidate) => candidate.id === id)?.name ?? id}
          playerItemStash={[]}
          portDefenderCount={1}
          cities={[city]}
          onClose={() => undefined}
          onBuild={() => undefined}
          onRecruit={() => undefined}
          onTransfer={() => undefined}
          onSetStandingOrders={() => undefined}
          onSetBoardOrders={() => undefined}
          onChooseCaptainSkill={() => undefined}
          onChooseCaptainStat={() => undefined}
          onUpgradeShip={() => undefined}
          onRecruitCaptain={() => undefined}
          onRansomCaptain={() => undefined}
          onGarrisonCaptain={() => undefined}
          onUngarrisonCaptain={() => undefined}
          onTakeItem={() => undefined}
          onDepositItem={() => undefined}
        />
      </div>
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Fixture />)
