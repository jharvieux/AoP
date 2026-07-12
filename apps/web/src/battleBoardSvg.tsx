import { FACTIONS } from '@aop/content'
import type { HexCoord } from '@aop/engine'
import { UI_ICON } from './uiIcons'

/**
 * Shared SVG primitives for the hex battle board (#39/#93): geometry, the
 * terrain palette, and the troop-stack token. Used by both the post-battle
 * playback sheet and the interactive boarding command sheet so the two render
 * as the same battlefield.
 */

export const HEX_SIZE = 22
const SQRT3 = Math.sqrt(3)

// CSS custom-property references (styles.css :root, #301), not hardcoded
// hex — these render as SVG `fill`/`stroke` attribute values in the DOM,
// which resolve `var()` the same way an inline style would, so the design
// tokens stay the single palette source instead of forking their own copy.
export const TERRAIN_FILL: Record<string, string> = {
  open: 'var(--color-terrain-open)',
  rough: 'var(--color-terrain-rough)',
  cover: 'var(--color-terrain-cover)',
  blocked: 'var(--color-terrain-blocked)',
}

/** `url(#...)` refs into `<BoardDefs>`'s patterns — textured stand-ins for the
 * flat `TERRAIN_FILL` colors above (#303), closer to the world map's textured
 * tiles than a single solid fill. `TERRAIN_FILL` itself stays exported as the
 * pattern's base color and for anything that still wants a flat swatch. */
export const TERRAIN_PATTERN_FILL: Record<string, string> = {
  open: 'url(#terrain-open)',
  rough: 'url(#terrain-rough)',
  cover: 'url(#terrain-cover)',
  blocked: 'url(#terrain-blocked)',
}

export const SIDE_FILL: Record<'attacker' | 'defender', string> = {
  attacker: 'var(--color-battle-attacker)',
  defender: 'var(--color-battle-defender)',
}

/** Lighter radial-gradient highlight for `<BoardDefs>`'s token gradients
 * (#303) — gives the flat `SIDE_FILL` a bit of shading, still token-sourced. */
export const SIDE_HIGHLIGHT: Record<'attacker' | 'defender', string> = {
  attacker: 'var(--color-battle-attacker-highlight)',
  defender: 'var(--color-battle-defender-highlight)',
}

export const TOKEN_STROKE = 'var(--color-battle-token-stroke)'

export function hexCenter(hex: HexCoord): { x: number; y: number } {
  return {
    x: HEX_SIZE * SQRT3 * (hex.col + 0.5 * (hex.row % 2)) + HEX_SIZE,
    y: HEX_SIZE * 1.5 * hex.row + HEX_SIZE,
  }
}

export function hexPoints(cx: number, cy: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    pts.push(
      `${(cx + HEX_SIZE * 0.94 * Math.cos(angle)).toFixed(1)},${(cy + HEX_SIZE * 0.94 * Math.sin(angle)).toFixed(1)}`,
    )
  }
  return pts.join(' ')
}

export function boardSvgSize(width: number, height: number): { width: number; height: number } {
  return {
    width: HEX_SIZE * SQRT3 * (width + 0.5) + HEX_SIZE,
    height: HEX_SIZE * (1.5 * height + 0.5) + HEX_SIZE,
  }
}

/** One `<pattern>` backing a `TERRAIN_PATTERN_FILL` entry: the flat terrain
 * color plus a couple of low-opacity accent strokes, so the hex reads as a
 * textured surface instead of a single flat swatch (#303). Cheap — a handful
 * of static SVG primitives tiled by the pattern, not per-frame work. */
function TerrainPattern({ id, base, accent }: { id: string; base: string; accent: string }) {
  return (
    <pattern
      id={id}
      width="9"
      height="9"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(20)"
    >
      <rect width="9" height="9" fill={base} />
      <line x1="0" y1="0" x2="0" y2="9" stroke={accent} strokeWidth="1.4" strokeOpacity="0.4" />
      <line
        x1="4.5"
        y1="0"
        x2="4.5"
        y2="9"
        stroke={accent}
        strokeWidth="0.7"
        strokeOpacity="0.25"
      />
    </pattern>
  )
}

/** Shared `<defs>` for the battle board: terrain textures (#303) and the
 * token gradients/shadow below. Render once per `<svg>`, before anything that
 * references a `url(#...)` fill or filter. */
export function BoardDefs() {
  return (
    <defs>
      <TerrainPattern
        id="terrain-open"
        base={TERRAIN_FILL.open!}
        accent="var(--color-terrain-open-accent)"
      />
      <TerrainPattern
        id="terrain-rough"
        base={TERRAIN_FILL.rough!}
        accent="var(--color-terrain-rough-accent)"
      />
      <TerrainPattern
        id="terrain-cover"
        base={TERRAIN_FILL.cover!}
        accent="var(--color-terrain-cover-accent)"
      />
      <TerrainPattern
        id="terrain-blocked"
        base={TERRAIN_FILL.blocked!}
        accent="var(--color-terrain-blocked-accent)"
      />
      <radialGradient id="token-attacker" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor={SIDE_HIGHLIGHT.attacker} />
        <stop offset="100%" stopColor={SIDE_FILL.attacker} />
      </radialGradient>
      <radialGradient id="token-defender" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor={SIDE_HIGHLIGHT.defender} />
        <stop offset="100%" stopColor={SIDE_FILL.defender} />
      </radialGradient>
      <filter id="token-shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="1.2" stdDeviation="1" floodColor="#000000" floodOpacity="0.45" />
      </filter>
    </defs>
  )
}

