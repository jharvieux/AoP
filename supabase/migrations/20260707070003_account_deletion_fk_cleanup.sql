-- Let a user who has ever played be deleted (#229).
--
-- `profiles` cascades from `auth.users`, but `matches.created_by`,
-- `match_players.user_id`, and `match_spectators.granted_by` had no ON DELETE
-- behavior (the default, NO ACTION) — deleting the auth.users row cascades
-- into profiles, which then hits one of these FKs and aborts the whole
-- delete. Supabase's admin delete-user API (and any GDPR/account-deletion
-- flow) hard-failed for any user who ever created or joined a match, with no
-- path but manual SQL surgery.
--
-- Fix: `on delete set null` for all three, matching the existing
-- null-means-AI-seat convention on match_players.user_id — a deleted
-- player's seat becomes an AI seat exactly as it already does for any other
-- reason a human vacates it. `matches.created_by` and
-- `match_spectators.granted_by` must become nullable to carry `set null`;
-- `designate-spectator` and `start-match` already treat a `created_by`
-- mismatch as "not authorized", so a null creator after account deletion
-- simply means no one can act as creator anymore, which is the correct
-- degraded state (no impostor host).

alter table match_players
  drop constraint match_players_user_id_fkey,
  add constraint match_players_user_id_fkey
    foreign key (user_id) references profiles (id) on delete set null;

alter table matches
  alter column created_by drop not null;

alter table matches
  drop constraint matches_created_by_fkey,
  add constraint matches_created_by_fkey
    foreign key (created_by) references profiles (id) on delete set null;

alter table match_spectators
  alter column granted_by drop not null;

alter table match_spectators
  drop constraint match_spectators_granted_by_fkey,
  add constraint match_spectators_granted_by_fkey
    foreign key (granted_by) references profiles (id) on delete set null;
