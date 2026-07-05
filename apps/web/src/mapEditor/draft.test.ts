import { describe, expect, it } from 'vitest'
import { validateMapDefinition } from '@aop/engine'
import { MAP_VALIDATION_LIMITS } from '@aop/content'
import {
  addStartPosition,
  blankDraft,
  draftFromGenerated,
  draftToMapDefinition,
  eraseEntityAt,
  floodFillTile,
  hasEntityAt,
  nearestMapSize,
  paintTile,
  placeEncounter,
  placeResourceMarker,
} from './draft'

describe('blankDraft', () => {
  it('creates an all-deep-water map of the requested size with a unique id', () => {
    const a = blankDraft('small', 'A')
    const b = blankDraft('small', 'B')
    expect(a.width).toBe(24)
    expect(a.height).toBe(24)
    expect(a.tiles).toHaveLength(24 * 24)
    expect(a.tiles.every((t) => t.type === 'deep')).toBe(true)
    expect(a.startPositions).toEqual([])
    expect(a.id).not.toBe(b.id)
  })
})

describe('draftFromGenerated', () => {
  it('captures a seeded generateMap() output as a sculptable draft', () => {
    const draft = draftFromGenerated(7, 'medium', 3, 2, 'Rolled Seed 7')
    expect(draft.width).toBe(32)
    expect(draft.startPositions).toHaveLength(3)
    expect(draft.encounters).toEqual([])
    expect(draft.resourceMarkers).toEqual([])
    // Deterministic: same seed/size/playerCount produces the same geometry.
    const again = draftFromGenerated(7, 'medium', 3, 2, 'Rolled Seed 7')
    expect(again.tiles).toEqual(draft.tiles)
    expect(again.startPositions).toEqual(draft.startPositions)
  })

  it('validates clean against the engine validator', () => {
    const draft = draftFromGenerated(11, 'medium', 4, 2, 'Valid Draft')
    const result = validateMapDefinition(draftToMapDefinition(draft), MAP_VALIDATION_LIMITS)
    expect(result).toEqual({ valid: true, errors: [] })
  })
})

describe('paintTile', () => {
  it('changes a tile in bounds and leaves out-of-bounds coords untouched', () => {
    const draft = blankDraft('small')
    const painted = paintTile(draft, { x: 2, y: 2 }, 'land')
    expect(painted.tiles[2 * draft.width + 2]!.type).toBe('land')
    const untouched = paintTile(draft, { x: -1, y: 0 }, 'land')
    expect(untouched).toBe(draft)
  })
})

describe('floodFillTile', () => {
  it('repaints only the contiguous region sharing the original type', () => {
    let draft = blankDraft('small')
    // Carve an isolated 2x2 land block away from the flood-fill target area.
    draft = paintTile(draft, { x: 20, y: 20 }, 'land')
    draft = paintTile(draft, { x: 21, y: 20 }, 'land')
    const filled = floodFillTile(draft, { x: 0, y: 0 }, 'shallows')
    expect(filled.tiles[0]!.type).toBe('shallows')
    // The isolated land block is untouched — fill didn't leak past land tiles.
    expect(filled.tiles[20 * draft.width + 20]!.type).toBe('land')
  })

  it('is a no-op when the region is already the target type', () => {
    const draft = blankDraft('small')
    const result = floodFillTile(draft, { x: 0, y: 0 }, 'deep')
    expect(result).toBe(draft)
  })
})

describe('entity placement', () => {
  it('adds start positions up to the 8-player cap and refuses beyond it', () => {
    let draft = blankDraft('large')
    for (let i = 0; i < 8; i++) {
      draft = addStartPosition(draft, { x: i, y: 0 })
    }
    expect(draft.startPositions).toHaveLength(8)
    const overflowed = addStartPosition(draft, { x: 9, y: 0 })
    expect(overflowed.startPositions).toHaveLength(8)
  })

  it('refuses to stack entities of different kinds on the same tile', () => {
    let draft = blankDraft('small')
    draft = addStartPosition(draft, { x: 5, y: 5 })
    const withEncounter = placeEncounter(draft, { x: 5, y: 5 }, 'merchant')
    expect(withEncounter.encounters).toEqual([])
    expect(hasEntityAt(withEncounter, { x: 5, y: 5 })).toBe(true)
  })

  it('places encounters and resource markers on empty tiles', () => {
    let draft = blankDraft('small')
    draft = placeEncounter(draft, { x: 3, y: 3 }, 'natives')
    draft = placeResourceMarker(draft, { x: 4, y: 4 }, 'gold')
    expect(draft.encounters).toEqual([{ kind: 'natives', position: { x: 3, y: 3 } }])
    expect(draft.resourceMarkers).toEqual([{ kind: 'gold', position: { x: 4, y: 4 } }])
  })

  it('erases whichever entity sits at a coord', () => {
    let draft = blankDraft('small')
    draft = addStartPosition(draft, { x: 1, y: 1 })
    draft = placeEncounter(draft, { x: 2, y: 2 }, 'settlers')
    draft = placeResourceMarker(draft, { x: 3, y: 3 }, 'rum')
    const erased = eraseEntityAt(draft, { x: 2, y: 2 })
    expect(erased.encounters).toEqual([])
    expect(erased.startPositions).toEqual([{ x: 1, y: 1 }])
    expect(erased.resourceMarkers).toHaveLength(1)
  })
})

describe('draftToMapDefinition', () => {
  it('carries resource markers through as resourceNodes (#101), alongside encounters', () => {
    let draft = blankDraft('small')
    draft = placeEncounter(draft, { x: 3, y: 3 }, 'merchant')
    draft = placeResourceMarker(draft, { x: 4, y: 4 }, 'timber')
    const def = draftToMapDefinition(draft)
    expect(def.encounters).toEqual([{ kind: 'merchant', position: { x: 3, y: 3 } }])
    expect(def.resourceNodes).toEqual([{ kind: 'timber', position: { x: 4, y: 4 } }])
    expect('resourceMarkers' in def).toBe(false)
  })
})

describe('nearestMapSize', () => {
  it('maps a draft width back to the closest MapSize label', () => {
    expect(nearestMapSize(24)).toBe('small')
    expect(nearestMapSize(32)).toBe('medium')
    expect(nearestMapSize(40)).toBe('large')
  })
})
