import { buildingDisplayName } from '@aop/content'
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
import { useEffect, useState } from 'react'
import { captainAshoreState } from './captainAshore'
import { tapFeedback } from './audio/feedback'
import { BottomSheet } from './components/BottomSheet'
import { CityScene } from './CityScene'
import { CityBuildingModal } from './cityModals'

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
  const [openBuildingId, setOpenBuildingId] = useState<string | null>(null)

  // Cycling to another city closes any open building modal — the next city
  // may not even have that building.
  useEffect(() => {
    setOpenBuildingId(null)
  }, [city.id])

  function openBuilding(buildingId: string) {
    tapFeedback()
    setOpenBuildingId(buildingId)
  }

  const canCycle = !!onSelectCity && !!cities && cities.length > 1
  function cycleCity(delta: number) {
    if (!canCycle) return
    const index = cities.findIndex((c) => c.id === city.id)
    const next = cities[(index + delta + cities.length) % cities.length]
    if (next && next.id !== city.id) {
      tapFeedback()
      onSelectCity(next.id)
    }
  }

  return (
    <BottomSheet title={city.name} onClose={onClose}>
      <section className="city-scene-section">
        <CityScene buildings={city.buildings} faction={faction} onOpenBuilding={openBuilding} />
        {canCycle && (
          <>
            <button
              type="button"
              className="city-scene-nav city-scene-nav--left"
              aria-label="Previous city"
              onClick={() => cycleCity(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="city-scene-nav city-scene-nav--right"
              aria-label="Next city"
              onClick={() => cycleCity(1)}
            >
              ›
            </button>
          </>
        )}
      </section>
      <p className="building-option__hint">
        Tap a building to manage it — construction happens at the{' '}
        {buildingDisplayName('townhall', faction)}.
      </p>
      <p className="building-option__hint">
        {captain
          ? `${captain.name} is docked here.`
          : 'No captain docked — sail one alongside the city to load troops or refit a ship.'}
      </p>
      {(() => {
        const garrisoned = city.garrisonCaptainId
          ? captains.find((c) => c.id === city.garrisonCaptainId)
          : undefined
        const dockedAshore = captain ? captainAshoreState(captain, parties) : null
        const canGarrison = !!captain && !dockedAshore && city.garrisonCaptainId === undefined
        return (
          <div className="garrison-row">
            <span className="garrison-row__name">
              {garrisoned ? `Garrisoned: ${garrisoned.name}` : 'No garrisoned captain'}
            </span>
            <span className="garrison-row__counts">
              {portDefenderCount} ship{portDefenderCount === 1 ? '' : 's'} in port defend this city
            </span>
            <div className="garrison-row__actions">
              {garrisoned ? (
                <button
                  onClick={() => {
                    tapFeedback()
                    onUngarrisonCaptain()
                  }}
                >
                  Ungarrison
                </button>
              ) : (
                <button
                  disabled={!canGarrison}
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
        )
      })()}
      {openBuildingId && (
        <CityBuildingModal
          {...props}
          buildingId={openBuildingId}
          onClose={() => setOpenBuildingId(null)}
        />
      )}
    </BottomSheet>
  )
}
