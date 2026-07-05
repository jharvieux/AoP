/**
 * Dynamic alliance graph helpers (#136). Pure data transforms over
 * {@link AllianceState}; the propose/accept/leave state transitions themselves
 * live in reducer.ts (they raise InvalidActionError like every other action).
 * Pairs and proposals are kept in a deterministic order — seeded in player
 * order, then appended in action-log order — so replays reproduce byte-for-byte.
 */

import type { AlliancePair, AllianceProposal, AllianceState, PlayerConfig } from './types'

/** An unordered seat pair in canonical order (`a` < `b`), so a pair has one representation. */
export function canonicalPair(x: string, y: string): AlliancePair {
  return x < y ? { a: x, b: y } : { a: y, b: x }
}

/** True if `pair` is the unordered pair {x, y}. */
export function pairEquals(pair: AlliancePair, x: string, y: string): boolean {
  return (pair.a === x && pair.b === y) || (pair.a === y && pair.b === x)
}

/** True if the two distinct seats have an active alliance in `pairs`. */
export function pairsContain(pairs: readonly AlliancePair[], x: string, y: string): boolean {
  return pairs.some((p) => pairEquals(p, x, y))
}

/** True if a proposal stands in either direction for the unordered pair {x, y}. */
export function proposalBetween(
  proposals: readonly AllianceProposal[],
  x: string,
  y: string,
): boolean {
  return proposals.some((p) => (p.from === x && p.to === y) || (p.from === y && p.to === x))
}

/**
 * The opening alliance graph: every pair of distinct players sharing a non-null
 * `team` starts mutually allied. Iterated in player order so the seed is
 * deterministic without any explicit sort.
 */
export function seedAlliances(players: readonly PlayerConfig[]): AllianceState {
  const pairs: AlliancePair[] = []
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const team = players[i]!.team
      if (team !== undefined && team === players[j]!.team) {
        pairs.push(canonicalPair(players[i]!.id, players[j]!.id))
      }
    }
  }
  return { pairs, proposals: [] }
}

/**
 * Drop every pair and proposal that references any seat in `ids` — used when a
 * player is eliminated so no live seat is left allied with a ghost (and no stale
 * proposal to/from the dead seat can later be accepted). Returns the input
 * unchanged when nothing references `ids`, to keep state identity stable.
 */
export function pruneAlliancesForSeats(
  alliance: AllianceState,
  ids: ReadonlySet<string>,
): AllianceState {
  const pairs = alliance.pairs.filter((p) => !ids.has(p.a) && !ids.has(p.b))
  const proposals = alliance.proposals.filter((p) => !ids.has(p.from) && !ids.has(p.to))
  if (pairs.length === alliance.pairs.length && proposals.length === alliance.proposals.length) {
    return alliance
  }
  return { pairs, proposals }
}
