import {
  BUILDINGS,
  buildingDisplayName,
  CAPTAIN_XP_THRESHOLDS,
  FACTIONS,
  skillsForFaction,
  type BuildingDef,
} from '@aop/content'
import {
  availableSkillPicks,
  levelForXp,
  type CaptainState,
  type CityState,
  type StandingOrder,
} from '@aop/engine'
import type { FactionId, ResourcePool } from '@aop/shared'
import { canAfford } from '@aop/shared'

interface CityScreenProps {
  city: CityState
  captain: CaptainState | undefined
  shipCrewCapacity: number
  faction: FactionId
  resources: ResourcePool
  onClose: () => void
  onBuild: (buildingId: string) => void
  onRecruit: (unitId: string) => void
  onTransfer: (direction: 'toShip' | 'toGarrison', unitId: string) => void
  onSetStandingOrder: (
    targetType: 'city' | 'captain',
    targetId: string,
    order: StandingOrder,
  ) => void
  onChooseCaptainSkill: (skillId: string) => void
}

const STANDING_ORDER_LABELS: Record<StandingOrder, string> = {
  fightToTheShip: 'Fight to the ship',
  evadeIfOutgunned: 'Evade if outgunned',
}

function costLabel(cost: BuildingDef['cost']): string {
  const parts = Object.entries(cost)
    .filter(([, amount]) => amount)
    .map(([resource, amount]) => `${amount} ${resource}`)
  return parts.length > 0 ? parts.join(', ') : 'Free'
}

/**
 * Mobile-friendly bottom-sheet city screen: buildings tree plus a garrison
 * panel for recruiting troops and shuttling them to/from the visiting
 * captain's ship.
 */
export function CityScreen({
  city,
  captain,
  shipCrewCapacity,
  faction,
  resources,
  onClose,
  onBuild,
  onRecruit,
  onTransfer,
  onSetStandingOrder,
  onChooseCaptainSkill,
}: CityScreenProps) {
  const buildable = Object.values(BUILDINGS).filter((def) => !city.buildings.includes(def.id))
  const roster = FACTIONS[faction].units
  const unlockedTier = city.buildings.reduce(
    (max, id) => Math.max(max, BUILDINGS[id]?.unlocksTier ?? 0),
    0,
  )
  const aboardTotal = captain
    ? Object.values(captain.troopsAboard).reduce((sum, n) => sum + n, 0)
    : 0

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
          <h3>
            Garrison{captain ? ` — ${captain.name} (${aboardTotal}/${shipCrewCapacity})` : ''}
          </h3>
          <ul className="building-list">
            {roster.map((unit) => {
              const available = city.unitAvailability[unit.id] ?? 0
              const garrisoned = city.garrison[unit.id] ?? 0
              const aboard = captain?.troopsAboard[unit.id] ?? 0
              const locked = unit.tier > unlockedTier
              const canRecruit =
                !locked && available > 0 && canAfford(resources, { gold: unit.goldCost })
              const canLoad =
                !locked && garrisoned > 0 && !!captain && aboardTotal < shipCrewCapacity
              const canUnload = !locked && aboard > 0

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

        <section>
          <h3>Standing orders</h3>
          <p className="building-option__hint">
            Consulted by the combat driver when this garrison or fleet is attacked while you're
            offline.
          </p>
          <ul className="building-list">
            <li className="garrison-row">
              <span className="garrison-row__name">Garrison — {city.name}</span>
              <div className="garrison-row__actions">
                {(Object.keys(STANDING_ORDER_LABELS) as StandingOrder[]).map((order) => (
                  <button
                    key={order}
                    disabled={city.standingOrder === order}
                    onClick={() => onSetStandingOrder('city', city.id, order)}
                  >
                    {STANDING_ORDER_LABELS[order]}
                  </button>
                ))}
              </div>
            </li>
            {captain && (
              <li className="garrison-row">
                <span className="garrison-row__name">Fleet — {captain.name}</span>
                <div className="garrison-row__actions">
                  {(Object.keys(STANDING_ORDER_LABELS) as StandingOrder[]).map((order) => (
                    <button
                      key={order}
                      disabled={captain.standingOrder === order}
                      onClick={() => onSetStandingOrder('captain', captain.id, order)}
                    >
                      {STANDING_ORDER_LABELS[order]}
                    </button>
                  ))}
                </div>
              </li>
            )}
          </ul>
        </section>

        {captain && (
          <section>
            <h3>
              Captain — Level {levelForXp(captain.xp, CAPTAIN_XP_THRESHOLDS)} ({captain.xp} XP)
            </h3>
            {(() => {
              const picks = availableSkillPicks(captain, CAPTAIN_XP_THRESHOLDS)
              const level = levelForXp(captain.xp, CAPTAIN_XP_THRESHOLDS)
              const pickable = skillsForFaction(faction).filter(
                (skill) => skill.tier <= level && !captain.skills.includes(skill.id),
              )
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
                      const canPick = picks > 0 && pickable.includes(skill)
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
