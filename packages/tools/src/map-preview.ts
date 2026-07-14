/**
 * Tile-dump-to-PNG map preview — operator entry point.
 *
 * Renders the authored starting map (or any generated preset) to a PNG so a
 * layout change can be SEEN without booting the app. Dependency-free: the PNG
 * is hand-assembled (IHDR/IDAT/IEND + crc32) over node:zlib deflate.
 *
 * Run from the repo root with:
 *
 *     pnpm --filter @aop/tools exec tsx src/map-preview.ts <out.png> [authored|<size>] [seed] [players]
 *
 * e.g. `... src/map-preview.ts /tmp/starting-map.png authored` (the default)
 * or   `... src/map-preview.ts /tmp/xl.png xlarge 11 4`.
 */

import { GAME_SETUP, STARTING_MAP } from '@aop/content'
import { generateMap } from '@aop/engine'
import type { MapSize } from '@aop/shared'
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const TILE_PX = 8

const COLORS: Record<string, [number, number, number]> = {
  deep: [24, 44, 78],
  shallows: [64, 120, 160],
  land: [96, 148, 72],
  port: [214, 168, 66],
}
const START_COLOR: [number, number, number] = [232, 232, 240]
const NODE_COLOR: [number, number, number] = [186, 85, 160]
const ENCOUNTER_COLOR: [number, number, number] = [220, 90, 60]

interface PreviewMap {
  width: number
  height: number
  tiles: { type: string }[]
  startPositions: { x: number; y: number }[]
  resourceNodes?: { position: { x: number; y: number } }[]
  encounters?: { position: { x: number; y: number } }[]
}

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(
    [...type].map((c) => c.charCodeAt(0)),
    4,
  )
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([8, 2, 0, 0, 0], 8) // 8-bit, truecolor RGB
  // Raw scanlines, each prefixed with filter byte 0.
  const raw = new Uint8Array(height * (1 + width * 3))
  for (let y = 0; y < height; y++) {
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1)
  }
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const parts = [
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ]
  const total = parts.reduce((n, p) => n + p.length, 0)
  const png = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    png.set(p, off)
    off += p.length
  }
  return png
}

function render(map: PreviewMap): Uint8Array {
  const w = map.width * TILE_PX
  const h = map.height * TILE_PX
  const rgb = new Uint8Array(w * h * 3)
  const put = (px: number, py: number, [r, g, b]: [number, number, number]) => {
    const i = (py * w + px) * 3
    rgb[i] = r
    rgb[i + 1] = g
    rgb[i + 2] = b
  }
  const fillTile = (tx: number, ty: number, color: [number, number, number], inset = 0) => {
    for (let dy = inset; dy < TILE_PX - inset; dy++) {
      for (let dx = inset; dx < TILE_PX - inset; dx++) {
        put(tx * TILE_PX + dx, ty * TILE_PX + dy, color)
      }
    }
  }
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      fillTile(x, y, COLORS[map.tiles[y * map.width + x]!.type] ?? [0, 0, 0])
    }
  }
  for (const n of map.resourceNodes ?? []) fillTile(n.position.x, n.position.y, NODE_COLOR, 2)
  for (const e of map.encounters ?? []) fillTile(e.position.x, e.position.y, ENCOUNTER_COLOR, 2)
  for (const s of map.startPositions) fillTile(s.x, s.y, START_COLOR, 2)
  return rgb
}

const out = process.argv[2]
if (!out) {
  console.error(
    'usage: map-preview.ts <out.png> [authored|small|medium|large|xlarge] [seed] [players]',
  )
  process.exit(1)
}
const which = process.argv[3] ?? 'authored'
const map: PreviewMap =
  which === 'authored'
    ? STARTING_MAP
    : generateMap(
        Number(process.argv[4] ?? 11),
        which as MapSize,
        Number(process.argv[5] ?? 4),
        GAME_SETUP.homeIslandRadiusOverrides?.[which as MapSize] ?? GAME_SETUP.homeIslandRadius,
        GAME_SETUP.homeIslandRingRadiusFactor,
      )

writeFileSync(out, encodePng(map.width * TILE_PX, map.height * TILE_PX, render(map)))
console.log(`${out}: ${which} ${map.width}x${map.height} at ${TILE_PX}px/tile`)
