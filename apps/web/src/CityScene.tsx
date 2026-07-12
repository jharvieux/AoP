import { BUILDINGS, FACTIONS, buildingDisplayName } from '@aop/content'
import type { FactionId } from '@aop/shared'
import {
  buildingContentId,
  cityBackdropContentId,
  factionFlagContentId,
  resolveSpriteUrl,
} from './mapSprites'
import { useTheme } from './theme/ThemeContext'

/**
 * Graphical city scene (#429, art wired in #447): every constructed building
 * drawn in a fixed scene layout, data-driven from `city.buildings`. Each slot
 * renders its `BUILDINGS[id].spriteUrl` art (theme-pack override via
 * `resolveSpriteUrl` wins when set) over the category-colored placeholder
 * block, which stays visible as the fallback if the art 404s or a building
 * has no art yet (e.g. any future building added without a sprite).
 */

/** The backdrop image behind the whole scene (#447). Falls back to the
 * existing sky/ground/water CSS gradient (see `.city-scene` in styles.css)
 * if the sprite 404s or a theme pack clears it without supplying its own. */
const BACKDROP_URL = '/art/city/backdrop.png'

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

/** The faction flag flown on the town hall (#428/#429). Routes through the
 * theme-pack override chain (#459) the same way building sprites do — a
 * theme pack's faction art wins over `FactionDef.flagSpriteUrl` when set.
 * The flag PNG may not exist yet — the cloth keeps the faction's primary
 * color when the image 404s or no URL resolves at all. */
function FactionFlag({ faction }: { faction: FactionId }) {
  const { spriteUrl: themeSpriteUrl } = useTheme()
  const def = FACTIONS[faction]
  const flagUrl = resolveSpriteUrl(themeSpriteUrl, factionFlagContentId(faction), def.flagSpriteUrl)
  return (
    <span className="city-scene__flagpole" aria-hidden>
      <span className="city-scene__flag" style={{ backgroundColor: def.primaryColor }}>
        {flagUrl && (
          <img
            src={flagUrl}
            alt=""
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
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
  const { spriteUrl: themeSpriteUrl } = useTheme()
  const known = buildings.filter((id) => BUILDINGS[id])
  const placed = known.filter((id) => SCENE_SLOTS[id])
  const overflow = known.filter((id) => !SCENE_SLOTS[id])
  const backdropUrl = resolveSpriteUrl(themeSpriteUrl, cityBackdropContentId(), BACKDROP_URL)
  return (
    <>
      <div className="city-scene" role="group" aria-label="City buildings">
        {backdropUrl && (
          <img
            className="city-scene__backdrop"
            src={backdropUrl}
            alt=""
            aria-hidden
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
        {placed.map((id) => {
          const slot = SCENE_SLOTS[id]!
          const def = BUILDINGS[id]!
          const spriteUrl = resolveSpriteUrl(themeSpriteUrl, buildingContentId(id), def.spriteUrl)
          const towerUrl =
            id === 'citadel'
              ? resolveSpriteUrl(
                  themeSpriteUrl,
                  buildingContentId('citadel:tower'),
                  def.cornerTowerSpriteUrl,
                )
              : undefined
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
              {spriteUrl && (
                <img
                  className="city-scene__sprite"
                  src={spriteUrl}
                  alt=""
                  aria-hidden
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
              {towerUrl && (
                <img
                  className="city-scene__sprite city-scene__sprite--tower"
                  src={towerUrl}
                  alt=""
                  aria-hidden
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
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
