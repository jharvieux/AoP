import {
  BUILDINGS,
  CAPTAIN_XP_THRESHOLDS,
  FACTIONS,
  SHIP_CLASSES,
  SHIP_UPGRADE_TRACKS,
  buildingDisplayName,
  skillsForFaction,
  type BuildingCategory,
  type BuildingDef,
} from '@aop/content'
import {
  availableSkillPicks,
  effectiveShipStats,
  levelForXp,
  type BoardOrder,
  type Captain,
  type CityState,
  type GameSetup,
  type StandingOrder,
} from '@aop/engine'
import type { FactionId, ResourcePool } from '@aop/shared'
import { canAfford } from '@aop/shared'
import { useState } from 'react'
import { tapFeedback } from './audio/feedback'
import { buildUnavailableReason, buildingFacts } from './cityBuildingInfo'
import { BottomSheet } from './components/BottomSheet'
import { useTheme } from './theme/ThemeContext'
import { UI_ICON } from './uiIcons'

/**
 * Per-building management modals for the graphical city view (#429–#432).
 * Tapping a building in the scene opens the modal for what that building
 * does: town hall = construction, recruitment buildings = recruiting their
 * tier, shipyard = ship refits, tavern = all captain management (operator
 * decision on #429), everything else = a description of its function.
 */

export function costLabel(cost: BuildingDef['cost']): string {
  const parts = Object.entries(cost)
    .filter(([, amount]) => amount)
    .map(([resource, amount]) => `${amount} ${resource}`)
  return parts.length > 0 ? parts.join(', ') : 'Free'
}

type ModalKind = 'build' | 'recruit' | 'shipyard' | 'tavern' | 'passive'

function modalKind(def: BuildingDef | undefined): ModalKind {
  if (!def) return 'passive'
  if (def.id === 'townhall') return 'build'
  if (def.unlocksCaptains) return 'tavern'
  if (def.category === 'recruitment' && def.unlocksTier) return 'recruit'
  if (def.unlocksShipyard) return 'shipyard'
  return 'passive'
}

/** Placeholder building graphic (no art yet, #429): category-colored block. */
function BuildingGraphic({ buildingId }: { buildingId: string }) {
  const category = BUILDINGS[buildingId]?.category ?? 'economy'
  return <span className={`building-graphic building-graphic--${category}`} aria-hidden />
}

/** Tap-to-reveal info affordance (#430) — tooltips must work on touch, so the
 * ⓘ button toggles an inline panel instead of relying on hover. */
function InfoToggle({
  label,
  expanded,
  onToggle,
}: {
  label: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="info-toggle"
      aria-label={`About ${label}`}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      i
    </button>
  )
}

