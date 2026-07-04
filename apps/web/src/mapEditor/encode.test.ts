import { describe, expect, it } from 'vitest'
import { draftFromGenerated, placeEncounter, placeResourceMarker, renameDraft } from './draft'
import { decodeMapCode, encodeMapCode } from './encode'

describe('map code encode/decode', () => {
  it('round-trips a sculpted draft (tiles, start positions, encounters, markers)', () => {
    let draft = draftFromGenerated(42, 'small', 2, 2, 'Sculpted Isle ⚓')
    draft = placeEncounter(draft, { x: 1, y: 1 }, 'merchant')
    draft = placeResourceMarker(draft, { x: 2, y: 2 }, 'gold')

    const code = encodeMapCode(draft)
    expect(code.startsWith('AOPMAP1:')).toBe(true)
    const decoded = decodeMapCode(code)

    expect(decoded.name).toBe(draft.name)
    expect(decoded.width).toBe(draft.width)
    expect(decoded.height).toBe(draft.height)
    expect(decoded.tiles).toEqual(draft.tiles)
    expect(decoded.startPositions).toEqual(draft.startPositions)
    expect(decoded.encounters).toEqual(draft.encounters)
    expect(decoded.resourceMarkers).toEqual(draft.resourceMarkers)
    // Import always mints a fresh local identity — a shared code isn't tied
    // to the exporter's local storage slot.
    expect(decoded.id).not.toBe(draft.id)
  })

  it('preserves non-Latin1 characters in the map name', () => {
    const draft = renameDraft(draftFromGenerated(1, 'small', 2, 2, 'x'), 'Île au Trésor 海')
    const decoded = decodeMapCode(encodeMapCode(draft))
    expect(decoded.name).toBe('Île au Trésor 海')
  })

  it('rejects a code with the wrong prefix', () => {
    expect(() => decodeMapCode('not-a-map-code')).toThrow(/Unrecognized map code/)
  })

  it('rejects a corrupted payload', () => {
    expect(() => decodeMapCode('AOPMAP1:not-valid-base64-json!!!')).toThrow()
  })

  it('rejects a tile-run count that does not match the declared dimensions', () => {
    const draft = draftFromGenerated(1, 'small', 2, 2, 'x')
    const code = encodeMapCode(draft)
    const payload = JSON.parse(atob(code.replace('AOPMAP1:', ''))) as {
      width: number
      runs: unknown[]
    }
    payload.width = payload.width + 1
    const retampered = `AOPMAP1:${btoa(JSON.stringify(payload))}`
    expect(() => decodeMapCode(retampered)).toThrow(/decoded \d+ tiles, expected/)
  })
})
