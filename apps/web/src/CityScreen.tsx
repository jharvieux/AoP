import { buildingDisplayName } from '@aop/content'
import type { BoardOrder, Captain, CityState, GameSetup, StandingOrder } from '@aop/engine'
import type { FactionId, ResourcePool } from '@aop/shared'
import { useEffect, useState } from 'react'
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
  faction: FactionId
  resources: ResourcePool
  /** Balance knobs for the recruit/ransom-captain cost formulas (#308/#309). */
  setup: GameSetup
  /** Current match round, to tell a captive that's past `captivityReturnRound` from one that isn't. */
  round: number
  /** Resolves a seat id to a display name, for "captured by …" (matches BattleBoardSheet's convention). */
  playerName: (id: string) => string
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
  onUpgradeShip: (track: string) => void
  /** Omit `captainId` to mint a brand-new captain; pass an eligible captive's id to rehire it instead. */
  onRecruitCaptain: (captainId?: string) => void
  onRansomCaptain: (captainId: string) => void
}

/**
 * Graphical city screen (#429): the constructed buildings drawn as a scene,
 * each one a tap target opening its management modal (construction at the
 * town hall, recruiting at troop buildings, refits at the shipyard, captain
 * management at the tavern). Left/right arrows cycle the player's owned
 * cities without returning to the map.
 */
export function CityScreen(props: CityScreenProps) {
  const { city, captain, faction, cities, onSelectCity, onClose } = props
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
