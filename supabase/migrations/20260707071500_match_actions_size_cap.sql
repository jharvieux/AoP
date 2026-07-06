-- Defense-in-depth payload size cap on `match_actions.action` (#223).
--
-- `_shared/match.ts` now rebuilds every persisted action from a per-type field whitelist
-- (`sanitizeAction`) instead of spreading the client's raw JSON, which stops arbitrary
-- top-level junk keys. This CHECK is the belt-and-suspenders backstop against a legitimate
-- field itself being made huge (e.g. `attackCaptain.boardCommands`) — same pattern as
-- `community_maps.map_code`'s 64KiB cap in 20260707063000_community_maps.sql.
--
-- Sizing: the largest legitimate action is `attackCaptain` with a full-length boarding
-- melee — up to `maxStacksPerSide` (7) attacker-stack activations per round for up to
-- `maxRounds` (30) rounds (packages/content/src/tuning.ts's naval battle tuning), i.e. up to
-- 210 `boardCommands` entries, plus a 30-entry `attackerOrders` array. Measured via
-- `JSON.stringify` on a synthetic worst-case action: ~10.5KB. 32KiB gives ~3x headroom for
-- that (and any tuning growth) while still firmly rejecting megabyte-scale abuse.
--
-- Idempotent (safe to re-run): drop-then-add the constraint by name.

alter table match_actions drop constraint if exists match_actions_size_check;
alter table match_actions
  add constraint match_actions_size_check check (octet_length(action::text) <= 32768);
