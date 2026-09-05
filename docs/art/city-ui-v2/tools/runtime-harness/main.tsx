import { GAME_SETUP, buildContentCatalog } from '@aop/content'
import { createGame, type GameConfig } from '@aop/engine'
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
