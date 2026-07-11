import {
  BUILDINGS,
  CAPTAIN_XP_THRESHOLDS,
  FACTIONS,
  SHIP_CLASSES,
  SHIP_UPGRADE_TRACKS,
  buildingDisplayName,
  skillsForFaction,
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
import { useTheme } from './theme/ThemeContext'
import { BottomSheet } from './components/BottomSheet'
import { tapFeedback } from './audio/feedback'
import { UI_ICON } from './uiIcons'

interface CityScreenProps {
  city: CityState
  captain: Captain | undefined
  /** Every captain the viewer owns (#114), so the fleet can be broken out one row
   * per captain instead of a single faction-wide garrison blob. */
  captains: Captain[]
  faction: FactionId
  resources: ResourcePool
  /** Balance knobs for the recruit/ransom-captain cost formulas (#308/#309). */
  setup: GameSetup
  /** Current match round, to tell a captive that's past `captivityReturnRound` from one that isn't. */
  round: number
  /** Resolves a seat id to a display name, for "captured by …" (matches BattleBoardSheet's convention). */
  playerName: (id: string) => string
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

const UPGRADE_TRACK_LABELS: Record<string, string> = {
  hull: 'Hull',
  cannons: 'Cannons',
  speed: 'Sails',
  crewCapacity: 'Crew capacity',
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

function costLabel(cost: BuildingDef['cost']): string {
  const parts = Object.entries(cost)
    .filter(([, amount]) => amount)
    .map(([resource, amount]) => `${amount} ${resource}`)
  return parts.length > 0 ? parts.join(', ') : 'Free'
}

/**
 * Mobile-friendly bottom-sheet city screen: building tree, garrison recruiting
 * and troop transfer, captain skills, shipyard upgrades, and standing orders.
 */
export function CityScreen({
  city,
  captain,
  captains,
  faction,
  resources,
  setup,
  round,
  playerName,
  onClose,
  onBuild,
  onRecruit,
  onTransfer,
  onSetStandingOrders,
  onSetBoardOrders,
  onChooseCaptainSkill,
  onUpgradeShip,
  onRecruitCaptain,
  onRansomCaptain,
}: CityScreenProps) {
  const { unitName, shipName } = useTheme()
  const portraitUrl = FACTIONS[faction].captainPortraitUrl
  const buildable = Object.values(BUILDINGS).filter((def) => !city.buildings.includes(def.id))
  const roster = FACTIONS[faction].units
  const unlockedTier = city.buildings.reduce(
    (max, id) => Math.max(max, BUILDINGS[id]?.unlocksTier ?? 0),
    0,
  )
  const shipClass = captain ? SHIP_CLASSES.find((s) => s.id === captain.shipClassId) : undefined
  const shipStats =
    captain && shipClass ? effectiveShipStats(shipClass, captain.shipUpgrades) : undefined
  const crewCapacity = shipStats?.crewCapacity ?? 0
  const aboardTotal = captain ? captain.troops.reduce((sum, t) => sum + t.count, 0) : 0
  const troopsAboard = (unitId: string) =>
    captain?.troops.find((t) => t.unitId === unitId)?.count ?? 0

  // Mirrors the reducer's recruitCaptain cost formula exactly (#308/#309) so the
  // button's price never drifts from what the engine actually charges.
  const liveCaptainCount = captains.filter((c) => !c.captured).length
  const recruitCost = Math.ceil(
    setup.recruitCaptainBaseCost * setup.recruitCaptainCostGrowth ** liveCaptainCount,
  )
  // Tavern gate (#433): recruiting/rehiring a captain needs a tavern-flagged
  // building in this city — derived from content data, not a hardcoded id,
  // same as the shipyard's unlocksShipyard check below.
  const hasTavern = city.buildings.some((id) => BUILDINGS[id]?.unlocksCaptains)
  const canRecruitCaptain = hasTavern && canAfford(resources, { gold: recruitCost })

  // Every committed action gets a light tap so the sheet's dense button rows
  // (recruit/load/unload/build/upgrade) feel responsive on touch (#27).
  function build(buildingId: string) {
    tapFeedback()
    onBuild(buildingId)
  }
  function recruit(unitId: string) {
    tapFeedback()
    onRecruit(unitId)
  }
  function transfer(direction: 'toShip' | 'toGarrison', unitId: string) {
    tapFeedback()
    onTransfer(direction, unitId)
  }
  function setStandingOrders(orders: StandingOrder[]) {
    tapFeedback()
    onSetStandingOrders(orders)
  }
  function chooseCaptainSkill(skillId: string) {
    tapFeedback()
    onChooseCaptainSkill(skillId)
  }
  function upgradeShip(track: string) {
    tapFeedback()
    onUpgradeShip(track)
  }
  function recruitCaptain(captainId?: string) {
    tapFeedback()
    onRecruitCaptain(captainId)
  }
  function ransomCaptain(captainId: string) {
    tapFeedback()
    onRansomCaptain(captainId)
  }

  return (
    <BottomSheet title={city.name} onClose={onClose}>
      <>
        <section>
          <h3>Standing buildings</h3>
          <ul className="building-list">
            {city.buildings.map((id) => (
              <li key={id}>{buildingDisplayName(id, faction)}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3>Construct{city.builtThisRound ? ' (already built this turn)' : ''}</h3>
          <ul className="building-list building-list--buildable">
            {buildable.map((def) => {
              const met = !def.requires || city.buildings.includes(def.requires)
              const affordable = canAfford(resources, def.cost)
              const disabled = city.builtThisRound || !met || !affordable
              return (
                <li key={def.id}>
                  <button
                    className="building-option"
                    disabled={disabled}
                    onClick={() => build(def.id)}
                  >
                    <span>
                      {UI_ICON.build && (
                        <img className="button-icon" src={UI_ICON.build} alt="" aria-hidden />
                      )}
                      {buildingDisplayName(def.id, faction)}
                    </span>
                    <span className="building-option__cost">{costLabel(def.cost)}</span>
                  </button>
                  {!met && <p className="building-option__hint">Requires {def.requires}</p>}
                </li>
              )
            })}
          </ul>
        </section>

        <section>
          <h3>Fleet ({captains.length})</h3>
          <div className="garrison-row">
            <span className="garrison-row__name">New captain</span>
            <span className="garrison-row__counts">
              {setup.recruitCaptainStartingCrew} starting crew
            </span>
            <div className="garrison-row__actions">
              <button disabled={!canRecruitCaptain} onClick={() => recruitCaptain()}>
                Recruit ({recruitCost}g)
              </button>
            </div>
          </div>
          {!hasTavern && <p className="building-option__hint">Requires Tavern</p>}
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
                          disabled={!hasTavern || !canAfford(resources, { gold: recruitCost })}
                          onClick={() => recruitCaptain(cap.id)}
                        >
                          Rehire ({recruitCost}g)
                        </button>
                      ) : (
                        <button
                          disabled={!canAfford(resources, { gold: ransomCost })}
                          onClick={() => ransomCaptain(cap.id)}
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

        <section>
          <h3>Garrison{captain ? ` — ${captain.name} (${aboardTotal}/${crewCapacity})` : ''}</h3>
          {!captain && (
            <p className="building-option__hint">
              Dock a captain next to the city to load or unload troops.
            </p>
          )}
          <ul className="building-list">
            {roster.map((unit) => {
              const available = city.unitAvailability[unit.id] ?? 0
              const garrisoned = city.garrison[unit.id] ?? 0
              const aboard = troopsAboard(unit.id)
              const locked = unit.tier > unlockedTier
              const canRecruit =
                !locked && available > 0 && canAfford(resources, { gold: unit.goldCost })
              const canLoad = !locked && garrisoned > 0 && !!captain && aboardTotal < crewCapacity
              const canUnload = !locked && aboard > 0 && !!captain
              const tierIconUrl = FACTIONS[faction].unitTierSpriteUrls?.[unit.tier]
              return (
                <li key={unit.id} className="garrison-row">
                  <span className="garrison-row__name">
                    {tierIconUrl && (
                      <img className="garrison-row__icon" src={tierIconUrl} alt="" aria-hidden />
                    )}
                    {unitName(unit.id, unit.name)}
                  </span>
                  <span className="garrison-row__counts">
                    {locked
                      ? 'Locked'
                      : `Avail ${available} · Garrison ${garrisoned} · Aboard ${aboard}`}
                  </span>
                  <div className="garrison-row__actions">
                    <button disabled={!canRecruit} onClick={() => recruit(unit.id)}>
                      {UI_ICON.recruit && (
                        <img className="button-icon" src={UI_ICON.recruit} alt="" aria-hidden />
                      )}
                      Recruit ({unit.goldCost}g)
                    </button>
                    <button disabled={!canLoad} onClick={() => transfer('toShip', unit.id)}>
                      {UI_ICON.load && (
                        <img className="button-icon" src={UI_ICON.load} alt="" aria-hidden />
                      )}
                      Load
                    </button>
                    <button disabled={!canUnload} onClick={() => transfer('toGarrison', unit.id)}>
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

        {captain && (
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
                      onClick={() => setStandingOrders(plan.orders)}
                    >
                      {ordersMatch(captain.standingOrders, plan.orders) ? 'Active' : 'Set'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {captain && (
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
        )}

        {captain && shipClass && shipStats && (
          <section>
            <h3>Shipyard{!city.buildings.includes('shipyard') ? ' (requires a Shipyard)' : ''}</h3>
            <p className="building-option__hint">
              {shipName(shipClass.id, shipClass.name)} — Hull {shipStats.hull} · Cannons{' '}
              {shipStats.cannons} · Speed {shipStats.speed} · Crew {shipStats.crewCapacity}
            </p>
            <ul className="building-list">
              {SHIP_UPGRADE_TRACKS.map((track) => {
                const levels = shipClass.upgrades[track]
                const currentLevel = captain.shipUpgrades[track] ?? 0
                const next = levels[currentLevel]
                const affordable = !!next && canAfford(resources, { gold: next.goldCost })
                const disabled = !next || !affordable || !city.buildings.includes('shipyard')
                return (
                  <li key={track} className="garrison-row">
                    <span className="garrison-row__name">{UPGRADE_TRACK_LABELS[track]}</span>
                    <span className="garrison-row__counts">
                      Level {currentLevel}/{levels.length}
                      {next ? ` · +${next.amount} for ${next.goldCost}g` : ' · Maxed'}
                    </span>
                    <div className="garrison-row__actions">
                      <button disabled={disabled} onClick={() => upgradeShip(track)}>
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
          </section>
        )}

        {captain && (
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
                              onClick={() => chooseCaptainSkill(skill.id)}
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
        )}
      </>
    </BottomSheet>
  )
}
