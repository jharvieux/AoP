import { FACTIONS, buildingDisplayName } from '@aop/content'
import type {
  BoardOrder,
  Captain,
  CaptainStat,
  CityState,
  GameSetup,
  LandingParty,
  StandingOrder,
} from '@aop/engine'
import type { FactionId, ResourcePool } from '@aop/shared'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { captainAshoreState } from './captainAshore'
import { tapFeedback } from './audio/feedback'
import { CityScene } from './CityScene'
import { CityBuildingModal, playerFacingName } from './cityModals'
import { ResourceHud } from './ResourceHud'
import { useTheme } from './theme/ThemeContext'
import { UiIcon } from './uiIcons'

interface CityScreenProps {
  city: CityState
  captain: Captain | undefined
  /** Every captain the viewer owns (#114), so the tavern's fleet list can be
   * broken out one row per captain instead of a single faction-wide blob. */
  captains: Captain[]
  /** The viewer's own landing parties (#498) — see {@link captainAshoreState}. */
  parties: LandingParty[]
  faction: FactionId
  resources: ResourcePool
  /** Balance knobs for the recruit/ransom-captain cost formulas (#308/#309). */
  setup: GameSetup
  /** Current match round, to tell a captive that's past `captivityReturnRound` from one that isn't. */
  round: number
  /** Resolves a seat id to a display name, for "captured by …" (matches BattleBoardSheet's convention). */
  playerName: (id: string) => string
  /** The faction item stash (#498) — take-item source for a docked captain. */
  playerItemStash: string[]
  /** Own captains currently contributing "ships in port" defense to this city (#498). */
  portDefenderCount: number
  /** All of the viewer's owned cities, in roster order — powers the left/right
   * city-cycling arrows (#429). Omit (or pass one) to hide the arrows. */
  cities?: CityState[]
  onSelectCity?: (cityId: string) => void
  onClose: () => void
  onBuild: (buildingId: string) => void
  onRecruit: (unitId: string) => void
  onTransfer: (direction: 'toShip' | 'toGarrison', unitId: string) => void
  onSetStandingOrders: (orders: StandingOrder[]) => void
  onSetBoardOrders: (orders: BoardOrder[]) => void
  onChooseCaptainSkill: (skillId: string) => void
  onChooseCaptainStat: (stat: CaptainStat) => void
  onUpgradeShip: (track: string) => void
  /** Omit `captainId` to mint a brand-new captain; pass an eligible captive's id to rehire it instead. */
  onRecruitCaptain: (captainId?: string) => void
  onRansomCaptain: (captainId: string) => void
  /** Station the docked captain as this city's garrison (#498). */
  onGarrisonCaptain: () => void
  /** Release this city's garrisoned captain back to sea duty (#498). */
  onUngarrisonCaptain: () => void
  /** Move an item from the faction stash onto the docked captain (#498). */
  onTakeItem: (itemId: string) => void
  /** Move an item from the docked captain into the faction stash (#498). */
  onDepositItem: (itemId: string) => void
}

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  '[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const NATIVE_BACK_EVENT = 'aop:native-back'

/**
 * Graphical city screen (#429): the constructed buildings drawn as a scene,
 * each one a tap target opening its management modal (construction at the
 * town hall, recruiting at troop buildings, refits at the shipyard, captain
 * management at the tavern). Left/right arrows cycle the player's owned
 * cities without returning to the map.
 */
