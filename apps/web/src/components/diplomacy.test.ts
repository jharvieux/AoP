import { describe, expect, it } from 'vitest'
import { buildDiplomacyRoster, type DiplomacyPlayerInfo, type ViewAlliancesLike } from './diplomacy'

function player(over: Partial<DiplomacyPlayerInfo> = {}): DiplomacyPlayerInfo {
  return {
    id: over.id ?? 'seat-1',
    name: over.name ?? 'Seat 1',
    faction: over.faction ?? 'pirates',
    reputation: over.reputation ?? 100,
    eliminated: over.eliminated ?? false,
  }
}

const NO_ALLIANCES: ViewAlliancesLike = { allies: [], outgoingProposals: [], incomingProposals: [] }

describe('buildDiplomacyRoster', () => {
  it('omits the viewer from their own roster', () => {
    const roster = buildDiplomacyRoster(
      'seat-0',
      100,
      [player({ id: 'seat-0' }), player({ id: 'seat-1' })],
      NO_ALLIANCES,
      0,
    )
    expect(roster.map((r) => r.player.id)).toEqual(['seat-1'])
  })

  it('omits eliminated seats — the engine already prunes their alliances/proposals', () => {
    const roster = buildDiplomacyRoster(
      'seat-0',
      100,
      [player({ id: 'seat-1', eliminated: true }), player({ id: 'seat-2' })],
      NO_ALLIANCES,
      0,
    )
    expect(roster.map((r) => r.player.id)).toEqual(['seat-2'])
  })

  it('tags relations from the viewer-scoped alliances view', () => {
    const alliances: ViewAlliancesLike = {
      allies: ['seat-1'],
      outgoingProposals: ['seat-2'],
      incomingProposals: ['seat-3'],
    }
    const roster = buildDiplomacyRoster(
      'seat-0',
      100,
      [
        player({ id: 'seat-1' }),
        player({ id: 'seat-2' }),
        player({ id: 'seat-3' }),
        player({ id: 'seat-4' }),
      ],
      alliances,
      0,
    )
    const byId = new Map(roster.map((r) => [r.player.id, r.relation]))
    expect(byId.get('seat-1')).toBe('ally')
    expect(byId.get('seat-2')).toBe('outgoingProposal')
    expect(byId.get('seat-3')).toBe('incomingProposal')
    expect(byId.get('seat-4')).toBe('none')
  })

  it('sorts deterministically by seat id regardless of input order', () => {
    const roster = buildDiplomacyRoster(
      'seat-0',
      100,
      [player({ id: 'seat-3' }), player({ id: 'seat-1' }), player({ id: 'seat-2' })],
      NO_ALLIANCES,
      0,
    )
    expect(roster.map((r) => r.player.id)).toEqual(['seat-1', 'seat-2', 'seat-3'])
  })

  describe('reputationOk (#138 alliance-formation gate)', () => {
    it('is true when both the viewer and the target meet the minimum', () => {
      const roster = buildDiplomacyRoster(
        'seat-0',
        50,
        [player({ id: 'seat-1', reputation: 50 })],
        NO_ALLIANCES,
        50,
      )
      expect(roster[0]!.reputationOk).toBe(true)
    })

    it('is false when the viewer is below the minimum', () => {
      const roster = buildDiplomacyRoster(
        'seat-0',
        49,
        [player({ id: 'seat-1', reputation: 100 })],
        NO_ALLIANCES,
        50,
      )
      expect(roster[0]!.reputationOk).toBe(false)
    })

    it('is false when the target is below the minimum', () => {
      const roster = buildDiplomacyRoster(
        'seat-0',
        100,
        [player({ id: 'seat-1', reputation: 49 })],
        NO_ALLIANCES,
        50,
      )
      expect(roster[0]!.reputationOk).toBe(false)
    })

    it('does not gate an already-standing ally — existing alliances survive low reputation', () => {
      const alliances: ViewAlliancesLike = {
        allies: ['seat-1'],
        outgoingProposals: [],
        incomingProposals: [],
      }
      const roster = buildDiplomacyRoster(
        'seat-0',
        10,
        [player({ id: 'seat-1', reputation: 10 })],
        alliances,
        50,
      )
      expect(roster[0]!.relation).toBe('ally')
      expect(roster[0]!.reputationOk).toBe(false)
    })
  })
})
