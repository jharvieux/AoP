// Quick-match queue drain, the I/O half of #153. The pure grouping/seat policy and the
// dependency-injected orchestration live in @aop/shared (`drainQueue`, `assignQuickMatchSeats`,
// unit-tested including the concurrency property); this module supplies the real database
// effects: listing buckets, invoking the concurrency-safe claim RPC, and creating+starting a
// match for each claimed group. Mirrors the split compaction.ts uses (policy in @aop/shared,
// I/O here).

import { GAME_SETUP } from '@aop/content'
import {
  assignQuickMatchSeats,
  drainQueue,
  ENGINE_VERSION,
  FACTION_IDS,
  type DrainSummary,
  type Json,
  type MapSize,
  type QueueEntry,
  type QuickMatchBucket,
} from '@aop/shared'
import { AppError } from './http.ts'
import { randomSeed, startMatch, type MatchSettings, type StartMatchSeat } from './match.ts'
import type { Db } from './client.ts'

// Quick-match defaults (§8): 24h/turn async cadence and the standard 3-missed-turn AI
// takeover threshold. Quick matches are public, so they carry no invite code.
const QUICK_MATCH_TURN_TIMER_SECONDS = 86_400
const QUICK_MATCH_MISSED_TURN_THRESHOLD = 3

/** Distinct (matchSize, mapSize) buckets that currently hold a waiter. A stale read is safe:
 * a bucket that another drain emptied between here and the claim just yields a null claim. */
async function listQueueBuckets(db: Db): Promise<QuickMatchBucket[]> {
  const { data, error } = await db.from('matchmaking_queue').select('match_size, map_size')
  if (error) throw new AppError('INTERNAL', error.message)
  const seen = new Set<string>()
  const buckets: QuickMatchBucket[] = []
  for (const row of data ?? []) {
    const key = `${row.match_size}:${row.map_size}`
    if (seen.has(key)) continue
    seen.add(key)
    buckets.push({ matchSize: row.match_size, mapSize: row.map_size as MapSize })
  }
  return buckets
}

/** Atomically claim one full group for a bucket via the FOR UPDATE SKIP LOCKED RPC, or null
 * when fewer than `matchSize` waiters remain (see the migration). This is the sole
 * race-critical step; everything downstream operates on the privately-claimed group. */
async function claimQuickMatchGroup(
  db: Db,
  bucket: QuickMatchBucket,
): Promise<QueueEntry[] | null> {
  const { data, error } = await db.rpc('claim_matchmaking_group', {
    p_match_size: bucket.matchSize,
    p_map_size: bucket.mapSize,
  })
  if (error) throw new AppError('INTERNAL', error.message)
  const rows = (data ?? []) as { user_id: string; faction: string | null }[]
  if (rows.length === 0) return null
  return rows.map((r) => ({ userId: r.user_id, faction: r.faction }))
}

/**
 * Create and start a match for an already-claimed group, mirroring create-match +
 * start-match: insert the match in `lobby`, seat the group, run `createGame` from a
 * server seed, write the seq-0 snapshot, then flip to `active` and arm the first turn
 * deadline. The lobby→active window (rather than inserting `active` up front) means the
 * match is never visible to the turn sweep or submit-action without its seq-0 snapshot.
 */
async function createQuickMatch(
  db: Db,
  bucket: QuickMatchBucket,
  group: QueueEntry[],
): Promise<string> {
  const seats = assignQuickMatchSeats(group, FACTION_IDS)
  // Quick matches aren't host-configured, so the diplomacy knobs (#177) take the
  // content defaults — persisted explicitly so a client-side replay rebuilds the
  // same setup it would for any other match.
  const settings: MatchSettings = {
    mapSize: bucket.mapSize,
    maxPlayers: bucket.matchSize,
    turnTimerSeconds: QUICK_MATCH_TURN_TIMER_SECONDS,
    private: false,
    aiSeats: 0,
    missedTurnThreshold: QUICK_MATCH_MISSED_TURN_THRESHOLD,
    betrayalReputationPenalty: GAME_SETUP.betrayalReputationPenalty,
    betrayalTruceRounds: GAME_SETUP.betrayalTruceRounds,
  }
  const seed = randomSeed()

  const insertMatch = await db
    .from('matches')
    .insert({
      status: 'lobby',
      settings: settings as unknown as Json,
      seed,
      engine_version: ENGINE_VERSION,
      invite_code: null,
      created_by: seats[0]!.userId, // quick matches have no human creator; the first waiter stands in
    })
    .select('id')
    .single()
  if (insertMatch.error || !insertMatch.data) {
    throw new AppError('INTERNAL', insertMatch.error?.message ?? 'Could not create quick match')
  }
  const matchId = insertMatch.data.id

  const seatRows = seats.map((s) => ({
    match_id: matchId,
    seat: s.seat,
    user_id: s.userId,
    faction: s.faction,
    status: 'joined',
  }))
  const insertSeats = await db.from('match_players').insert(seatRows)
  if (insertSeats.error) throw new AppError('INTERNAL', insertSeats.error.message)

  const seatList: StartMatchSeat[] = seats.map((s) => ({
    seat: s.seat,
    userId: s.userId,
    faction: s.faction,
  }))
  await startMatch(db, matchId, seed, settings, seatList)
  return matchId
}

/** Drain the quick-match queue once, wiring the real database effects into the shared
 * `drainQueue` orchestration. */
export function drainMatchmaking(db: Db): Promise<DrainSummary> {
  return drainQueue({
    listBuckets: () => listQueueBuckets(db),
    claimGroup: (bucket) => claimQuickMatchGroup(db, bucket),
    createMatch: (bucket, group) => createQuickMatch(db, bucket, group),
  })
}
