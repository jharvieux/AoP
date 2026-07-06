-- Enforce faction uniqueness per match at the database (#220).
--
-- `join-match` (supabase/functions/join-match/index.ts) reads taken factions,
-- rejects a duplicate in JS, then inserts — check-then-insert, not atomic. Its
-- 23505 handler already says "A racing joiner grabbed the seat or faction",
-- but match_players' only uniqueness was `primary key (match_id, seat)`: a
-- faction race was never actually caught, so two concurrent joiners with the
-- same faction preference (or both falling through firstFreeFaction from the
-- same stale read) could both insert and hold the same faction, and
-- start-match would build a game with duplicate factions.
--
-- create-match and the matchmaking drain assign every seat a disjoint faction
-- by construction, so this constraint can never reject a legitimate insert —
-- it only closes the join-match race, exactly as the existing 23505 handling
-- already assumed.

create unique index match_players_match_faction_key on match_players (match_id, faction);
