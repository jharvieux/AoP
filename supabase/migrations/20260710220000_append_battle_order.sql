-- Atomic per-side battle-order append (#408), design docs/design/multiplayer-tactical-probe.md
-- §2.2/§10.3. Adds on top of 20260710212241_match_battle_sessions.sql. Idempotent (create or
-- replace).
--
-- Before this function, appendBattleOrder in supabase/functions/_shared/battleSession.ts did a
-- check-then-act: it read the per-side order list, compared its length to the caller's
-- `expectedOrders` IN JS, then issued a plain `UPDATE ... WHERE match_id = ...` with no length
-- predicate. Two concurrent same-seat `battle-round` calls (a double-tap / retry) could both
-- pass the JS check against the same stale length and the second UPDATE would silently
-- overwrite the first's just-appended order — a LOST UPDATE, exactly the #293 race the
-- ORDERS_CONFLICT code exists to close (design §3, §10.3).
--
-- This collapses guard-and-append into ONE atomic conditional UPDATE, mirroring
-- append_match_action (#216): the length CAS lives in the WHERE clause, so the two writers
-- serialise on the match_battle_sessions row lock and the loser re-evaluates the predicate
-- against the committed new length, matches zero rows, and raises OC409 — which the caller
-- maps to ORDERS_CONFLICT. The append itself is done in SQL (`col || p_element`) so no
-- read-modify-write window exists: the row is never round-tripped through the client.
--
-- Each seat only ever appends to its OWN column (§10.3), so the two writers touch disjoint
-- state and never lose-update each OTHER; the CAS only ever fires on a same-seat double-submit.
-- `p_column` is chosen server-side from the caller's seat + order kind (never from client
-- input) and is additionally allowlisted here as defence in depth before it reaches format(%I).
--
-- Returns the new length of the appended list (expected + 1). SECURITY DEFINER +
-- revoked-from-public: only the service role (the battle-session Edge Functions) may call it.

create or replace function public.append_battle_order(
  p_match_id uuid,
  p_column text,
  p_element jsonb,
  p_expected int,
  p_set_interactive boolean
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_len int;
begin
  if p_column not in (
    'attacker_tactic_orders', 'defender_tactic_orders',
    'attacker_board_commands', 'defender_board_commands'
  ) then
    raise exception 'append_battle_order: illegal column %', p_column
      using errcode = 'check_violation';
  end if;

  -- Atomic guard-and-append: the per-side length CAS is the WHERE predicate, so a concurrent
  -- same-seat writer that already advanced the list past p_expected matches zero rows here.
  execute format(
    'update public.match_battle_sessions
        set %1$I = %1$I || $1,
            defender_interactive = defender_interactive or $2
      where match_id = $3
        and jsonb_array_length(%1$I) = $4
      returning jsonb_array_length(%1$I)',
    p_column
  )
  into v_new_len
  using p_element, p_set_interactive, p_match_id, p_expected;

  -- Zero rows => the caller's expectedOrders is stale (a racer already appended, or no such
  -- session). OC409 is this function's private SQLSTATE; the caller maps it to
  -- AppError('ORDERS_CONFLICT'). Raising rolls the transaction back — no half-applied append.
  if not found then
    raise exception 'append_battle_order: % stale at expected %', p_column, p_expected
      using errcode = 'OC409';
  end if;

  return v_new_len;
end;
$$;

revoke all on function public.append_battle_order(uuid, text, jsonb, int, boolean) from public;
grant execute on function public.append_battle_order(uuid, text, jsonb, int, boolean)
  to service_role;
