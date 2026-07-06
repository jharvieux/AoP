-- Atomic action append (#216).
--
-- Before this migration, appendAction in supabase/functions/_shared/match.ts was two
-- separate PostgREST round-trips: (1) INSERT into match_actions at seq = prior + 1,
-- then (2) UPDATE matches.action_count (guarded by action_count = prior). If the Edge
-- Function died between them (deploy, wall-clock kill, OOM, network blip), the action
-- row was committed while the counter was not: every later append — any player,
-- end-turn, the AI auto-play loop, sweep-turns — recomputed seq = prior + 1, hit the
-- (match_id, seq) primary key, and threw SEQ_CONFLICT forever. reconstructState reads
-- only up to action_count, so it never saw the orphan and the match was permanently
-- wedged with no recovery path. The window opened on EVERY action append.
--
-- This function collapses the pair into ONE transaction (the
-- finalize_match_with_ratings pattern, #189): the counter bump and the insert commit
-- together or not at all. Both concurrency guards survive:
--
--   * The `action_count = p_prior_count` CAS on matches runs FIRST and doubles as the
--     serialization point — a concurrent append blocks on the row lock, re-evaluates
--     the guard when the winner commits, matches zero rows, and raises SC409 (below).
--   * The (match_id, seq) primary key still backstops the insert; it can only fire
--     during deploy skew (an old two-step writer racing this RPC) and surfaces as
--     23505, which the caller maps to the same SEQ_CONFLICT.
--
-- Raising (rather than returning a conflict flag) is load-bearing: it rolls back the
-- whole transaction, so a lost race can never leave a half-applied append behind.
--
-- Self-healing: once the CAS succeeds we hold the match row lock, so any existing
-- action row with seq > p_prior_count is by definition an orphan a pre-RPC crash left
-- behind (a committed append's seq is always <= action_count). Deleting them
-- un-wedges matches the old two-step code already stranded, on their next append.
--
-- p_deadline / p_set_deadline mirror appendAction's `undefined means leave the
-- running deadline untouched` contract: turn_deadline is written only when
-- p_set_deadline is true (a turn advance), with p_deadline possibly null (untimed).
--
-- SECURITY DEFINER + revoked-from-public: only the service role (the Edge Functions'
-- action pipeline) may call it, and it runs as owner so RLS hides no rows.
-- Idempotent (safe to re-run): create or replace.

create or replace function public.append_match_action(
  p_match_id uuid,
  p_prior_count int,
  p_seat int,
  p_action jsonb,
  p_deadline timestamptz,
  p_set_deadline boolean
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq int := p_prior_count + 1;
begin
  update public.matches
  set action_count = v_seq,
      turn_deadline = case when p_set_deadline then p_deadline else turn_deadline end,
      updated_at = now()
  where id = p_match_id
    and action_count = p_prior_count;

  -- Zero rows => the counter moved since the caller's read (or the match is gone):
  -- a racer won. SC409 is this function's private SQLSTATE for that; the caller maps
  -- it to AppError('SEQ_CONFLICT'). Raising rolls the whole transaction back.
  if not found then
    raise exception 'append_match_action: match % advanced past %', p_match_id, p_prior_count
      using errcode = 'SC409';
  end if;

  -- Self-heal orphans from the pre-RPC crash window (see header). Safe under the
  -- matches row lock the UPDATE above just took.
  delete from public.match_actions
  where match_id = p_match_id
    and seq > p_prior_count;

  insert into public.match_actions (match_id, seq, seat, action)
  values (p_match_id, v_seq, p_seat, p_action);

  return v_seq;
end;
$$;

revoke all on function public.append_match_action(uuid, int, int, jsonb, timestamptz, boolean)
  from public;
grant execute on function public.append_match_action(uuid, int, int, jsonb, timestamptz, boolean)
  to service_role;
