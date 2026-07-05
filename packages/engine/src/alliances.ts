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

/**
 * Group players into alliance clusters — the connected components of the
 * pairwise alliance graph — mapping each player who holds at least one alliance
 * to that cluster's canonical representative (the lexicographically smallest
 * player id in the component). Players in no alliance are absent from the map.
 *
 * Used by the server to mirror the engine's alliance graph onto the single
 * `match_players.alliance_id` metadata column (#140); the engine's
 * {@link AllianceState} remains the source of truth for game logic. Note that
 * alliances are pairwise, not transitive for `areAllied` — but a *shared chat
 * channel* needs a group, and connected components are the natural grouping, so
 * A–B plus B–C place A, B, and C in one cluster here even though A and C are not
 * themselves allied. Deterministic (union always adopts the smaller id as root),
 * so the same graph always yields the same representatives.
 */
export function allianceComponents(alliance: AllianceState): Map<string, string> {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    let cur = x
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const ensure = (x: string): void => {
    if (!parent.has(x)) parent.set(x, x)
  }
  for (const pair of alliance.pairs) {
    ensure(pair.a)
    ensure(pair.b)
    const ra = find(pair.a)
    const rb = find(pair.b)
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb)
  }
  const components = new Map<string, string>()
  for (const player of parent.keys()) components.set(player, find(player))
  return components
}
