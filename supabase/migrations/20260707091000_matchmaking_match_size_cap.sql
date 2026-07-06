-- Cap quick-match match_size at the faction pool size (#219).
--
-- `matchmaking_queue.match_size` allowed 2-8, but factions are unique per match and
-- FACTION_IDS has exactly 5 entries, so a 6-8 player group ALWAYS crashed the drain:
-- `assignQuickMatchSeats` throws on faction exhaustion after `claim_matchmaking_group`
-- has already deleted the players' queue rows in its own committed transaction —
-- stranding them with no match, no re-queue, and no notification, and aborting the
-- rest of the drain run. Such matches can never fill anywhere (create-match's
-- parseSettings now enforces the same 2..5 bound), so the constraint is tightened at
-- the source. The drain also gained a compensating re-queue for any *other*
-- createQuickMatch failure (see supabase/functions/_shared/matchmaking.ts).
--
-- Existing rows with match_size > 5 are deleted rather than clamped: they represent
-- an intent ("find me a 6-player match") that can never be satisfied, and their
-- owners simply re-queue with a valid size. Without this delete the ALTER would fail
-- on any such row.
--
-- Idempotent (safe to re-run): the delete matches nothing on a second run, and the
-- constraint is dropped-if-exists then re-added.

delete from matchmaking_queue where match_size > 5;

alter table matchmaking_queue drop constraint if exists matchmaking_queue_match_size_check;
alter table matchmaking_queue add constraint matchmaking_queue_match_size_check
  check (match_size between 2 and 5); -- 5 = FACTION_IDS.length (@aop/shared MAX_MATCH_PLAYERS)
