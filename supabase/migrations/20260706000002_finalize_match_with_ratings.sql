-- Atomic match-finish + rating-write (#189).
--
-- Before this migration, finalize() in supabase/functions/_shared/match.ts did the
-- match-finish in two separate DB round-trips: (1) an idempotency-guarded
-- `UPDATE matches SET status = 'finished' ... WHERE status = 'active'`, then (2) a
-- separate upsert into player_ratings. If the Edge Function died between the two, the
-- match was permanently 'finished' with its rating update silently and permanently
-- lost: any retry finds zero rows still 'active' and returns before touching ratings.
--
-- This function collapses both writes into ONE transaction. The Elo math itself stays
-- in the pure, unit-tested @aop/shared computeMatchRatingUpdates (#152) — the Edge
-- Function computes the new ratings in TypeScript and passes the finished results in as
-- p_ratings; this function's only job is to make the status flip and the rating upserts
-- succeed-or-fail together.
--
-- Idempotency is preserved EXACTLY as before: the `status = 'active'` guard makes the
-- transition match a row at most once. A second call for the same match (retry,
-- re-invocation, or a concurrent finalize that lost the race) finds the row already
-- 'finished', updates zero rows, applies NO ratings, and returns false — so ratings can
-- never be double-applied. The only behavioural change is that a crash can no longer
-- land between the two writes: either both are durable or neither is.
--
-- Idempotent (safe to re-run): create or replace function.

-- ---------------------------------------------------------------------------
-- finalize_match_with_ratings — the atomic active->finished + rating-write primitive.
--
--   p_match_id    — the match to finish.
--   p_winner_seat — the winning seat number, or null (mutual-elimination / AI win).
--   p_ratings     — a JSON array of the already-computed rating rows to persist,
--                   each `{ "user_id": uuid, "rating": int, "matches_played": int }`.
--                   May be empty (all-AI match, or no rating moved) — the status flip
--                   still happens; nothing is upserted.
--
-- Returns true iff THIS call performed the active->finished transition (and therefore
-- applied p_ratings); false if the match was already finished, so the caller can tell a
-- transition it owned from a no-op race-loser.
--
-- SECURITY DEFINER + revoked-from-public: only the service role (the Edge Function that
-- runs match-finish) may call it, and it runs as owner so RLS does not hide any rows.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_match_with_ratings(
  p_match_id uuid,
  p_winner_seat int,
  p_ratings jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.matches
  set status = 'finished',
      winner_seat = p_winner_seat,
      turn_deadline = null
  where id = p_match_id
    and status = 'active';

  -- Zero rows updated => the match was not 'active' (already finished, or never
  -- existed): a no-op race-loser. Return without touching ratings so they are never
  -- double-applied — the same guarantee the two-step version gave, now atomic.
  if not found then
    return false;
  end if;

  insert into public.player_ratings (user_id, rating, matches_played, updated_at)
  select (r ->> 'user_id')::uuid,
         (r ->> 'rating')::int,
         (r ->> 'matches_played')::int,
         now()
  from jsonb_array_elements(coalesce(p_ratings, '[]'::jsonb)) as r
  on conflict (user_id) do update
    set rating = excluded.rating,
        matches_played = excluded.matches_played,
        updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.finalize_match_with_ratings(uuid, int, jsonb) from public;
grant execute on function public.finalize_match_with_ratings(uuid, int, jsonb) to service_role;
