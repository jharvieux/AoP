-- Extend the quick-match queue's map_size bucket to accept 'xlarge' (#473, follow-up to
-- #468/PR #472). The original migration (20260706000000_matchmaking_queue.sql) hardcoded
-- `check (map_size in ('small', 'medium', 'large'))` before xlarge existed; that migration
-- is never edited once applied, so the constraint is widened here instead.
--
-- No existing row needs deleting (unlike 20260707091000_matchmaking_match_size_cap.sql's
-- match_size tightening): this is purely additive, so every currently-queued row still
-- satisfies the new constraint.
--
-- Idempotent (safe to re-run): the constraint is dropped-if-exists then re-added.

alter table matchmaking_queue drop constraint if exists matchmaking_queue_map_size_check;
alter table matchmaking_queue add constraint matchmaking_queue_map_size_check
  check (map_size in ('small', 'medium', 'large', 'xlarge'));
