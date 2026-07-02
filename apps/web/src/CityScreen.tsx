import { BUILDINGS, buildingDisplayName, type BuildingDef } from '@aop/content'
import type { CityState } from '@aop/engine'
import type { FactionId, ResourcePool } from '@aop/shared'
import { canAfford } from '@aop/shared'

interface CityScreenProps {
  city: CityState
  faction: FactionId
  resources: ResourcePool
  onClose: () => void
  onBuild: (buildingId: string) => void
}

function costLabel(cost: BuildingDef['cost']): string {
  const parts = Object.entries(cost)
    .filter(([, amount]) => amount)
    .map(([resource, amount]) => `${amount} ${resource}`)
  return parts.length > 0 ? parts.join(', ') : 'Free'
}

/**
 * Mobile-friendly bottom-sheet city screen: shows what's built and what can
 * be built next in each of the three trees (economy, recruitment,
 * fortification). One construction per city per turn — enforced by the
 * engine; the UI only disables the button as a hint.
 */
export function CityScreen({ city, faction, resources, onClose, onBuild }: CityScreenProps) {
  const buildable = Object.values(BUILDINGS).filter((def) => !city.buildings.includes(def.id))

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
      </div>
    </div>
  )
}
