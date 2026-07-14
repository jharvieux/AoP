-- Raise the community_maps.map_code byte cap 64 KiB -> 256 KiB (#507, follow-up to
-- the 4x-area map quadrupling that raised MAP_VALIDATION_LIMITS.maxSize 48 -> 96).
-- The original inline check (20260707063000_community_maps.sql, `octet_length(map_code)
-- <= 65536`) was sized so the worst-case zero-RLE-compression LEGAL map (~35 KiB at
-- 48x48) fit with ~2x headroom; at 96x96 that worst case measures ~178 KiB, so the old
-- cap broke the "any legal map fits" guarantee. 256 KiB restores it (~1.4x headroom)
-- while still rejecting megabyte-scale spam payloads at the schema level. That applied
-- migration is never edited, so the constraint is widened here instead.
--
-- Mirrors MAP_CODE_MAX_BYTES in packages/shared/src/communityMaps.ts (bumped to 262144
-- in the same PR; parity enforced by constants-parity.test.ts). The publish-map Edge
-- Function reads the constant from the vendored shared package, so it must be
-- redeployed in the same deploy.yml dispatch that applies this migration.
--
-- Purely additive: every existing row satisfies octet_length <= 65536 <= 262144, so
-- nothing needs deleting (same shape as 20260712000000_matchmaking_queue_xlarge_map_size.sql).
--
-- Idempotent (safe to re-run): the constraint is dropped-if-exists then re-added.
-- `community_maps_map_code_check` is the name Postgres auto-generated for the
-- original inline column check.

alter table community_maps drop constraint if exists community_maps_map_code_check;
alter table community_maps add constraint community_maps_map_code_check
  check (octet_length(map_code) <= 262144);
