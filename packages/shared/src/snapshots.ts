/**
 * Snapshot compaction policy (docs/MULTIPLAYER.md §10, #143).
 *
 * A match accumulates one `match_snapshots` row per turn advance. Reconstruction
 * (`reconstructState`) only needs, for any target seq, the newest surviving
 * snapshot at or below it plus the action tail — so most intermediate snapshots
 * are dead weight once the match is long. Compaction keeps a bounded **keep-set**
 * and deletes the rest.
 *
 * This module is the pure, side-effect-free heart of that policy: it decides
 * *which* seqs to keep or delete. The Edge Function (`compact-snapshots`) owns
 * the I/O and the per-match serialization. Kept here in `@aop/shared` (rather
 * than inline in the Deno function) so the policy is unit-tested by the engine's
 * vitest suite alongside the snapshot-resume determinism contract (#142).
 */

/** Just the fields compaction reasons about, projected from a `match_snapshots` row. */
export interface SnapshotMeta {
  /** State AFTER applying actions [1..seq]; `0` is the genesis snapshot from start-match. */
  seq: number
  /** `state->'round'` — read from the snapshot's jsonb, never a separate column. */
  round: number
}

/**
 * How many rounds of history each retained "historical" snapshot covers (the
 * "one per N rounds" of §10). A retention/operational knob, not game balance —
 * it never affects reconstructed state, only how far the replay tail can stretch
 * for an old seq. Larger => fewer snapshots kept, longer worst-case replay.
 */
export const DEFAULT_ROUNDS_PER_SNAPSHOT = 10

/**
 * The set of snapshot seqs to KEEP (docs/MULTIPLAYER.md §10):
 *
 *  - **snapshot 0** (the minimum seq / genesis) — so reconstruction of *any*
 *    early seq still finds a base at or below it; deleting it would strand every
 *    seq before the next surviving snapshot.
 *  - **the two newest** — the hot path: near the head, reconstruction replays at
 *    most one turn of actions.
 *  - **one per N rounds** — the earliest snapshot reaching each N-round bucket,
 *    bounding the replay tail for historical seqs.
 *
 * Pure and deterministic. Idempotent: the keep-set of a snapshot list already
 * reduced to its keep-set is that same set (every survivor is re-kept), so
 * re-running compaction deletes nothing.
 */
export function snapshotKeepSet(
  snapshots: readonly SnapshotMeta[],
  roundsPerSnapshot: number = DEFAULT_ROUNDS_PER_SNAPSHOT,
): Set<number> {
  const keep = new Set<number>()
  if (snapshots.length === 0) return keep

  const bySeq = [...snapshots].sort((a, b) => a.seq - b.seq)
  const bucketSize = Math.max(1, Math.floor(roundsPerSnapshot))

  // Genesis + the two newest.
  keep.add(bySeq[0]!.seq)
  keep.add(bySeq[bySeq.length - 1]!.seq)
  keep.add(bySeq[Math.max(0, bySeq.length - 2)]!.seq)

  // One per N rounds: the earliest snapshot (smallest seq) in each round bucket.
  // `bySeq` is ascending, so the first seq seen for a bucket is its minimum.
  const bucketRep = new Map<number, number>()
  for (const s of bySeq) {
    const bucket = Math.floor(s.round / bucketSize)
    if (!bucketRep.has(bucket)) bucketRep.set(bucket, s.seq)
  }
  for (const seq of bucketRep.values()) keep.add(seq)

  return keep
}

/**
 * The seqs to DELETE for a match: everything not in the keep-set, scoped to
 * `seq <= guardSeq`.
 *
 * `guardSeq` is the match's authoritative head (`matches.action_count`) read at
 * the start of the compaction transaction. A concurrent `submit-action` only
 * ever *inserts* snapshots at a higher seq than the head it advanced from, so a
 * snapshot with `seq > guardSeq` is one that appeared after we looked — never
 * ours to delete. Because the newest snapshot at or below `guardSeq` is always
 * in the keep-set, and anything above `guardSeq` is excluded here, the true
 * newest snapshot is never deleted under any interleaving. Returned ascending.
 */
export function snapshotsToDelete(
  snapshots: readonly SnapshotMeta[],
  guardSeq: number,
  roundsPerSnapshot: number = DEFAULT_ROUNDS_PER_SNAPSHOT,
): number[] {
  const keep = snapshotKeepSet(snapshots, roundsPerSnapshot)
  return snapshots
    .filter((s) => s.seq <= guardSeq && !keep.has(s.seq))
    .map((s) => s.seq)
    .sort((a, b) => a - b)
}
