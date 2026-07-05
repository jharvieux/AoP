-- Restrict `matches.seed` visibility to finished matches (#135).
--
-- Postgres RLS is row-level, not column-level: the `matches_select_seated`
-- policy (20260702000001_rls_policies.sql) grants a seated player SELECT on the
-- whole matches row, including `seed` — the server-generated map + RNG seed —
-- during an *active* match. Combined with the action log a participant
-- legitimately holds, a known seed lets a player predict future RNG-driven
-- outcomes for their own live match (docs/MULTIPLAYER.md §11 "Predict RNG" /
-- "Chosen-seed advantage"). Reading the seed *after* the match finishes is fine
-- and necessary: the #147 replay viewer rebuilds the frozen GameConfig from it.
--
-- Fix: revoke direct column access to `seed` from every client-facing role, then
-- expose it through a security-definer function that returns it only once the
-- match is finished and only to a seated participant. Edge Functions use the
-- service-role key (bypasses RLS and column grants) and are unaffected.

-- Column-level SELECT: grant every column *except* seed. A single-column REVOKE
-- would be ignored while the role still holds table-level SELECT, so we drop the
-- table-level grant and re-grant per column instead. RLS row filtering (the
-- matches_select_seated policy) still applies on top of these grants unchanged.
revoke select on matches from anon, authenticated;
grant select (
  id,
  status,
  settings,
  engine_version,
  invite_code,
  action_count,
  turn_deadline,
  winner_seat,
  created_by,
  created_at,
  updated_at
) on matches to anon, authenticated;

-- Status-gated read path for the finished-match replay viewer (#147). Runs as
-- the function owner (bypassing the seed column revoke above), but returns the
-- seed only when the match is finished AND the caller holds a seat — so it can
-- never widen visibility beyond what the row-level matches policy already allows,
-- and never during an active match. `search_path = ''` forces schema-qualified
-- names so the definer's privileges can't be hijacked via a spoofed search path.
create function match_seed(p_match_id uuid)
returns bigint
language sql
security definer
set search_path = ''
stable
as $$
  select m.seed
  from public.matches m
  where m.id = p_match_id
    and m.status = 'finished'
    and exists (
      select 1
      from public.match_players mp
      where mp.match_id = m.id
        and mp.user_id = auth.uid()
    );
$$;

revoke execute on function match_seed(uuid) from public;
grant execute on function match_seed(uuid) to authenticated;
