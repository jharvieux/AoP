/**
 * Chat retention policy (#226): `match_chat` had no retention at all, so
 * storage grows without bound at ~43K durable messages/seat/day (the rate
 * limit ceiling) forever, even for matches finished long ago. This pure,
 * unit-tested cutoff calculation is shared by the `compact-snapshots` Edge
 * Function (`supabase/functions/_shared/compaction.ts`), which does the I/O
 * of finding and deleting the actual rows on the same daily cron as snapshot
 * compaction.
 */

/** Default retention window: how many days a finished match's chat survives. */
export const DEFAULT_CHAT_RETENTION_DAYS = 30

/**
 * The `matches.updated_at` cutoff below which a *finished* match's chat is
 * eligible for deletion. `updated_at` is bumped on every turn advance
 * (`supabase/functions/_shared/match.ts`'s `appendAction`) including the one
 * that flips `status` to `'finished'`, and is never touched again afterward —
 * so for a finished match it is, in effect, the finish time, with no
 * dedicated `finished_at` column needed.
 */
export function chatRetentionCutoff(
  now: Date,
  retentionDays: number = DEFAULT_CHAT_RETENTION_DAYS,
): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
}
