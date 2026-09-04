import { BUILDINGS, FACTIONS } from '@aop/content'
// @ts-expect-error Vitest supplies Node built-ins; the browser app intentionally omits Node types.
import { readFileSync, statSync } from 'node:fs'
// @ts-expect-error Vitest supplies Node built-ins; the browser app intentionally omits Node types.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PUBLIC_ART_URL = new URL('../public/art/', import.meta.url)
const MAX_ASSET_BYTES = 300 * 1024
const MAX_FULLY_BUILT_BYTES = 3 * 1024 * 1024

function cityAssetPath(url: string): string {
  expect(url.startsWith('/art/city/')).toBe(true)
  return fileURLToPath(new URL(url.replace('/art/', ''), PUBLIC_ART_URL))
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function readUIntLE(bytes: Uint8Array, offset: number, length: number): number {
  let value = 0
  for (let index = 0; index < length; index += 1) value += bytes[offset + index]! * 2 ** (index * 8)
  return value
}

function includesAscii(bytes: Uint8Array, value: string): boolean {
  const needle = new TextEncoder().encode(value)
  return bytes.some((_, offset) => needle.every((byte, index) => bytes[offset + index] === byte))
}

function indexOfBytes(bytes: Uint8Array, needle: readonly number[], from: number): number {
  for (let offset = from; offset <= bytes.length - needle.length; offset += 1) {
    if (needle.every((byte, index) => bytes[offset + index] === byte)) return offset
  }
  return -1
}

function webpDimensions(bytes: Uint8Array): readonly [number, number] {
  expect(ascii(bytes, 0, 4)).toBe('RIFF')
  expect(ascii(bytes, 8, 4)).toBe('WEBP')
  const kind = ascii(bytes, 12, 4)
  if (kind === 'VP8X') {
    return [readUIntLE(bytes, 24, 3) + 1, readUIntLE(bytes, 27, 3) + 1]
  }
  if (kind === 'VP8 ') {
    const marker = indexOfBytes(bytes, [0x9d, 0x01, 0x2a], 20)
    expect(marker).toBeGreaterThan(0)
    return [readUIntLE(bytes, marker + 3, 2) & 0x3fff, readUIntLE(bytes, marker + 5, 2) & 0x3fff]
  }
  throw new Error(`unsupported WebP chunk ${kind}`)
}

describe('city production art assets', () => {
  const buildingUrls = Object.values(BUILDINGS).map((building) => building.spriteUrl!)
  const towerUrl = BUILDINGS.citadel!.cornerTowerSpriteUrl!
  const runtimeUrls = ['/art/city/backdrop.webp', ...buildingUrls, towerUrl]

  it('ships one WebP for every exact building id and the citadel tower pseudo-id', () => {
    expect(Object.keys(BUILDINGS)).toHaveLength(14)
    expect(new Set(buildingUrls).size).toBe(14)
    for (const url of runtimeUrls) {
      expect(url.endsWith('.webp')).toBe(true)
      expect(statSync(cityAssetPath(url)).isFile()).toBe(true)
    }
    expect(BUILDINGS.stoneWall!.spriteUrl).toBe('/art/city/stoneWall.webp')
    expect(towerUrl).toBe('/art/city/citadel-tower.webp')
  })

  it('keeps every file under 300 KiB with alpha only on constructed elements', () => {
    for (const url of runtimeUrls) {
      const path = cityAssetPath(url)
      const bytes: Uint8Array = readFileSync(path)
      expect(bytes.byteLength, url).toBeLessThanOrEqual(MAX_ASSET_BYTES)
      expect(includesAscii(bytes, 'EXIF'), `${url} EXIF`).toBe(false)
      expect(includesAscii(bytes, 'XMP '), `${url} XMP`).toBe(false)
      expect(includesAscii(bytes, 'ICCP'), `${url} ICC`).toBe(false)
      const [width, height] = webpDimensions(bytes)
      if (url.endsWith('/backdrop.webp')) {
        expect([width, height]).toEqual([1024, 704])
        expect(includesAscii(bytes, 'ALPH')).toBe(false)
      } else {
        expect(Math.max(width, height), url).toBeGreaterThanOrEqual(850)
        expect(Math.max(width, height), url).toBeLessThanOrEqual(900)
        expect(includesAscii(bytes, 'ALPH'), `${url} lacks alpha`).toBe(true)
      }
    }
  })

  it('keeps a fully built first-open scene, tower, backdrop, and largest flag below 3 MiB', () => {
    const cityBytes = runtimeUrls.reduce((sum, url) => sum + statSync(cityAssetPath(url)).size, 0)
    const largestFlag = Math.max(
      ...Object.values(FACTIONS).map(
        (faction) =>
          statSync(
            fileURLToPath(new URL(faction.flagSpriteUrl!.replace('/art/', ''), PUBLIC_ART_URL)),
          ).size,
      ),
    )
    expect(cityBytes + largestFlag).toBeLessThanOrEqual(MAX_FULLY_BUILT_BYTES)
  })
})
