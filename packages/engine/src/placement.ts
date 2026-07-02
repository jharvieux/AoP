import { MAP_DIMENSIONS, type MapSize, type TileCoord } from '@aop/shared'
import { nextInt, type RngState } from './rng'

/**
 * Deterministic starting-city placement: evenly spaced around a ring at map
 * center with seeded jitter. Real terrain-aware placement (rivers, coasts,
 * resource nodes) lands with world map generation (#6) — this exists only
 * so per-player vision (#14) has real, distinct coordinates to work from.
 */
export function placeCities(
  rngState: RngState,
  count: number,
  mapSize: MapSize,
): [RngState, TileCoord[]] {
  const { width, height } = MAP_DIMENSIONS[mapSize]
  const centerX = width / 2
  const centerY = height / 2
  const ringRadius = Math.min(width, height) * 0.35
  const jitter = Math.max(1, Math.floor(Math.min(width, height) * 0.05))

  let state = rngState
  const positions: TileCoord[] = []
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count
    let dx: number
    let dy: number
    ;[state, dx] = nextInt(state, -jitter, jitter)
    ;[state, dy] = nextInt(state, -jitter, jitter)
    const x = Math.round(centerX + ringRadius * Math.cos(angle) + dx)
    const y = Math.round(centerY + ringRadius * Math.sin(angle) + dy)
    positions.push({
      x: Math.min(width - 1, Math.max(0, x)),
      y: Math.min(height - 1, Math.max(0, y)),
    })
  }
  return [state, positions]
}
