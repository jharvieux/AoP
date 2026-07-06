-- Scope finished-match action-log reads to participants (#227).
--
-- `match_actions_select_finished` (20260702000001_rls_policies.sql) only checked
-- `matches.status = 'finished'` — no auth.uid() reference at all, unlike
-- `match_seed()` (20260705000001_restrict_matches_seed.sql), which requires a
-- seat before releasing the seed for the same replay use case. Any holder of
-- the anon/authenticated key could enumerate the full action log of every
-- finished match, including private invite-only ones — not a fog leak (the
-- match is over), but an unintentional asymmetry that enables bulk scraping.
--
-- Fix: reuse the user_match_ids() SECURITY DEFINER helper from
-- 20260707070000_fix_match_players_rls_recursion.sql to require the caller
-- hold a seat in the match, on top of the existing finished-only gate.

drop policy if exists match_actions_select_finished on match_actions;
create policy match_actions_select_finished on match_actions for select
using (
  match_id in (select user_match_ids(auth.uid()))
  and exists (
    select 1
    from matches
    where matches.id = match_actions.match_id
      and matches.status = 'finished'
  )
);
