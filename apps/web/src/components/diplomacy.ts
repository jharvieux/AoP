import type { FactionId } from '@aop/shared'

/**
 * Pure roster-building logic for the diplomacy panel (#141), the client UI on
 * top of the already-merged alliance engine (#136/#137/#138). Kept dependency-free
 * of React so the categorization/sort/gating rules are unit-testable without a
 * renderer — the same split CityScreen and DiplomacyPanel.tsx follow for their
 * own callback wiring.
 */

/** The subset of a `ViewPlayer`/engine `Player` the roster needs. */
export interface DiplomacyPlayerInfo {
  id: string
  name: string
  faction: FactionId
  /** Diplomatic standing (#138) — public for every seat, per playerView.ts. */
  reputation: number
  eliminated: boolean
}

export type DiplomacyRelation = 'ally' | 'incomingProposal' | 'outgoingProposal' | 'none'

export interface DiplomacyRosterEntry {
  player: DiplomacyPlayerInfo
  relation: DiplomacyRelation
  /**
   * Whether a *new* alliance could be proposed/accepted right now (#138's
   * reputation gate, `requireAllianceReputation` in reducer.ts, checked against
   * both seats). Irrelevant to an already-standing `ally` relation — existing
   * alliances are never dissolved by low reputation.
   */
  reputationOk: boolean
}

/** The shape of `PlayerView.alliances` (viewer-scoped: only pairs/proposals touching the viewer). */
export interface ViewAlliancesLike {
  allies: string[]
  outgoingProposals: string[]
  incomingProposals: string[]
}

/**
 * Build the diplomacy panel's roster: every other living seat, tagged with its
 * relation to the viewer and whether a new alliance is reputation-gated.
 * Eliminated seats are omitted outright — the engine already prunes them from
 * every alliance and proposal on elimination (`pruneAlliancesForSeats`), and a
 * ghost seat can't be proposed to (`proposeAlliance` rejects it), so there is
 * nothing actionable to show for one.
 *
 * Sorted by seat id for a stable, deterministic render order (no reliance on
 * insertion order from the server payload).
 */
export function buildDiplomacyRoster(
  viewerId: string,
  viewerReputation: number,
  players: readonly DiplomacyPlayerInfo[],
  alliances: ViewAlliancesLike,
  allianceReputationMin: number,
): DiplomacyRosterEntry[] {
  const allies = new Set(alliances.allies)
  const incoming = new Set(alliances.incomingProposals)
  const outgoing = new Set(alliances.outgoingProposals)

  return players
    .filter((p) => p.id !== viewerId && !p.eliminated)
    .map((player): DiplomacyRosterEntry => {
      const relation: DiplomacyRelation = allies.has(player.id)
        ? 'ally'
        : incoming.has(player.id)
          ? 'incomingProposal'
          : outgoing.has(player.id)
            ? 'outgoingProposal'
            : 'none'
      return {
        player,
        relation,
        reputationOk:
          viewerReputation >= allianceReputationMin && player.reputation >= allianceReputationMin,
      }
    })
    .sort((a, b) => a.player.id.localeCompare(b.player.id))
}