interface TerrainHexProps {
  hex: HexCoord
  terrain: string
  onClick?: () => void
}

/** One textured terrain hex (#303) — shared so the playback sheet and the
 * interactive command sheet render the same battlefield surface. */
export function TerrainHex({ hex, terrain, onClick }: TerrainHexProps) {
  const { x, y } = hexCenter(hex)
  return (
    <polygon
      points={hexPoints(x, y)}
      fill={TERRAIN_PATTERN_FILL[terrain] ?? TERRAIN_PATTERN_FILL.open}
      stroke={TOKEN_STROKE}
      strokeWidth="1"
      onClick={onClick}
    />
  )
}

function unitDefinition(unitId: string) {
  return Object.values(FACTIONS)
    .flatMap((f) => f.units)
    .find((u) => u.id === unitId)
}

/** Synthetic city-turret board id (#435/#441): `turret:<faction>:<tier>`, built
 * by @aop/shared's `turretUnitId`. It exists only in the combat-stats snapshot,
 * never in `FACTIONS`, so the roster lookups above can't name it. */
function isTurretUnitId(unitId: string): boolean {
  return unitId.startsWith('turret:')
}

/** Display-name fallback for a board unit id (#441): roster name, a themed
 * name for the synthetic turret pieces, else the raw id. Callers still wrap
 * this in the theme resolver so packs can rename roster units. */
export function boardUnitFallbackName(unitId: string): string {
  if (isTurretUnitId(unitId)) return 'Turret'
  return unitDefinition(unitId)?.name ?? unitId
}

/**
 * Per-unit-tier troop icon (#26/#89): every tier 1-4 across all 5 factions has art;
 * undefined only for a future faction/tier added without art, in which case the token
 * keeps its plain 2-letter fallback. Turrets (#441) reuse the crossed-cannons
 * attack icon — no dedicated turret art exists yet.
 */
export function unitTierIconUrl(unitId: string): string | undefined {
  if (isTurretUnitId(unitId)) return UI_ICON.attack
  for (const faction of Object.values(FACTIONS)) {
    const def = faction.units.find((u) => u.id === unitId)
    if (def) return faction.unitTierSpriteUrls?.[def.tier]
  }
  return undefined
}

interface StackTokenProps {
  side: 'attacker' | 'defender'
  unitId: string
  count: number
  position: HexCoord
  /** Themed display name; the token shows its first two letters when no icon exists. */
  label: string
  /** Render translucent and non-interactive — the move/attack preview token. */
  ghost?: boolean
  onClick?: (() => void) | undefined
  /**
   * Distinct on every hit this stack takes (#303), e.g. `` `hit-${step}` ``.
   * Remounts just the flash/shake overlay so the animation restarts even on
   * back-to-back hits of the same stack, without disturbing the position
   * transition below (that one stays keyed by stack id so it doesn't remount).
   */
  hitKey?: string | undefined
}

/** A troop-stack token (#39/#93). Positioned via an SVG `transform` attribute
 * on the outer group rather than absolute `cx`/`cy` on each shape (#303): the
 * `battle-board-svg__token-pos` class below gives that attribute a CSS
 * transition, so a stack sliding from one hex to the next during playback
 * interpolates smoothly instead of popping straight to the new hex. */
export function StackToken({
  side,
  unitId,
  count,
  position,
  label,
  ghost,
  onClick,
  hitKey,
}: StackTokenProps) {
  const { x, y } = hexCenter(position)
  const iconUrl = unitTierIconUrl(unitId)
  const contentClass = [ghost && 'battle-board-svg__ghost', hitKey && 'battle-board-svg__hit']
    .filter(Boolean)
    .join(' ')
  return (
    <g
      transform={`translate(${x} ${y})`}
      className="battle-board-svg__token-pos"
      style={onClick ? { cursor: 'pointer' } : undefined}
      onClick={onClick}
    >
      {/* Keyed by `hitKey` when present (#303) so a fresh hit — even on a
          stack that was already hit last step — remounts this group and
          restarts the shake/flash keyframes instead of no-op'ing. */}
      <g key={hitKey} className={contentClass || undefined} filter="url(#token-shadow)">
        <circle
          r={HEX_SIZE * 0.62}
          fill={`url(#token-${side})`}
          stroke={TOKEN_STROKE}
          strokeWidth="1.5"
        />
        {iconUrl ? (
          <image
            href={iconUrl}
            x={-HEX_SIZE * 0.5}
            y={-HEX_SIZE * 0.58}
            width={HEX_SIZE}
            height={HEX_SIZE}
            clipPath="circle(46%)"
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <text x={0} y={-2} textAnchor="middle" className="battle-board-svg__unit">
            {label.slice(0, 2)}
          </text>
        )}
        <text x={0} y={10} textAnchor="middle" className="battle-board-svg__count">
          {count}
        </text>
        {hitKey && <circle r={HEX_SIZE * 0.62} className="battle-board-svg__hit-flash" />}
      </g>
    </g>
  )
}
