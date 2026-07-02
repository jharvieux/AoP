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
  type Captain,
  type CityState,
  type StandingOrder,
} from '@aop/engine'
import type { FactionId, ResourcePool } from '@aop/shared'
import { canAfford } from '@aop/shared'

interface CityScreenProps {
  city: CityState
  captain: Captain | undefined
  faction: FactionId
  resources: ResourcePool
  onClose: () => void
  onBuild: (buildingId: string) => void
  onRecruit: (unitId: string) => void
  onTransfer: (direction: 'toShip' | 'toGarrison', unitId: string) => void
  onSetStandingOrders: (orders: StandingOrder[]) => void
  onChooseCaptainSkill: (skillId: string) => void
  onUpgradeShip: (track: string) => void
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

function ordersMatch(a: StandingOrder[] | undefined, b: StandingOrder[]): boolean {
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
  faction,
  resources,
  onClose,
  onBuild,
  onRecruit,
  onTransfer,
  onSetStandingOrders,
  onChooseCaptainSkill,
  onUpgradeShip,
}: CityScreenProps) {
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

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__header">
          <h2>{city.name}</h2>
          <button className="sheet__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

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
                    onClick={() => onBuild(def.id)}
                  >
                    <span>{buildingDisplayName(def.id, faction)}</span>
                    <span className="building-option__cost">{costLabel(def.cost)}</span>
                  </button>
                  {!met && <p className="building-option__hint">Requires {def.requires}</p>}
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
              return (
                <li key={unit.id} className="garrison-row">
                  <span className="garrison-row__name">{unit.name}</span>
                  <span className="garrison-row__counts">
                    {locked
                      ? 'Locked'
                      : `Avail ${available} · Garrison ${garrisoned} · Aboard ${aboard}`}
                  </span>
                  <div className="garrison-row__actions">
                    <button disabled={!canRecruit} onClick={() => onRecruit(unit.id)}>
                      Recruit ({unit.goldCost}g)
                    </button>
                    <button disabled={!canLoad} onClick={() => onTransfer('toShip', unit.id)}>
                      Load
                    </button>
                    <button disabled={!canUnload} onClick={() => onTransfer('toGarrison', unit.id)}>
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
                      onClick={() => onSetStandingOrders(plan.orders)}
                    >
                      {ordersMatch(captain.standingOrders, plan.orders) ? 'Active' : 'Set'}
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
              {shipClass.name} — Hull {shipStats.hull} · Cannons {shipStats.cannons} · Speed{' '}
              {shipStats.speed} · Crew {shipStats.crewCapacity}
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
                      <button disabled={disabled} onClick={() => onUpgradeShip(track)}>
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
                              onClick={() => onChooseCaptainSkill(skill.id)}
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
      </div>
    </div>
  )
}
