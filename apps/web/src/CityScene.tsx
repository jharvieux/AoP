import { BUILDINGS, FACTIONS, buildingDisplayName } from '@aop/content'
import type { FactionId } from '@aop/shared'

/**
 * Graphical city scene (#429): every constructed building drawn in a fixed
 * scene layout, data-driven from `city.buildings`. Building art doesn't exist
 * yet (#436's city-art issue), so each building renders as a category-colored
 * placeholder block with its flavor-name label — the layout, tap targets, and
 * flag are real; only the art is a stand-in.
 */

interface SceneSlot {
  /** Position and size in % of the scene box. Tap targets get a 44px CSS floor regardless. */
  left: number
  top: number
  width: number
  height: number
}

/**
 * Fixed scene layout: town hall centered on the rise, economy to the left,
 * the recruitment chain to the right, walls across the front, shipyard on
 * the waterline. A building with no slot (future content) falls back to the
 * overflow strip below the scene so it never loses its tap target.
 */
const SCENE_SLOTS: Record<string, SceneSlot> = {
  townhall: { left: 36, top: 12, width: 26, height: 30 },
  tavern: { left: 4, top: 26, width: 14, height: 20 },
  tradehouse: { left: 19, top: 30, width: 14, height: 18 },
  sawmill: { left: 2, top: 52, width: 13, height: 16 },
  ironmine: { left: 16, top: 54, width: 13, height: 16 },
  distillery: { left: 30, top: 54, width: 13, height: 16 },
  barracks: { left: 47, top: 50, width: 13, height: 17 },
  garrisonHall: { left: 62, top: 50, width: 13, height: 18 },
  fortressArmory: { left: 64, top: 26, width: 13, height: 19 },
  grandArsenal: { left: 80, top: 22, width: 15, height: 22 },
  palisade: { left: 4, top: 76, width: 17, height: 12 },
  stoneWall: { left: 24, top: 76, width: 17, height: 12 },
  citadel: { left: 44, top: 72, width: 16, height: 16 },
  shipyard: { left: 76, top: 70, width: 18, height: 18 },
}

/** The faction flag flown on the town hall (#428/#429). The flag PNG may not
 * exist yet — the cloth keeps the faction's primary color when the image 404s. */
function FactionFlag({ faction }: { faction: FactionId }) {
  const def = FACTIONS[faction]
  return (
    <span className="city-scene__flagpole" aria-hidden>
      <span className="city-scene__flag" style={{ backgroundColor: def.primaryColor }}>
        <img
          src={def.flagSpriteUrl}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      </span>
    </span>
  )
}

interface CitySceneProps {
  buildings: readonly string[]
  faction: FactionId
  onOpenBuilding: (buildingId: string) => void
}

export function CityScene({ buildings, faction, onOpenBuilding }: CitySceneProps) {
  const known = buildings.filter((id) => BUILDINGS[id])
  const placed = known.filter((id) => SCENE_SLOTS[id])
  const overflow = known.filter((id) => !SCENE_SLOTS[id])
  return (
    <>
      <div className="city-scene" role="group" aria-label="City buildings">
        {placed.map((id) => {
          const slot = SCENE_SLOTS[id]!
          const def = BUILDINGS[id]!
          return (
            <button
              key={id}
              type="button"
              className={`city-scene__building city-scene__building--${def.category}`}
              style={{
                left: `${slot.left}%`,
                top: `${slot.top}%`,
                width: `${slot.width}%`,
                height: `${slot.height}%`,
              }}
              onClick={() => onOpenBuilding(id)}
            >
              {id === 'townhall' && <FactionFlag faction={faction} />}
              <span className="city-scene__label">{buildingDisplayName(id, faction)}</span>
            </button>
          )
        })}
      </div>
      {overflow.length > 0 && (
        <div className="city-scene__overflow">
          {overflow.map((id) => (
            <button
              key={id}
              type="button"
              className="building-option"
              onClick={() => onOpenBuilding(id)}
            >
              {buildingDisplayName(id, faction)}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