export function CityScreen(props: CityScreenProps) {
  const {
    city,
    captain,
    captains,
    parties,
    faction,
    cities,
    onSelectCity,
    onClose,
    portDefenderCount,
    onGarrisonCaptain,
    onUngarrisonCaptain,
  } = props
  const { factionName } = useTheme()
  const [openBuildingId, setOpenBuildingId] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const buildingTriggerRef = useRef<HTMLButtonElement | null>(null)
  const titleId = useId()
  const garrisonHintId = useId()

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const siblings: HTMLElement[] = []
    let branch: HTMLElement = overlay
    while (branch.parentElement) {
      const parent = branch.parentElement
      siblings.push(
        ...[...parent.children].filter(
          (element): element is HTMLElement => element instanceof HTMLElement && element !== branch,
        ),
      )
      if (parent === document.body) break
      branch = parent
    }
    const previousSiblings = siblings.map((element) => ({
      element,
      inert: element.hasAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden'),
    }))
    const previousOverflow = document.body.style.overflow

    for (const element of siblings) {
      element.setAttribute('inert', '')
      element.setAttribute('aria-hidden', 'true')
    }
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    return () => {
      for (const state of previousSiblings) {
        if (!state.inert) state.element.removeAttribute('inert')
        if (state.ariaHidden === null) state.element.removeAttribute('aria-hidden')
        else state.element.setAttribute('aria-hidden', state.ariaHidden)
      }
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  // A selection cannot carry between cities: the next city may not contain it.
  useEffect(() => {
    setOpenBuildingId(null)
    buildingTriggerRef.current = null
  }, [city.id])

  useEffect(() => {
    if (!openBuildingId) return
    overlayRef.current?.querySelector<HTMLButtonElement>('[data-city-detail-close]')?.focus()
  }, [openBuildingId])

  function openBuilding(buildingId: string) {
    tapFeedback()
    buildingTriggerRef.current =
      [
        ...(overlayRef.current?.querySelectorAll<HTMLButtonElement>('[data-building-id]') ?? []),
      ].find((button) => button.dataset.buildingId === buildingId) ?? null
    setOpenBuildingId(buildingId)
  }

  const closeBuilding = useCallback(() => {
    setOpenBuildingId(null)
    queueMicrotask(() => {
      if (buildingTriggerRef.current?.isConnected) buildingTriggerRef.current.focus()
    })
  }, [])

  const dismissTopLayer = useCallback(() => {
    if (openBuildingId) closeBuilding()
    else onClose()
  }, [closeBuilding, onClose, openBuildingId])

  useEffect(() => {
    function handleNativeBack(event: Event) {
      event.preventDefault()
      dismissTopLayer()
    }
    window.addEventListener(NATIVE_BACK_EVENT, handleNativeBack)
    return () => window.removeEventListener(NATIVE_BACK_EVENT, handleNativeBack)
  }, [dismissTopLayer])

  const canCycle = !!onSelectCity && !!cities && cities.length > 1
  const cityIndex = cities?.findIndex((candidate) => candidate.id === city.id) ?? -1
  function cycleCity(delta: number) {
    if (!canCycle || cityIndex < 0) return
    const next = cities[(cityIndex + delta + cities.length) % cities.length]
    if (next && next.id !== city.id) {
      tapFeedback()
      onSelectCity(next.id)
    }
  }

  const garrisoned = city.garrisonCaptainId
    ? captains.find((candidate) => candidate.id === city.garrisonCaptainId)
    : undefined
  const dockedAshore = captain ? captainAshoreState(captain, parties) : null
  const canGarrison = !!captain && !dockedAshore && city.garrisonCaptainId === undefined
  const selectedName = openBuildingId
    ? buildingDisplayName(openBuildingId, faction)
    : 'Harbor command'

  return (
    <div
      ref={overlayRef}
      className="city-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-city-overlay
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          dismissTopLayer()
          return
        }
        if (event.key !== 'Tab') return
        const focusable = [
          ...(overlayRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []),
        ]
        if (focusable.length === 0) return
        const first = focusable[0]!
        const last = focusable[focusable.length - 1]!
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }}
    >
      <div className="city-overlay__shell">
        <header className="city-overlay__header">
          <div className="city-overlay__identity">
            <span
              className="city-overlay__faction-mark"
              style={{ backgroundColor: FACTIONS[faction].primaryColor }}
              aria-hidden
            />
            <div>
              <h1 id={titleId}>{playerFacingName(city.name)}</h1>
              <span>{factionName(faction, FACTIONS[faction].name)} harbor</span>
            </div>
          </div>

          <ResourceHud resources={props.resources} />

          <div className="city-overlay__navigation" role="group" aria-label="City navigation">
            {canCycle && (
              <>
                <button
                  type="button"
                  className="city-scene-nav"
                  aria-label="Previous city"
                  onClick={() => cycleCity(-1)}
                >
                  <UiIcon name="previous" />
                </button>
                <span aria-live="polite">
                  {cityIndex + 1}/{cities.length}
                </span>
                <button
                  type="button"
                  className="city-scene-nav"
                  aria-label="Next city"
                  onClick={() => cycleCity(1)}
                >
                  <UiIcon name="next" />
                </button>
              </>
            )}
            <button
              ref={closeRef}
              type="button"
              className="city-overlay__close"
              aria-label="Return to world map"
              onClick={onClose}
            >
              <UiIcon name="close" />
            </button>
          </div>
        </header>

        <main className="city-overlay__body">
          <section className="city-overlay__scene-column" aria-label="City location">
            <CityScene
              key={city.id}
              buildings={city.buildings}
              faction={faction}
              selectedBuildingId={openBuildingId}
              onOpenBuilding={openBuilding}
            />
            <div className="city-status-strip" aria-label="Harbor status">
              <div className="city-status-card">
                <span className="city-status-card__label">Captain</span>
                <strong>{captain ? playerFacingName(captain.name) : 'None docked'}</strong>
                <span id={garrisonHintId}>
                  {!captain
                    ? 'Dock a captain to manage ships'
                    : dockedAshore
                      ? 'Ashore with a landing party'
                      : 'Available in harbor'}
                </span>
              </div>
              <div className="city-status-card">
                <span className="city-status-card__label">Defense</span>
                <strong>
                  {garrisoned ? playerFacingName(garrisoned.name) : 'No garrison captain'}
                </strong>
                <span>
                  {portDefenderCount} ship{portDefenderCount === 1 ? '' : 's'} in port
                </span>
              </div>
              <div className="city-status-card city-status-card--action">
                {garrisoned ? (
                  <button
                    type="button"
                    onClick={() => {
                      tapFeedback()
                      onUngarrisonCaptain()
                    }}
                  >
                    Ungarrison
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canGarrison}
                    aria-describedby={!canGarrison ? garrisonHintId : undefined}
                    title={
                      !captain
                        ? 'Dock a captain to garrison this city.'
                        : dockedAshore
                          ? 'A captain ashore cannot be garrisoned.'
                          : undefined
                    }
                    onClick={() => {
                      tapFeedback()
                      onGarrisonCaptain()
                    }}
                  >
                    Garrison
                  </button>
                )}
              </div>
            </div>
          </section>

          <aside
            className={`city-inspector${openBuildingId ? ' city-inspector--open' : ''}`}
            aria-label={selectedName}
          >
            {openBuildingId ? (
              <CityBuildingModal {...props} buildingId={openBuildingId} onClose={closeBuilding} />
            ) : (
              <div className="city-inspector__empty">
                <UiIcon name="city" size={28} />
                <h2>Harbor command</h2>
                <p>
                  Select a constructed building to manage it. New construction begins at the{' '}
                  {buildingDisplayName('townhall', faction)}.
                </p>
              </div>
            )}
          </aside>
        </main>
      </div>
    </div>
  )
}
