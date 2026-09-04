import { BUILDINGS, FACTIONS, buildingDisplayName } from '@aop/content'
import type { FactionId } from '@aop/shared'
import { useState } from 'react'
import citySceneLayout from './citySceneLayout.json'
import { buildingContentId, cityBackdropContentId, factionFlagContentId } from './mapSprites'
import { useTheme } from './theme/ThemeContext'

/**
 * Graphical city scene (#429, art wired in #447): every constructed building
 * drawn in a fixed scene layout, data-driven from `city.buildings`. Each slot
 * renders its `BUILDINGS[id].spriteUrl` art (theme-pack override via
 * `resolveSpriteUrl` wins when set); the category-colored placeholder block
 * shows only until the art loads, and returns as the fallback if the art
 * 404s or a building has no sprite yet.
 */

/** The backdrop image behind the whole scene (#447). Falls back to the
 * existing sky/ground/water CSS gradient (see `.city-scene` in styles.css)
 * if the sprite 404s or a theme pack clears it without supplying its own. */
interface SceneSlot {
  /** Position and size in % of the scene box. Tap targets get a 44px CSS floor regardless. */
  left: number
  top: number
  width: number
  height: number
  /** Stable painter's-pass order; baseline resolves overlap within one pass. */
  depth: 0 | 1 | 2 | 3
}

const SCENE_SLOTS = citySceneLayout.slots as Record<string, SceneSlot>
const BACKDROP_TILES = citySceneLayout.backdrop.tiles
const BACKDROP_TILE_WIDTH = 1024
const BACKDROP_TILE_HEIGHT = 1056
const BACKDROP_TILE_BLEED = 2
const SHADOW = citySceneLayout.shadow
const FLAG = citySceneLayout.flag
const TOWER = citySceneLayout.tower

const BACKDROP_TILE_IMAGE_STYLE = {
  position: 'absolute',
  left: `${(-BACKDROP_TILE_BLEED / (BACKDROP_TILE_WIDTH - 2 * BACKDROP_TILE_BLEED)) * 100}%`,
  top: `${(-BACKDROP_TILE_BLEED / (BACKDROP_TILE_HEIGHT - 2 * BACKDROP_TILE_BLEED)) * 100}%`,
  width: `${(BACKDROP_TILE_WIDTH / (BACKDROP_TILE_WIDTH - 2 * BACKDROP_TILE_BLEED)) * 100}%`,
  height: `${(BACKDROP_TILE_HEIGHT / (BACKDROP_TILE_HEIGHT - 2 * BACKDROP_TILE_BLEED)) * 100}%`,
} satisfies React.CSSProperties

/**
 * Fixed scene layout: town hall centered at the top, economy to the left,
 * the recruitment chain to the right, walls across the front. Tuned against
 * the tiled art/city backdrop (#608): land buildings stay on the meadow,
 * walls sit above the shoreline. The shipyard sits at the
 * bottom-right where the production backdrop's corrected shore reaches the
 * slot (#608: the shipyard WebP is a real transparent cutout, no baked-in
 * water; its landward gangway meets dry coast while the drydock and pilings
 * extend over open water). Re-tune the two together after any backdrop or
 * slot change. A building with no slot (future content) falls back
 * to the overflow strip below the scene so it never loses its tap target.
 */
function spriteCandidates(
  themeSpriteUrl: (contentId: string) => string | undefined,
  contentId: string,
  defaultUrl: string | undefined,
): string[] {
  const override = themeSpriteUrl(contentId)
  if (override && override !== defaultUrl) return defaultUrl ? [override, defaultUrl] : [override]
  return defaultUrl ? [defaultUrl] : []
}

interface FallbackImageProps {
  candidates: readonly string[]
  className?: string
  style?: React.CSSProperties
  onLoad?: () => void
  onAttemptError?: () => void
  onExhausted?: () => void
}