/** A building's description plus its data-derived function lines (#430). */
function BuildingInfo({ def, faction }: { def: BuildingDef; faction: FactionId }) {
  const { unitName } = useTheme()
  const facts = buildingFacts(def, faction, unitName)
  return (
    <div className="building-info">
      <p>{def.description}</p>
      {facts.length > 0 && (
        <ul>
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Preset defensive plans (main's conditional standing orders, #20). */
const STANDING_ORDER_PLANS: { id: string; label: string; orders: StandingOrder[] }[] = [
  {
    id: 'aggressive',
    label: 'Aggressive (always broadside)',
    orders: [{ when: 'always', tactic: 'broadside' }],
  },
  {
    id: 'cautious',
    label: 'Cautious (evade if outgunned)',
    orders: [
      { when: 'outgunned', tactic: 'evade' },
      { when: 'always', tactic: 'broadside' },
    ],
  },
  { id: 'boarder', label: 'Boarder (always board)', orders: [{ when: 'always', tactic: 'board' }] },
]

/** Preset melee doctrines for the battle board (#39) — the boarding defence analog. */
const BOARD_ORDER_PLANS: { id: string; label: string; orders: BoardOrder[] }[] = [
  {
    id: 'hold',
    label: 'Hold the line (stand and repel)',
    orders: [{ when: 'always', doctrine: 'holdLine' }],
  },
  {
    id: 'charge',
    label: 'Charge (advance and engage)',
    orders: [{ when: 'always', doctrine: 'advance' }],
  },
  {
    id: 'defensive',
    label: 'Defensive (hold if outnumbered, else advance)',
    orders: [
      { when: 'outnumbered', doctrine: 'holdLine' },
      { when: 'always', doctrine: 'advance' },
    ],
  },
  {
    id: 'skirmish',
    label: 'Skirmish (hit and run)',
    orders: [{ when: 'always', doctrine: 'skirmish' }],
  },
]

function ordersMatch<T>(a: T[] | undefined, b: T[]): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b)
}

const UPGRADE_TRACK_LABELS: Record<string, string> = {
  hull: 'Hull',
  cannons: 'Cannons',
  speed: 'Sails',
  crewCapacity: 'Crew capacity',
}

export interface CityBuildingModalProps {
  buildingId: string
  city: CityState
  captain: Captain | undefined
  captains: Captain[]
  faction: FactionId
  resources: ResourcePool
  setup: GameSetup
  round: number
  playerName: (id: string) => string
  onClose: () => void
  onBuild: (buildingId: string) => void
  onRecruit: (unitId: string) => void
  onTransfer: (direction: 'toShip' | 'toGarrison', unitId: string) => void
  onSetStandingOrders: (orders: StandingOrder[]) => void
  onSetBoardOrders: (orders: BoardOrder[]) => void
  onChooseCaptainSkill: (skillId: string) => void
  onUpgradeShip: (track: string) => void
  onRecruitCaptain: (captainId?: string) => void
  onRansomCaptain: (captainId: string) => void
}

/** Routes a tapped building to its management modal. */
export function CityBuildingModal(props: CityBuildingModalProps) {
  const def = BUILDINGS[props.buildingId]
  switch (modalKind(def)) {
    case 'build':
      return <BuildModal {...props} />
    case 'tavern':
      return <TavernModal {...props} />
    case 'recruit':
      return <RecruitModal {...props} def={def!} />
    case 'shipyard':
      return <ShipyardModal {...props} />
    case 'passive':
      return <PassiveModal {...props} />
  }
}

const CATEGORY_ORDER: BuildingCategory[] = ['economy', 'recruitment', 'fortification', 'shipyard']
const CATEGORY_LABELS: Record<BuildingCategory, string> = {
  economy: 'Economy',
  recruitment: 'Recruitment',
  fortification: 'Fortifications',
  shipyard: 'Shipyard',
}

/**
 * Town hall build modal (#430): the full building tree, grouped by category.
 * Every building is always visible — ones that can't be built right now are
 * greyed out with the reason (already built, missing prerequisite, one build
 * per round, cost), and each has a tap-to-reveal description tooltip.
 */
function BuildModal({
  buildingId,
  city,
  faction,
  resources,
  onBuild,
  onClose,
}: CityBuildingModalProps) {
  const [infoId, setInfoId] = useState<string | null>(null)
  return (
    <BottomSheet title={buildingDisplayName(buildingId, faction)} onClose={onClose}>
      {CATEGORY_ORDER.map((category) => (
        <section key={category}>
          <h3>{CATEGORY_LABELS[category]}</h3>
          <ul className="building-list">
            {Object.values(BUILDINGS)
              .filter((def) => def.category === category)
              .map((def) => {
                const reason = buildUnavailableReason(def, faction, city, resources)
                const name = buildingDisplayName(def.id, faction)
                return (
                  <li
                    key={def.id}
                    className={reason ? 'build-row build-row--unavailable' : 'build-row'}
                  >
                    <div className="build-row__main">
                      <BuildingGraphic buildingId={def.id} />
                      <div className="build-row__text">
                        <span className="garrison-row__name">{name}</span>
                        <span className="garrison-row__counts">
                          {costLabel(def.cost)}
                          {reason ? ` — ${reason}` : ''}
                        </span>
                      </div>
                      <InfoToggle
                        label={name}
                        expanded={infoId === def.id}
                        onToggle={() => setInfoId(infoId === def.id ? null : def.id)}
                      />
                      <button
                        className="build-row__build"
                        disabled={!!reason}
                        onClick={() => {
                          tapFeedback()
                          onBuild(def.id)
                        }}
                      >
                        {UI_ICON.build && (
                          <img className="button-icon" src={UI_ICON.build} alt="" aria-hidden />
                        )}
                        Build
                      </button>
                    </div>
                    {infoId === def.id && <BuildingInfo def={def} faction={faction} />}
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
    </BottomSheet>
  )
}

/** Recruitment-building modal (#431): recruit the tier this building unlocks,
 * plus garrison load/unload for a docked captain. */
function RecruitModal({
  def,
  city,
  captain,
  faction,
  resources,
  onRecruit,
  onTransfer,
  onClose,
}: CityBuildingModalProps & { def: BuildingDef }) {
  const { unitName } = useTheme()
  const units = FACTIONS[faction].units.filter((u) => u.tier === def.unlocksTier)
  const shipClass = captain ? SHIP_CLASSES.find((s) => s.id === captain.shipClassId) : undefined
  const shipStats =
    captain && shipClass ? effectiveShipStats(shipClass, captain.shipUpgrades) : undefined
  const crewCapacity = shipStats?.crewCapacity ?? 0
  const aboardTotal = captain ? captain.troops.reduce((sum, t) => sum + t.count, 0) : 0
  const troopsAboard = (unitId: string) =>
    captain?.troops.find((t) => t.unitId === unitId)?.count ?? 0
  const tierIconUrl = FACTIONS[faction].unitTierSpriteUrls?.[def.unlocksTier!]
  return (
    <BottomSheet title={buildingDisplayName(def.id, faction)} onClose={onClose}>
      <section>
        <h3>
          Recruit{captain ? ` — ${captain.name} (${aboardTotal}/${crewCapacity} aboard)` : ''}
        </h3>
        {!captain && (
          <p className="building-option__hint">
            Dock a captain next to the city to load or unload troops.
          </p>
        )}
        <ul className="building-list">
          {units.map((unit) => {
            const available = city.unitAvailability[unit.id] ?? 0
            const garrisoned = city.garrison[unit.id] ?? 0
            const aboard = troopsAboard(unit.id)
            const canRecruit = available > 0 && canAfford(resources, { gold: unit.goldCost })
            const canLoad = garrisoned > 0 && !!captain && aboardTotal < crewCapacity
            const canUnload = aboard > 0 && !!captain
            return (
              <li key={unit.id} className="garrison-row">
                <span className="garrison-row__name">
                  {tierIconUrl && (
                    <img className="garrison-row__icon" src={tierIconUrl} alt="" aria-hidden />
                  )}
                  {unitName(unit.id, unit.name)}
                </span>
                <span className="garrison-row__counts">
                  Avail {available} · Garrison {garrisoned} · Aboard {aboard}
                </span>
                <div className="garrison-row__actions">
                  <button
                    disabled={!canRecruit}
                    onClick={() => {
                      tapFeedback()
                      onRecruit(unit.id)
                    }}
                  >
                    {UI_ICON.recruit && (
                      <img className="button-icon" src={UI_ICON.recruit} alt="" aria-hidden />
                    )}
                    Recruit ({unit.goldCost}g)
                  </button>
                  <button
                    disabled={!canLoad}
                    onClick={() => {
                      tapFeedback()
                      onTransfer('toShip', unit.id)
                    }}
                  >
                    {UI_ICON.load && (
                      <img className="button-icon" src={UI_ICON.load} alt="" aria-hidden />
                    )}
                    Load
                  </button>
                  <button
                    disabled={!canUnload}
                    onClick={() => {
                      tapFeedback()
                      onTransfer('toGarrison', unit.id)
                    }}
                  >
                    {UI_ICON.unload && (
                      <img className="button-icon" src={UI_ICON.unload} alt="" aria-hidden />
                    )}
                    Unload
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </BottomSheet>
  )
}

/** Shipyard modal (#432): the ship-upgrade tracks for a docked captain. */
function ShipyardModal({
  buildingId,
  captain,
  faction,
  resources,
  onUpgradeShip,
  onClose,
}: CityBuildingModalProps) {
  const { shipName } = useTheme()
  const shipClass = captain ? SHIP_CLASSES.find((s) => s.id === captain.shipClassId) : undefined
  const shipStats =
    captain && shipClass ? effectiveShipStats(shipClass, captain.shipUpgrades) : undefined
  return (
    <BottomSheet title={buildingDisplayName(buildingId, faction)} onClose={onClose}>
      <section>
        {captain && shipClass && shipStats ? (
          <>
            <h3>
              {captain.name} — {shipName(shipClass.id, shipClass.name)}
            </h3>
            <p className="building-option__hint">
              Hull {shipStats.hull} · Cannons {shipStats.cannons} · Speed {shipStats.speed} · Crew{' '}
              {shipStats.crewCapacity}
            </p>
            <ul className="building-list">
              {SHIP_UPGRADE_TRACKS.map((track) => {
                const levels = shipClass.upgrades[track]
                const currentLevel = captain.shipUpgrades[track] ?? 0
                const next = levels[currentLevel]
                const affordable = !!next && canAfford(resources, { gold: next.goldCost })
                return (
                  <li key={track} className="garrison-row">
                    <span className="garrison-row__name">{UPGRADE_TRACK_LABELS[track]}</span>
                    <span className="garrison-row__counts">
                      Level {currentLevel}/{levels.length}
                      {next ? ` · +${next.amount} for ${next.goldCost}g` : ' · Maxed'}
                    </span>
                    <div className="garrison-row__actions">
                      <button
                        disabled={!next || !affordable}
                        onClick={() => {
                          tapFeedback()
                          onUpgradeShip(track)
                        }}
                      >
                        {UI_ICON.upgradeShip && (
                          <img
                            className="button-icon"
                            src={UI_ICON.upgradeShip}
                            alt=""
                            aria-hidden
                          />
                        )}
                        Upgrade
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <p className="building-option__hint">
            No captain docked — sail a captain alongside the city to refit their ship.
          </p>
        )}
      </section>
    </BottomSheet>
  )
}

/** Tavern modal: all captain management consolidated here (#429 operator
 * decision) — hiring, ransoms, standing orders, boarding defence, and skills. */
function TavernModal({
  buildingId,
  captain,
  captains,
  faction,
  resources,
  setup,
  round,
  playerName,
  onSetStandingOrders,
  onSetBoardOrders,
  onChooseCaptainSkill,
  onRecruitCaptain,
  onRansomCaptain,
  onClose,
}: CityBuildingModalProps) {
  const { unitName, shipName } = useTheme()
  const portraitUrl = FACTIONS[faction].captainPortraitUrl
  // Mirrors the reducer's recruitCaptain cost formula exactly (#308/#309) so the
  // button's price never drifts from what the engine actually charges.
  const liveCaptainCount = captains.filter((c) => !c.captured).length
  const recruitCost = Math.ceil(
    setup.recruitCaptainBaseCost * setup.recruitCaptainCostGrowth ** liveCaptainCount,
  )
  const canRecruitCaptain = canAfford(resources, { gold: recruitCost })
  return (
    <BottomSheet title={buildingDisplayName(buildingId, faction)} onClose={onClose}>
      <section>
        <h3>Fleet ({captains.length})</h3>
        <div className="garrison-row">
          <span className="garrison-row__name">New captain</span>
          <span className="garrison-row__counts">
            {setup.recruitCaptainStartingCrew} starting crew
          </span>
          <div className="garrison-row__actions">
            <button
              disabled={!canRecruitCaptain}
              onClick={() => {
                tapFeedback()
                onRecruitCaptain()
              }}
            >
              Recruit ({recruitCost}g)
            </button>
          </div>
        </div>
        {captains.length === 0 && (
          <p className="building-option__hint">No captains commissioned yet.</p>
        )}
        <ul className="building-list">
          {captains.map((cap) => {
            const capShipClass = SHIP_CLASSES.find((s) => s.id === cap.shipClassId)
            const troopsTotal = cap.troops.reduce((sum, t) => sum + t.count, 0)
            const troopsSummary =
              cap.troops.length > 0
                ? cap.troops.map((t) => `${unitName(t.unitId, t.unitId)} x${t.count}`).join(', ')
                : 'No troops aboard'
            // A captive is naturally eligible for rehire once `round` reaches
            // its captivityReturnRound; ransomCaptain only pulls that round
            // forward to now, it never rehires by itself (reducer.ts).
            const eligibleNow =
              cap.captured &&
              cap.captivityReturnRound !== undefined &&
              round >= cap.captivityReturnRound
            const ransomCost = Math.ceil(setup.ransomBaseCost + cap.xp * setup.ransomXpMultiplier)
            return (
              <li key={cap.id} className="garrison-row captain-row">
                {portraitUrl && (
                  <img className="captain-row__portrait" src={portraitUrl} alt="" aria-hidden />
                )}
                <div className="captain-row__body">
                  <span className="garrison-row__name">
                    {cap.name}
                    {capShipClass ? ` — ${shipName(capShipClass.id, capShipClass.name)}` : ''}
                    {' · '}
                    Level {levelForXp(cap.xp, CAPTAIN_XP_THRESHOLDS)}
                  </span>
                  <span className="garrison-row__counts">
                    {cap.captured
                      ? `Captured by ${cap.capturedBy ? playerName(cap.capturedBy) : 'an eliminated seat'}${
                          eligibleNow
                            ? ' — eligible for rehire'
                            : ` — held until round ${cap.captivityReturnRound}`
                        }`
                      : `${troopsTotal} troop${troopsTotal === 1 ? '' : 's'} — ${troopsSummary}`}
                  </span>
                </div>
                {cap.captured && (
                  <div className="garrison-row__actions">
                    {eligibleNow ? (
                      <button
                        disabled={!canAfford(resources, { gold: recruitCost })}
                        onClick={() => {
                          tapFeedback()
                          onRecruitCaptain(cap.id)
                        }}
                      >
                        Rehire ({recruitCost}g)
                      </button>
                    ) : (
                      <button
                        disabled={!canAfford(resources, { gold: ransomCost })}
                        onClick={() => {
                          tapFeedback()
                          onRansomCaptain(cap.id)
                        }}
                      >
                        Ransom ({ransomCost}g)
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {captain ? (
        <>
          <section>
            <h3>Standing orders — {captain.name}</h3>
            <p className="building-option__hint">
              Conditional defence plan used when this fleet is attacked while you're offline.
            </p>
            <ul className="building-list">
              {STANDING_ORDER_PLANS.map((plan) => (
                <li key={plan.id} className="garrison-row">
                  <span className="garrison-row__name">{plan.label}</span>
                  <div className="garrison-row__actions">
                    <button
                      disabled={ordersMatch(captain.standingOrders, plan.orders)}
                      onClick={() => {
                        tapFeedback()
                        onSetStandingOrders(plan.orders)
                      }}
                    >
                      {ordersMatch(captain.standingOrders, plan.orders) ? 'Active' : 'Set'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>Boarding defence — {captain.name}</h3>
            <p className="building-option__hint">
              Melee doctrine your crew fights by on the battle board when boarded while you're
              offline.
            </p>
            <ul className="building-list">
              {BOARD_ORDER_PLANS.map((plan) => (
                <li key={plan.id} className="garrison-row">
                  <span className="garrison-row__name">{plan.label}</span>
                  <div className="garrison-row__actions">
                    <button
                      disabled={ordersMatch(captain.boardOrders, plan.orders)}
                      onClick={() => onSetBoardOrders(plan.orders)}
                    >
                      {ordersMatch(captain.boardOrders, plan.orders) ? 'Active' : 'Set'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>
              Captain — Level {levelForXp(captain.xp, CAPTAIN_XP_THRESHOLDS)} ({captain.xp} XP)
            </h3>
            {(() => {
              const picks = availableSkillPicks(captain, CAPTAIN_XP_THRESHOLDS)
              const level = levelForXp(captain.xp, CAPTAIN_XP_THRESHOLDS)
              return (
                <>
                  <p className="building-option__hint">
                    {picks > 0
                      ? `${picks} skill pick${picks === 1 ? '' : 's'} available.`
                      : 'No skill picks available yet — earn more XP to level up.'}
                  </p>
                  <ul className="building-list">
                    {skillsForFaction(faction).map((skill) => {
                      const owned = captain.skills.includes(skill.id)
                      const canPick = picks > 0 && !owned && skill.tier <= level
                      return (
                        <li key={skill.id} className="garrison-row">
                          <span className="garrison-row__name">{skill.name}</span>
                          <span className="garrison-row__counts">
                            {owned ? 'Learned — ' : `Tier ${skill.tier} — `}
                            {skill.description}
                          </span>
                          <div className="garrison-row__actions">
                            <button
                              disabled={owned || !canPick}
                              onClick={() => {
                                tapFeedback()
                                onChooseCaptainSkill(skill.id)
                              }}
                            >
                              {owned ? 'Learned' : 'Learn'}
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )
            })()}
          </section>
        </>
      ) : (
        <section>
          <p className="building-option__hint">
            Dock a captain next to the city to manage their orders and skills here.
          </p>
        </section>
      )}
    </BottomSheet>
  )
}

/** Passive building modal (#431): what the building does. */
function PassiveModal({ buildingId, faction, onClose }: CityBuildingModalProps) {
  return (
    <BottomSheet title={buildingDisplayName(buildingId, faction)} onClose={onClose}>
      <section className="building-modal__intro">
        <BuildingGraphic buildingId={buildingId} />
      </section>
    </BottomSheet>
  )
}
