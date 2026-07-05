// Snapshot compaction orchestration (docs/MULTIPLAYER.md §10, #143). The pure
// keep-set policy lives in @aop/shared (`snapshotKeepSet` / `snapshotsToDelete`)
// and is unit-tested by the engine's vitest suite; this module is the thin I/O
// layer that reads a match's snapshot seqs + rounds, computes what to delete, and
// deletes it, per match, safely against a concurrent `submit-action`.

import { snapshotsToDelete, DEFAULT_ROUNDS_PER_SNAPSHOT, type SnapshotMeta } from '@aop/shared'
import { AppError } from './http.ts'
import type { Db } from './client.ts'

export interface CompactionOptions {
  /** History granularity for the "one per N rounds" rule (§10). */
  roundsPerSnapshot?: number
}

export interface MatchCompactionResult {
  matchId: string
  /** Number of snapshot rows deleted. */
  deleted: number
  /** The snapshot seqs kept alive after compaction. */
  keptSeqs: number[]
  /** Set when the match was not eligible (e.g. not active) and left untouched. */
  skipped?: string
}

/**
 * Compact one active match's snapshots.
 *
 * Serialization against `submit-action` without a row lock: we read the match's
 * authoritative head (`action_count`) as `guardSeq` *first*, then only ever
 * consider and delete snapshots with `seq <= guardSeq`. A concurrent
 * `submit-action` only inserts snapshots at a *higher* seq than the head it
 * advanced from, so any row it writes during our run is out of our delete scope,
 * and the newest snapshot at or below `guardSeq` is always in the keep-set — so
 * the true newest snapshot is never deleted under any interleaving. (A literal
 * `SELECT ... FOR UPDATE` would need a Postgres stored function, i.e. a schema
 * migration; this seq-guard delivers the same never-delete-newest guarantee
 * without one — see #143.) Idempotent: re-running deletes nothing new.
 */
export async function compactMatch(
  db: Db,
  matchId: string,
  opts: CompactionOptions = {},
): Promise<MatchCompactionResult> {
  const roundsPerSnapshot = opts.roundsPerSnapshot ?? DEFAULT_ROUNDS_PER_SNAPSHOT

  const { data: match, error: matchErr } = await db
    .from('matches')
    .select('status, action_count')
    .eq('id', matchId)
    .maybeSingle()
  if (matchErr) throw new AppError('INTERNAL', matchErr.message)
  if (!match) throw new AppError('NOT_FOUND', 'No such match')
  if (match.status !== 'active') {
    return { matchId, deleted: 0, keptSeqs: [], skipped: `status=${match.status}` }
  }
  const guardSeq = match.action_count

  // Read round straight from the snapshot's jsonb (`state->'round'`), never a
  // separate column — no migration needed (#143). `->>` yields text; coerce it.
  const { data: rows, error: snapErr } = await db
    .from('match_snapshots')
    .select('seq, round:state->>round')
    .eq('match_id', matchId)
    .lte('seq', guardSeq)
  if (snapErr) throw new AppError('INTERNAL', snapErr.message)

  const snapshots: SnapshotMeta[] = (rows ?? []).map((r) => {
    const row = r as unknown as { seq: number; round: string | number | null }
    const round = Number(row.round)
    if (!Number.isFinite(round)) {
      throw new AppError('INTERNAL', `Snapshot ${matchId}#${row.seq} has no numeric state.round`)
    }
    return { seq: row.seq, round }
  })

  const toDelete = snapshotsToDelete(snapshots, guardSeq, roundsPerSnapshot)
  const keptSeqs = snapshots.map((s) => s.seq).filter((seq) => !toDelete.includes(seq))
  if (toDelete.length === 0) return { matchId, deleted: 0, keptSeqs }

  const { error: delErr } = await db
    .from('match_snapshots')
    .delete()
    .eq('match_id', matchId)
    .lte('seq', guardSeq) // belt-and-suspenders: never touch a concurrently-inserted newer row
    .in('seq', toDelete)
  if (delErr) throw new AppError('INTERNAL', delErr.message)

  return { matchId, deleted: toDelete.length, keptSeqs }
}

export interface CompactionSummary {
  matchesProcessed: number
  totalDeleted: number
  results: MatchCompactionResult[]
}

/** Compact every active match (or a single `matchId` when given). */
export async function compactSnapshots(
  db: Db,
  opts: CompactionOptions & { matchId?: string } = {},
): Promise<CompactionSummary> {
  const matchIds: string[] = []
  if (opts.matchId) {
    matchIds.push(opts.matchId)
  } else {
    const { data, error } = await db.from('matches').select('id').eq('status', 'active')
    if (error) throw new AppError('INTERNAL', error.message)
    for (const row of data ?? []) matchIds.push(row.id)
  }

  const results: MatchCompactionResult[] = []
  for (const id of matchIds) {
    results.push(await compactMatch(db, id, opts))
  }
  return {
    matchesProcessed: results.length,
    totalDeleted: results.reduce((sum, r) => sum + r.deleted, 0),
    results,
  }
}