/** Try a theme override first, then the shipping local asset, then disappear. */
function FallbackImage({
  candidates,
  className,
  style,
  onLoad,
  onAttemptError,
  onExhausted,
}: FallbackImageProps) {
  const [candidateIndex, setCandidateIndex] = useState(0)
  const src = candidates[candidateIndex]
  if (!src) return null
  return (
    <img
      className={className}
      style={style}
      src={src}
      alt=""
      aria-hidden
      onLoad={onLoad}
      onError={() => {
        onAttemptError?.()
        if (candidateIndex + 1 >= candidates.length) onExhausted?.()
        setCandidateIndex((index) => index + 1)
      }}
    />
  )
}

/** The faction flag flown on the town hall (#428/#429). Routes through the
 * theme-pack override chain (#459) the same way building sprites do — a
 * theme pack's faction art wins over `FactionDef.flagSpriteUrl` when set.
 * The flag PNG may not exist yet — the cloth keeps the faction's primary
 * color when the image 404s or no URL resolves at all. */
function FactionFlag({ faction }: { faction: FactionId }) {
  const { spriteUrl: themeSpriteUrl } = useTheme()
  const def = FACTIONS[faction]
  const flagCandidates = spriteCandidates(
    themeSpriteUrl,
    factionFlagContentId(faction),
    def.flagSpriteUrl,
  )
  return (
    <span
      className="city-scene__flagpole"
      aria-hidden
      style={
        {
          '--city-flag-top': `${FLAG.poleTopPercent}%`,
          '--city-flag-left': `${FLAG.poleLeftPercent}%`,
          '--city-flag-width': `${FLAG.poleWidthPercent}%`,
          '--city-flag-height': `${FLAG.poleHeightPercent}%`,
          '--city-flag-mast-width': `${FLAG.mastWidthPx}px`,
          '--city-flag-cloth-left': `${FLAG.clothLeftPx}px`,
          '--city-flag-cloth-width': `${FLAG.clothWidthPercent}%`,
        } as React.CSSProperties
      }
    >
      <span className="city-scene__flagpole-mast" />
      <span className="city-scene__flag" style={{ backgroundColor: def.primaryColor }}>
        <FallbackImage key={flagCandidates.join('|')} candidates={flagCandidates} />
      </span>
    </span>
  )
}

interface SceneBuildingProps {
  id: string
  slot: SceneSlot
  faction: FactionId
  onOpenBuilding: (buildingId: string) => void
}

/** One placed building. The category-colored placeholder block renders only
 * until the sprite has actually loaded (operator feedback: the colored
 * squares must not frame the transparent cutout art) — and comes back if the
 * art 404s, so every building always has a visible tap target. */
function SceneBuilding({ id, slot, faction, onOpenBuilding }: SceneBuildingProps) {
  const { spriteUrl: themeSpriteUrl } = useTheme()
  const [artLoaded, setArtLoaded] = useState(false)
  const def = BUILDINGS[id]!
  const spriteUrls = spriteCandidates(themeSpriteUrl, buildingContentId(id), def.spriteUrl)
  const towerUrls =
    id === 'citadel'
      ? spriteCandidates(
          themeSpriteUrl,
          buildingContentId('citadel:tower'),
          def.cornerTowerSpriteUrl,
        )
      : []
  return (
    <button
      type="button"
      className={`city-scene__building city-scene__building--${def.category}${
        artLoaded ? ' city-scene__building--art' : ''
      }`}
      style={
        {
          left: `${slot.left}%`,
          top: `${slot.top}%`,
          width: `${slot.width}%`,
          height: `${slot.height}%`,
          '--city-shadow-left': `${SHADOW.leftPercent}%`,
          '--city-shadow-bottom': `${SHADOW.bottomPercent}%`,
          '--city-shadow-width': `${SHADOW.widthPercent}%`,
          '--city-shadow-height': `${SHADOW.heightPercent}%`,
          '--city-shadow-blur': `${SHADOW.blurSceneWidthPercent}cqw`,
          '--city-shadow-opacity': SHADOW.opacity,
          '--city-shadow-color': SHADOW.color.join(' '),
        } as React.CSSProperties
      }
      onClick={() => onOpenBuilding(id)}
    >
      {spriteUrls.length > 0 && (
        <FallbackImage
          key={spriteUrls.join('|')}
          className="city-scene__sprite"
          candidates={spriteUrls}
          onLoad={() => setArtLoaded(true)}
          onAttemptError={() => setArtLoaded(false)}
        />
      )}
      {towerUrls.length > 0 && (
        <FallbackImage
          key={towerUrls.join('|')}
          className="city-scene__sprite city-scene__sprite--tower"
          candidates={towerUrls}
          style={{
            width: `${TOWER.widthPercent}%`,
            right: `${TOWER.rightPercent}%`,
            bottom: `${TOWER.bottomPercent}%`,
          }}
        />
      )}
      {id === 'townhall' && <FactionFlag faction={faction} />}
      <span className="city-scene__label">{buildingDisplayName(id, faction)}</span>
    </button>
  )
}

