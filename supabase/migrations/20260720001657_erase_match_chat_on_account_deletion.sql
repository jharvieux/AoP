-- Erase a deleted user's match_chat message bodies on account deletion (#573).
--
-- Gap (docs/DATA-CLASSIFICATION.md § Findings & Gaps, Critical): match_chat has no FK
-- to auth.users/match_players — its author is identified only by (match_id, seat), which
-- it mirrors from match_players' primary key. The account-deletion cleanup
-- (20260707070003_account_deletion_fk_cleanup.sql) sets match_players.user_id to NULL on
-- profile delete (the null-means-AI-seat convention), so once a user is deleted there is
-- no surviving link from any chat row back to them. Their message bodies (PII) linger with
-- a now-stale seat reference — a GDPR/CCPA erasure gap.
--
-- Fix: a BEFORE DELETE trigger on profiles. profiles cascades from auth.users, so this
-- fires inside the same transaction as any account/admin/GDPR delete. Critically it fires
-- BEFORE the row is removed — and therefore before the ON DELETE SET NULL cascade nulls
-- match_players.user_id — so the (match_id, seat) → user_id link is still intact and the
-- deleting user's seats are identifiable. We delete exactly the match_chat rows authored
-- from those seats; every other seat's messages (other players, and any seat the user did
-- not occupy) are untouched. Deletion (not redaction) is chosen per the erasure ruling and
-- because match_chat carries no non-PII payload worth retaining once the author is gone.
--
-- SECURITY DEFINER + `set search_path = ''` + schema-qualified names match the convention
-- of every other definer function in the chain (#334/#543); EXECUTE is revoked from the
-- client-facing roles since a trigger function needs no direct grant (#542).
--
-- RLS: no policy on match_chat is touched, so the read visibility consolidated in #567
-- (20260719234606) is unchanged. The definer function runs as owner and bypasses RLS to
-- perform the delete, exactly as the service-role deletion path already does.
--
-- Retroactive cleanup of already-orphaned rows: NOT possible from the current schema. A
-- match_players row with user_id = NULL is indistinguishable between "the human author's
-- account was deleted" and "the seat was vacated to AI while the author's account still
-- exists" — both are the same null (see the FK-cleanup migration's note that a deleted
-- player's seat becomes an AI seat "exactly as it already does for any other reason a human
-- vacates it"). No deleted-user audit trail survives to disambiguate, so a blanket sweep of
-- null-seat chat would erase live users' still-lawful messages. This trigger therefore only
-- covers deletions from here forward; pre-existing orphans (if any) are addressed in the
-- issue's acceptance notes, not guessed at here.

create or replace function public.erase_match_chat_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.match_chat mc
  where (mc.match_id, mc.seat) in (
    select mp.match_id, mp.seat
    from public.match_players mp
    where mp.user_id = old.id
  );
  return old;
end;
$$;

revoke execute on function public.erase_match_chat_on_profile_delete()
  from anon, authenticated, public;

drop trigger if exists erase_match_chat_before_profile_delete on public.profiles;
create trigger erase_match_chat_before_profile_delete
  before delete on public.profiles
  for each row
  execute function public.erase_match_chat_on_profile_delete();
