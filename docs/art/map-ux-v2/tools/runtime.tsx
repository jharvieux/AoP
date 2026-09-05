import * as React from 'react'
import { StrictMode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { GameScreen } from '../../../../apps/web/src/screens/GameScreen'
import { MatchScreen } from '../../../../apps/web/src/screens/MatchScreen'
import { ThemeProvider } from '../../../../apps/web/src/theme/ThemeContext'
import '../../../../apps/web/src/styles.css'
import { SOURCE_HEAD, singlePlayerCollisionGame } from './fixtureData'

function CollisionRouteFixture({ includeEvents }: { includeEvents: boolean }) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  useEffect(() => {
    let observer: MutationObserver | null = null
    let timeout: number | null = null
    const attach = () => {
      const next = document.querySelector<HTMLElement>('.map-container')
      if (!next) return false
      setContainer(next)
      observer?.disconnect()
      if (timeout !== null) window.clearTimeout(timeout)
      return true
    }
    if (!attach()) {
      observer = new MutationObserver(attach)
      observer.observe(document.body, { childList: true, subtree: true })
      timeout = window.setTimeout(() => observer?.disconnect(), 5000)
    }
    return () => {
      observer?.disconnect()
      if (timeout !== null) window.clearTimeout(timeout)
    }
  }, [])
  if (!container) return null
  return createPortal(
    <>
      {includeEvents && !container.querySelector('[data-map-overlay-region="events"]') && (
        <ul
          className="turn-event-feed map-overlay-region map-overlay-region--events"
          data-map-overlay-region="events"
          aria-label="Recent events"
        >
          <li>Round 2 begins</li>
          <li>Wind shifted near Nassau</li>
        </ul>
      )}
      <div
        className="map-course-hint map-overlay-region map-overlay-region--route"
        data-map-overlay-region="route"
        role="status"
        data-evidence-fixture="touch-route-hint"
      >
        Course ready · tap again to confirm
      </div>
    </>,
    container,
  )
}

function SinglePlayerFixture() {
  return (
    <ThemeProvider>
      <GameScreen
        game={singlePlayerCollisionGame()}
        battleReport={null}
        onDismissBattleReport={() => undefined}
        itemFound={{ itemId: 'fixture-item' }}
        onAction={() => undefined}
        onSaveSlot={async () => undefined}
        onLoadSlot={async () => undefined}
        onWatchSlot={() => undefined}
        autosaveFailing={false}
      />
      <CollisionRouteFixture includeEvents={false} />
    </ThemeProvider>
  )
}

function MultiplayerFixture() {
  return (
    <ThemeProvider>
      <MatchScreen matchId="match-map-alerts" onBack={() => undefined} />
      <CollisionRouteFixture includeEvents />
    </ThemeProvider>
  )
}

const mode = new URLSearchParams(window.location.search).get('mode') === 'mp' ? 'mp' : 'sp'
document.documentElement.dataset.evidenceSourceHead = SOURCE_HEAD
document.documentElement.dataset.evidenceMode = mode

createRoot(document.getElementById('root')!).render(
  <StrictMode>{mode === 'mp' ? <MultiplayerFixture /> : <SinglePlayerFixture />}</StrictMode>,
)
