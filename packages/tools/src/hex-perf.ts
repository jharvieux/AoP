/**
 * Perf harness for the hex-grid prototype (#348, Phase 1).
 *
 * Times 100 A* searches on the 15×15 hex prototype map against 100 searches on
 * an equivalent 15×15 square-grid GameMap (identical terrain: hex-passable
 * tiles become water, since ships path over water). Both sides use the same
 * deterministic query pairs. Run with:
 *
 *   pnpm --filter @aop/tools exec tsx src/hex-perf.ts
 */
import { HEX_PROTO_HEIGHT, HEX_PROTO_TERRAIN, HEX_PROTO_WIDTH } from '@aop/content'
import {
  findHexPath,
  findPath,
  type GameMap,
  type HexGridMap,
  type OffsetHex,
  type Tile,
} from '@aop/engine'
import type { Coord } from '@aop/shared'

const SEARCHES = 100
const ROUNDS = 20

const hexMap: HexGridMap = {
  width: HEX_PROTO_WIDTH,
  height: HEX_PROTO_HEIGHT,
  passable: HEX_PROTO_TERRAIN.map((t) => t === 'land'),
}

// Same terrain reinterpreted for the naval square grid: passable -> deep water.
const squareMap: GameMap = {
  width: HEX_PROTO_WIDTH,
  height: HEX_PROTO_HEIGHT,
  tiles: HEX_PROTO_TERRAIN.map((t): Tile => ({ type: t === 'land' ? 'deep' : 'land', island: -1 })),
  startPositions: [],
}

const open: OffsetHex[] = []
for (let row = 0; row < HEX_PROTO_HEIGHT; row++) {
  for (let col = 0; col < HEX_PROTO_WIDTH; col++) {
    if (HEX_PROTO_TERRAIN[row * HEX_PROTO_WIDTH + col] === 'land') open.push({ col, row })
  }
}

const pairs: Array<{ from: OffsetHex; to: OffsetHex }> = []
for (let i = 0; i < SEARCHES; i++) {
  pairs.push({ from: open[(i * 37) % open.length]!, to: open[(i * 89 + 53) % open.length]! })
}

function runHex(): number {
  let found = 0
  for (const { from, to } of pairs) {
    if (findHexPath(hexMap, from, to)) found++
  }
  return found
}

function runSquare(): number {
  let found = 0
  for (const { from, to } of pairs) {
    const a: Coord = { x: from.col, y: from.row }
    const b: Coord = { x: to.col, y: to.row }
    if (findPath(squareMap, a, b)) found++
  }
  return found
}

function bench(label: string, fn: () => number): number {
  fn() // warmup (JIT + square-grid water-component cache)
  let best = Infinity
  let found = 0
  for (let round = 0; round < ROUNDS; round++) {
    const start = performance.now()
    found = fn()
    const elapsed = performance.now() - start
    if (elapsed < best) best = elapsed
  }
  console.log(
    `${label}: ${best.toFixed(3)} ms best-of-${ROUNDS} for ${SEARCHES} searches ` +
      `(${((best / SEARCHES) * 1000).toFixed(1)} µs/search, ${found}/${SEARCHES} reachable)`,
  )
  return best
}

console.log(`Map: ${HEX_PROTO_WIDTH}×${HEX_PROTO_HEIGHT}, ${open.length} open tiles`)
const hexMs = bench('hex A*   ', runHex)
const squareMs = bench('square A*', runSquare)
console.log(`ratio hex/square: ${(hexMs / squareMs).toFixed(2)}×`)
