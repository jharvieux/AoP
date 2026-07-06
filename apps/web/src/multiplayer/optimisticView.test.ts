import { describe, expect, it } from 'vitest'
import type { Action, PlayerView } from '@aop/engine'
import { applyOptimisticAction } from './optimisticView'
import { boardFromPlayerView } from './playerViewBoard'

/** A 4x4 all-water explored map; viewer seat-0 with one captain at (0,0), 2 movement left. */
function view(over: Partial<PlayerView> = {}): PlayerView {
  const tiles: PlayerView['tiles'] = []
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      tiles.push({ coord: { x, y }, type: 'shallows', island: -1, visible: true })
    }
  }
  return {
    viewerId: 'seat-0',
    round: 1,
    currentPlayerIndex: 0,
    status: 'active',
    winnerId: null,
    rules: { setup: {} as PlayerView['rules']['setup'], mapSize: 'small' },
    mapWidth: 4,
    mapHeight: 4,
    tiles,
    players: [],
    cities: [],
    captains: [
      {
        id: 'cap-own',
        ownerId: 'seat-0',
        name: 'Anne',
        position: { x: 0, y: 0 },
        shipClassId: 'sloop',
        troops: [{ unitId: 'swashbuckler', count: 6 }],
        movementPoints: 2,
        maxMovementPoints: 3,
        xp: 10,
        skills: [],
        shipUpgrades: {},
      },
      {
        id: 'cap-enemy',
        ownerId: 'seat-1',
        name: 'Bart',
        position: { x: 3, y: 3 },
        shipClassId: 'sloop',
      },
    ],
    encounters: [],
    alliances: { allies: [], outgoingProposals: [], incomingProposals: [] },
    rngState: null,
    ...over,
  }
}

const mapOf = (v: PlayerView) => boardFromPlayerView(v).map

describe('applyOptimisticAction (#285: optimistic local move)', () => {
  it('moves the viewer’s own captain and spends the reachable movement', () => {
    const v = view()
    const action: Action = {
      type: 'moveCaptain',
      playerId: 'seat-0',
      captainId: 'cap-own',
      to: { x: 1, y: 0 },
    }
    const patched = applyOptimisticAction(v, mapOf(v), action)
    expect(patched).not.toBeNull()
    const moved = patched!.captains.find((c) => c.id === 'cap-own')!
    expect(moved.position).toEqual({ x: 1, y: 0 })
    expect(moved.movementPoints).toBe(1) // 2 - path cost of 1
    // Every other field on the patched view is untouched.
    expect(patched!.round).toBe(v.round)
    expect(patched!.captains.find((c) => c.id === 'cap-enemy')).toEqual(
      v.captains.find((c) => c.id === 'cap-enemy'),
    )
  })

  it('returns null when the destination is out of remaining movement', () => {
    const v = view()
    const action: Action = {
      type: 'moveCaptain',
      playerId: 'seat-0',
      captainId: 'cap-own',
      to: { x: 3, y: 0 }, // cost 3, only 2 movement left
    }
    expect(applyOptimisticAction(v, mapOf(v), action)).toBeNull()
  })

  it('returns null for a captain the viewer does not own', () => {
    const v = view()
    const action: Action = {
      type: 'moveCaptain',
      playerId: 'seat-0',
      captainId: 'cap-enemy',
      to: { x: 2, y: 3 },
    }
    expect(applyOptimisticAction(v, mapOf(v), action)).toBeNull()
  })

  it('returns null for an unknown captain id', () => {
    const v = view()
    const action: Action = {
      type: 'moveCaptain',
      playerId: 'seat-0',
      captainId: 'nope',
      to: { x: 1, y: 0 },
    }
    expect(applyOptimisticAction(v, mapOf(v), action)).toBeNull()
  })

  it('returns null for every non-move action — no guessed preview for hidden-state actions', () => {
    const v = view()
    const attack: Action = {
      type: 'attackCaptain',
      playerId: 'seat-0',
      captainId: 'cap-own',
      targetCaptainId: 'cap-enemy',
    }
    expect(applyOptimisticAction(v, mapOf(v), attack)).toBeNull()
    expect(applyOptimisticAction(v, mapOf(v), { type: 'endTurn', playerId: 'seat-0' })).toBeNull()
  })
})
