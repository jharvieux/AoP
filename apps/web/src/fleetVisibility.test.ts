import { describe, expect, it } from 'vitest'
import { fleetCaptains, shouldDrawCaptainDot } from './fleetVisibility'

describe('fleetCaptains (#523)', () => {
  it('includes a normal own captain', () => {
    const captains = [{ id: 'c1', ownerId: 'p1', captured: false }]
    expect(fleetCaptains(captains, [], 'p1')).toHaveLength(1)
  })

  it('excludes an enemy captain', () => {
    const captains = [{ id: 'c1', ownerId: 'p2', captured: false }]
    expect(fleetCaptains(captains, [], 'p1')).toHaveLength(0)
  })

  it('excludes a captured own captain', () => {
    const captains = [{ id: 'c1', ownerId: 'p1', captured: true }]
    expect(fleetCaptains(captains, [], 'p1')).toHaveLength(0)
  })

  it('excludes a pooled (rescued, ship-lost, unled) captain — stale beach position', () => {
    const captains = [{ id: 'c1', ownerId: 'p1', captured: false, shipLost: true as const }]
    expect(fleetCaptains(captains, [], 'p1')).toHaveLength(0)
  })

  it('includes a ship-lost captain still leading a party — its position is the party’s', () => {
    const captains = [{ id: 'c1', ownerId: 'p1', captured: false, shipLost: true as const }]
    expect(fleetCaptains(captains, [{ captainId: 'c1' }], 'p1')).toHaveLength(1)
  })
})

describe('shouldDrawCaptainDot (#523)', () => {
  it('draws a normal captain', () => {
    expect(shouldDrawCaptainDot({ id: 'c1', captured: false }, [])).toBe(true)
  })

  it('hides a pooled (rescued, ship-lost, unled) captain — stale beach position', () => {
    expect(shouldDrawCaptainDot({ id: 'c1', captured: false, shipLost: true }, [])).toBe(false)
  })

  it('draws a ship-lost captain still leading a party', () => {
    expect(
      shouldDrawCaptainDot({ id: 'c1', captured: false, shipLost: true }, [{ captainId: 'c1' }]),
    ).toBe(true)
  })

  it('draws a captured captain unchanged (out of #523 scope)', () => {
    expect(shouldDrawCaptainDot({ id: 'c1', captured: true }, [])).toBe(true)
  })
})