interface CitySceneProps {
  buildings: readonly string[]
  faction: FactionId
  onOpenBuilding: (buildingId: string) => void
}

/** Zoom stops for the scene (operator: "standard ways to zoom in/out").
 * 1 = the whole city fits the sheet without scrolling (see `.city-scene`
 * sizing in styles.css); higher stops enlarge the scene inside the
 * scrollable viewport, so panning is ordinary scroll/drag. */
const ZOOM_STOPS = citySceneLayout.zoomStops

export function CityScene({ buildings, faction, onOpenBuilding }: CitySceneProps) {
  const { spriteUrl: themeSpriteUrl } = useTheme()
  const [zoomIndex, setZoomIndex] = useState(0)
  const [failedBackdropOverride, setFailedBackdropOverride] = useState<string>()
  const known = buildings.filter((id) => BUILDINGS[id])
  const placed = known
    .filter((id) => SCENE_SLOTS[id])
    .sort((a, b) => {
      const first = SCENE_SLOTS[a]!
      const second = SCENE_SLOTS[b]!
      return (
        first.depth - second.depth ||
        first.top + first.height - (second.top + second.height) ||
        a.localeCompare(b)
      )
    })
  const overflow = known.filter((id) => !SCENE_SLOTS[id])
  const backdropOverride = themeSpriteUrl(cityBackdropContentId())
  const showBackdropOverride =
    Boolean(backdropOverride) && backdropOverride !== failedBackdropOverride
  const zoom = ZOOM_STOPS[zoomIndex]!
  return (
    <>
      <div className="city-scene-viewport">
        <div
          className="city-scene"
          role="group"
          aria-label="City buildings"
          style={{ '--city-zoom': zoom } as React.CSSProperties}
        >
          {showBackdropOverride && backdropOverride ? (
            <FallbackImage
              key={backdropOverride}
              className="city-scene__backdrop"
              candidates={[backdropOverride]}
              onExhausted={() => setFailedBackdropOverride(backdropOverride)}
            />
          ) : (
            <span className="city-scene__backdrop-tiles" aria-hidden style={{ display: 'block' }}>
              {BACKDROP_TILES.map((tile) => (
                <span
                  key={tile.id}
                  className="city-scene__backdrop-cell"
                  data-backdrop-tile={tile.id}
                  style={{
                    position: 'absolute',
                    overflow: 'hidden',
                    left: `${tile.left}%`,
                    top: `${tile.top}%`,
                    width: `${tile.width}%`,
                    height: `${tile.height}%`,
                  }}
                >
                  <FallbackImage
                    className="city-scene__backdrop-tile"
                    candidates={[tile.src]}
                    style={BACKDROP_TILE_IMAGE_STYLE}
                  />
                </span>
              ))}
            </span>
          )}
          {placed.map((id) => (
            <SceneBuilding
              key={id}
              id={id}
              slot={SCENE_SLOTS[id]!}
              faction={faction}
              onOpenBuilding={onOpenBuilding}
            />
          ))}
        </div>
      </div>
      <div className="city-scene-zoom" role="group" aria-label="City zoom">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoomIndex === 0}
          onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoomIndex === ZOOM_STOPS.length - 1}
          onClick={() => setZoomIndex((i) => Math.min(ZOOM_STOPS.length - 1, i + 1))}
        >
          +
        </button>
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
