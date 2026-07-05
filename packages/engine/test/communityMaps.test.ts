import {
  COMMUNITY_MAP_PAGE_MAX,
  MAP_CODE_MAX_BYTES,
  MAP_NAME_MAX_LENGTH,
  PUBLISH_MAX_PER_WINDOW,
  clampCommunityMapLimit,
  decodeCommunityMapCursor,
  decodeMapCodePayload,
  encodeCommunityMapCursor,
  encodeMapCodePayload,
  escapeIlikePattern,
  mapCodeExceedsSizeLimit,
  normalizeMapName,
  normalizeReportReason,
  publishRateLimited,
  selectCommunityMaps,
  type CommunityMapSummary,
  type MapCodePayload,
} from '@aop/shared'
import { describe, expect, it } from 'vitest'
import {
  generateMap,
  mapToDefinition,
  validateMapDefinition,
  type EncounterPlacement,
} from '../src'
import { MAP_VALIDATION_LIMITS } from './fixtures'

// Available in every test runtime (Node >= 20); declared locally because the
// engine's tsconfig lib is pure ES2022 by design (no host APIs).
declare function btoa(data: string): string

function summary(overrides: Partial<CommunityMapSummary>): CommunityMapSummary {
  return {
    mapId: 'map-1',
    name: 'Skull Atoll',
    authorId: 'author-1',
    authorName: 'Blackbeard',
    width: 24,
    height: 24,
    playerCount: 2,
    downloadCount: 0,
    createdAt: '2026-07-07T00:00:00Z',
    ...overrides,
  }
}

describe('server-side publish re-validation path (#63 Tier 2)', () => {
  it('a generated map survives encode -> decode -> engine validation, as publish-map runs it', () => {
    const def = mapToDefinition(generateMap(7, 'small', 2, 2))
    const payload: MapCodePayload = {
      name: 'Round Trip',
      width: def.width,
      height: def.height,
      tiles: def.tiles,
      startPositions: def.startPositions,
      encounters: [],
      resourceMarkers: [],
    }
    const decoded = decodeMapCodePayload(encodeMapCodePayload(payload))
    expect(decoded.tiles).toEqual(def.tiles)
    expect(decoded.startPositions).toEqual(def.startPositions)

    const result = validateMapDefinition(
      { ...def, tiles: decoded.tiles, startPositions: decoded.startPositions },
      MAP_VALIDATION_LIMITS,
    )
    expect(result.valid).toBe(true)
  })

  it('rejects a decode bomb: a tiny code declaring huge dimensions never allocates', () => {
    const forged = `AOPMAP1:${btoa(
      JSON.stringify({
        v: 1,
        name: 'bomb',
        width: 100_000,
        height: 100_000,
        runs: [['d', -1, 10_000_000_000]],
        startPositions: [],
      }),
    )}`
    expect(() => decodeMapCodePayload(forged)).toThrow(/dimensions/)
  })

  it('rejects tile runs that overrun the declared dimensions before expanding them', () => {
    const forged = `AOPMAP1:${btoa(
      JSON.stringify({
        v: 1,
        name: 'overrun',
        width: 24,
        height: 24,
        runs: [['d', -1, 24 * 24 + 1]],
        startPositions: [],
      }),
    )}`
    expect(() => decodeMapCodePayload(forged)).toThrow(/exceed/)
  })

  it('rejects malformed start positions and entities', () => {
    const base = { v: 1, name: 'x', width: 1, height: 1, runs: [['d', -1, 1]] }
    const withStarts = `AOPMAP1:${btoa(JSON.stringify({ ...base, startPositions: [{ x: 'a', y: 0 }] }))}`
    expect(() => decodeMapCodePayload(withStarts)).toThrow(/start positions/)
    const withEnc = `AOPMAP1:${btoa(
      JSON.stringify({
        ...base,
        startPositions: [],
        encounters: [{ kind: 5, position: { x: 0, y: 0 } }],
      }),
    )}`
    expect(() => decodeMapCodePayload(withEnc)).toThrow(/encounters/)
  })

  it('unknown entity kinds decode structurally but fail engine validation (the publish gate)', () => {
    const def = mapToDefinition(generateMap(7, 'small', 2, 2))
    const payload: MapCodePayload = {
      name: 'Sneaky',
      width: def.width,
      height: def.height,
      tiles: def.tiles,
      startPositions: def.startPositions,
      encounters: [{ kind: 'kraken', position: { x: 0, y: 0 } }],
      resourceMarkers: [],
    }
    const decoded = decodeMapCodePayload(encodeMapCodePayload(payload))
    const result = validateMapDefinition(
      // The same cast publish-map performs — safe only because validation runs next.
      { ...def, encounters: decoded.encounters as EncounterPlacement[] },
      MAP_VALIDATION_LIMITS,
    )
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'encounter-invalid-kind')).toBe(true)
  })
})

