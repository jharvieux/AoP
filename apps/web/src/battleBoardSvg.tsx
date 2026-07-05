import { FACTIONS } from '@aop/content'
import type { HexCoord } from '@aop/engine'

/**
 * Shared SVG primitives for the hex battle board (#39/#93): geometry, the
 * terrain palette, and the troop-stack token. Used by both the post-battle
 * playback sheet and the interactive boarding command sheet so the two render
 * as the same battlefield.
 */

export const HEX_SIZE = 22
const SQRT3 = Math.sqrt(3)

export const TERRAIN_FILL: Record<string, string> = {
  open: '#1d3345',
  rough: '#4a3c22',
  cover: '#1f4a2a',
  blocked: '#3a3f45',
}

export const SIDE_FILL: Record<'attacker' | 'defender', string> = {
  attacker: '#a33c2e',
  defender: '#2e5da3',
}

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

export function unitDefinition(unitId: string) {
  return Object.values(FACTIONS)
    .flatMap((f) => f.units)
    .find((u) => u.id === unitId)
}

/**
 * Per-unit-tier troop icon (#26/#89): undefined for tier 1 or any faction/tier
 * that hasn't been generated yet, in which case the token keeps its plain
 * 2-letter fallback.
 */
export function unitTierIconUrl(unitId: string): string | undefined {
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
}

export function StackToken({
  side,
  unitId,
  count,
  position,
  label,
  ghost,
  onClick,
}: StackTokenProps) {
  const { x, y } = hexCenter(position)
  const iconUrl = unitTierIconUrl(unitId)
  return (
    <g
      className={ghost ? 'battle-board-svg__ghost' : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
      onClick={onClick}
    >
      <circle
        cx={x}
        cy={y}
        r={HEX_SIZE * 0.62}
        fill={SIDE_FILL[side]}
        stroke="#0e1c26"
        strokeWidth="1.5"
      />
      {iconUrl ? (
        <image
          href={iconUrl}
          x={x - HEX_SIZE * 0.5}
          y={y - HEX_SIZE * 0.58}
          width={HEX_SIZE}
          height={HEX_SIZE}
          clipPath="circle(46%)"
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <text x={x} y={y - 2} textAnchor="middle" className="battle-board-svg__unit">
          {label.slice(0, 2)}
        </text>
      )}
      <text x={x} y={y + 10} textAnchor="middle" className="battle-board-svg__count">
        {count}
      </text>
    </g>
  )
}
