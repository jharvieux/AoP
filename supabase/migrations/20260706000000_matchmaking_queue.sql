-- Quick-match queue (#153), a v1 of the public matchmaking flagged in docs/MULTIPLAYER.md §14.
-- Players join a server-side waiting queue; a periodic drain (the drain-matchmaking Edge
-- Function) groups compatible waiters into a fresh match and seats them. Grouping is simple
-- FIFO within a (match_size, map_size) bucket — rating-based matchmaking (#151/#152) and any
-- UI (#155) are explicitly out of scope for this issue.
--
-- The drain is race-prone: two overlapping drain runs must never double-match a player into
-- two different matches, and a partial drain must never leave the queue in a half-consumed
-- state. The concurrency story lives in claim_matchmaking_group below (SELECT ... FOR UPDATE
-- SKIP LOCKED + delete-in-transaction), mirroring the row-locking approach the turn sweep
-- (#129) and snapshot compaction (#143) established this phase.
--
-- Idempotent (safe to re-run): create table/index if not exists, drop-then-create policy,
-- create or replace function.

-- One waiting entry per user (user_id primary key => a player can never be queued twice, a
-- built-in idempotency guard). The client inserts to join the queue and deletes to leave it
-- (RLS below) — no Edge Function is needed to enqueue.
create table if not exists matchmaking_queue (
  user_id    uuid primary key references profiles (id) on delete cascade,
  match_size int not null check (match_size between 2 and 8), -- desired human player count (§1)
  map_size   text not null check (map_size in ('small', 'medium', 'large')), -- compat criterion
  faction    text, -- optional preference; honored on seating when free, else reassigned
  queued_at  timestamptz not null default now()
);

-- The drain's grouping query: oldest-first within each (match_size, map_size) bucket.
create index if not exists matchmaking_queue_bucket_idx
  on matchmaking_queue (match_size, map_size, queued_at);

-- RLS: a user sees and manages ONLY their own queue entry (#153). Unlike the game-state
-- tables (§4, Edge-Function-only writes), this one is deliberately client-writable — joining
-- or leaving the queue is the player inserting/deleting their own row, the same shape as
-- cloud_saves. The drain runs as the service role, which bypasses RLS.
alter table matchmaking_queue enable row level security;

drop policy if exists matchmaking_queue_all_own on matchmaking_queue;
create policy matchmaking_queue_all_own on matchmaking_queue
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- claim_matchmaking_group — the concurrency-safe drain primitive (#153).
--
-- Atomically claims ONE full group of the `p_match_size` oldest waiters for the given
-- (match_size, map_size) bucket and removes them from the queue, all in one transaction:
--
--   * FOR UPDATE SKIP LOCKED — two overlapping drain runs lock DISJOINT rows, so the same
--     queued player is never handed to two claimers (no double-match). A row another drain
--     already holds is skipped, never blocked on.
--   * Full-group gate — rows are returned only when at least `p_match_size` compatible
--     waiters exist; a short bucket claims NOBODY, so the queue is never drained into an
--     under-sized match or left half-consumed.
--   * Delete-in-claim — the claimed rows are deleted in the same statement that locks them,
--     so a player is out of the queue before the caller creates any match. A caller that
--     crashes after the claim commits drops at most this one group (those players simply
--     re-queue) — it can never double-match them.
--
-- SECURITY DEFINER + revoked-from-public: only the service role (the drain Edge Function)
-- may call it, and it runs as owner so RLS does not hide the other waiters' rows.
-- ---------------------------------------------------------------------------
create or replace function public.claim_matchmaking_group(
  p_match_size int,
  p_map_size text
)
returns table (user_id uuid, faction text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as materialized (
    select q.user_id, q.faction, q.queued_at
    from public.matchmaking_queue q
    where q.match_size = p_match_size
      and q.map_size = p_map_size
    order by q.queued_at asc, q.user_id asc
    limit p_match_size
    for update skip locked
  ),
  -- Only proceed when a COMPLETE group is available; otherwise full_group is empty and the
  -- delete below removes nothing. (`candidates` is materialized, so both references see the
  -- same locked snapshot.)
  full_group as (
    select c.user_id, c.faction, c.queued_at
    from candidates c
    where (select count(*) from candidates) = p_match_size
  ),
  deleted as (
    delete from public.matchmaking_queue q
    using full_group g
    where q.user_id = g.user_id
    returning q.user_id, q.faction, q.queued_at
  )
  select d.user_id, d.faction
  from deleted d
  order by d.queued_at asc, d.user_id asc;
end;
$$;

revoke all on function public.claim_matchmaking_group(int, text) from public;
grant execute on function public.claim_matchmaking_group(int, text) to service_role;