describe('publish policy', () => {
  it('caps the map code at MAP_CODE_MAX_BYTES, measured in UTF-8 bytes', () => {
    expect(mapCodeExceedsSizeLimit('a'.repeat(MAP_CODE_MAX_BYTES))).toBe(false)
    expect(mapCodeExceedsSizeLimit('a'.repeat(MAP_CODE_MAX_BYTES + 1))).toBe(true)
    // Multibyte characters count as bytes, not chars.
    expect(mapCodeExceedsSizeLimit('海'.repeat(MAP_CODE_MAX_BYTES / 2))).toBe(true)
  })

  it('rate-limits at PUBLISH_MAX_PER_WINDOW, not before', () => {
    expect(publishRateLimited(PUBLISH_MAX_PER_WINDOW - 1)).toBe(false)
    expect(publishRateLimited(PUBLISH_MAX_PER_WINDOW)).toBe(true)
  })

  it('normalizes names: trims, collapses whitespace, enforces 1..60', () => {
    expect(normalizeMapName('  Skull   Atoll  ')).toBe('Skull Atoll')
    expect(normalizeMapName('a'.repeat(MAP_NAME_MAX_LENGTH))).toHaveLength(MAP_NAME_MAX_LENGTH)
    expect(normalizeMapName('a'.repeat(MAP_NAME_MAX_LENGTH + 1))).toBeNull()
    expect(normalizeMapName('   ')).toBeNull()
    expect(normalizeMapName(42)).toBeNull()
    expect(normalizeMapName(undefined)).toBeNull()
  })
})

describe('report policy', () => {
  it('treats absent/blank reasons as null and clips over-long ones', () => {
    expect(normalizeReportReason(undefined)).toBeNull()
    expect(normalizeReportReason('  ')).toBeNull()
    expect(normalizeReportReason(123)).toBeNull()
    expect(normalizeReportReason(' spam map ')).toBe('spam map')
    expect(normalizeReportReason('x'.repeat(600))).toHaveLength(500)
  })
})

describe('browse policy (selectCommunityMaps)', () => {
  const older = summary({ mapId: 'm-old', createdAt: '2026-07-06T00:00:00Z', name: 'Old Cove' })
  const newer = summary({ mapId: 'm-new', createdAt: '2026-07-07T00:00:00Z', name: 'New Reef' })
  const tieA = summary({ mapId: 'm-a', createdAt: '2026-07-07T00:00:00Z', name: 'Tie A' })

  it('sorts newest first with mapId as a stable tiebreaker', () => {
    const result = selectCommunityMaps([older, tieA, newer])
    expect(result.map((m) => m.mapId)).toEqual(['m-new', 'm-a', 'm-old'])
  })

  it('search matches name substrings case-insensitively', () => {
    expect(selectCommunityMaps([older, newer], { search: 'reef' })).toEqual([newer])
    expect(selectCommunityMaps([older, newer], { search: 'COVE' })).toEqual([older])
    expect(selectCommunityMaps([older, newer], { search: '' })).toHaveLength(2)
  })

  it('pages past same-timestamp ties with the composite cursor', () => {
    const cursor = decodeCommunityMapCursor(
      encodeCommunityMapCursor({ createdAt: newer.createdAt, mapId: newer.mapId }),
    )
    const result = selectCommunityMaps([older, tieA, newer], { before: cursor })
    // m-new is excluded; m-a shares its timestamp but sorts after it, so it stays.
    expect(result.map((m) => m.mapId)).toEqual(['m-a', 'm-old'])
  })

  it('clamps the limit into 1..COMMUNITY_MAP_PAGE_MAX', () => {
    expect(clampCommunityMapLimit(undefined)).toBe(COMMUNITY_MAP_PAGE_MAX)
    expect(clampCommunityMapLimit(0)).toBe(1)
    expect(clampCommunityMapLimit(10_000)).toBe(COMMUNITY_MAP_PAGE_MAX)
  })

  it('rejects malformed cursors instead of guessing', () => {
    expect(decodeCommunityMapCursor(null)).toBeNull()
    expect(decodeCommunityMapCursor('no-separator')).toBeNull()
    expect(decodeCommunityMapCursor('|leading')).toBeNull()
    expect(decodeCommunityMapCursor('trailing|')).toBeNull()
  })
})

describe('escapeIlikePattern', () => {
  it('escapes SQL LIKE wildcards so a search term cannot widen the query', () => {
    expect(escapeIlikePattern('100% _cool_ \\maps')).toBe('100\\% \\_cool\\_ \\\\maps')
    expect(escapeIlikePattern('plain')).toBe('plain')
  })
})
