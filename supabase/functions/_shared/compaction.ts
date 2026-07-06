// Snapshot compaction orchestration (docs/MULTIPLAYER.md §10, #143, #226). The
// pure keep-set and chat-retention policy lives in @aop/shared (`snapshotsToDelete`,
// `chatRetentionCutoff`) and is unit-tested by the engine's vitest suite; this
// module is the thin I/O layer that reads a match's snapshot seqs + rounds,
// computes what to delete, and deletes it, per match, safely against a
// concurrent `submit-action` — plus the finished-match chat purge (#226).

import {
  chatRetentionCutoff,
  snapshotsToDelete,
  DEFAULT_CHAT_RETENTION_DAYS,
  DEFAULT_ROUNDS_PER_SNAPSHOT,
  type SnapshotMeta,
  type SnapshotRetentionMode,
} from '@aop/shared'
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
 * Compact one match's snapshots — either an active match under the ongoing
 * §10 policy, or a finished match under the stricter #226 keep-set (genesis +
 * final only). Anything else (`lobby`, `abandoned`) is left untouched.
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
 * without one — see #143.) A finished match's `action_count` never advances
 * again, so the same guard is trivially safe there too. Idempotent: re-running
 * deletes nothing new.
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
  if (match.status !== 'active' && match.status !== 'finished') {
    return { matchId, deleted: 0, keptSeqs: [], skipped: `status=${match.status}` }
  }
  const mode: SnapshotRetentionMode = match.status === 'finished' ? 'finished' : 'active'
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

  const toDelete = snapshotsToDelete(snapshots, guardSeq, roundsPerSnapshot, mode)
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

/** Compact every active or finished match (or a single `matchId` when given). */
export async function compactSnapshots(
  db: Db,
  opts: CompactionOptions & { matchId?: string } = {},
): Promise<CompactionSummary> {
  const matchIds: string[] = []
  if (opts.matchId) {
    matchIds.push(opts.matchId)
  } else {
    const { data, error } = await db
      .from('matches')
      .select('id')
      .in('status', ['active', 'finished'])
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

export interface ChatPurgeOptions {
  /** How many days a finished match's chat survives (#226). */
  retentionDays?: number
  /** Injectable "now" for deterministic tests; defaults to the real clock. */
  now?: Date
}

export interface ChatPurgeResult {
  /** Finished matches whose chat was old enough to purge. */
  matchesPurged: number
  /** Total `match_chat` rows deleted. */
  deleted: number
}

/**
 * Delete `match_chat` rows for matches that finished more than the retention
 * window ago (#226). `matches.updated_at` doubles as "finished at" — see
 * {@link chatRetentionCutoff}'s doc comment for why that needs no dedicated
 * column. Runs on the same daily cron as {@link compactSnapshots}
 * (`compact-snapshots` Edge Function).
 */
export async function purgeExpiredChat(
  db: Db,
  opts: ChatPurgeOptions = {},
): Promise<ChatPurgeResult> {
  const retentionDays = opts.retentionDays ?? DEFAULT_CHAT_RETENTION_DAYS
  const cutoff = chatRetentionCutoff(opts.now ?? new Date(), retentionDays).toISOString()

  const { data: staleMatches, error: matchErr } = await db
    .from('matches')
    .select('id')
    .eq('status', 'finished')
    .lt('updated_at', cutoff)
  if (matchErr) throw new AppError('INTERNAL', matchErr.message)
  const matchIds = (staleMatches ?? []).map((m) => m.id)
  if (matchIds.length === 0) return { matchesPurged: 0, deleted: 0 }

  const { error: delErr, count } = await db
    .from('match_chat')
    .delete({ count: 'exact' })
    .in('match_id', matchIds)
  if (delErr) throw new AppError('INTERNAL', delErr.message)

  return { matchesPurged: matchIds.length, deleted: count ?? 0 }
}
