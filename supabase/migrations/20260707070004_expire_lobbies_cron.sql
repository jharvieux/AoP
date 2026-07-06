-- Lobby-expiry sweep schedule (#230), reusing the pg_cron + Vault-secret invocation
-- pattern established by #130/#144 in 20260705000000_cron_schedules.sql (the
-- extensions.invoke_maintenance_function helper this migration calls, and the
-- pg_cron/pg_net extensions it depends on) and #153's
-- 20260706000001_matchmaking_drain_cron.sql (same service-role-gated shape). Kept in
-- its own migration rather than editing an already-applied cron migration
-- (migrations are immutable once applied).
--
-- expire-lobbies is service-role gated (like sweep-turns/drain-matchmaking), so it
-- authenticates with the Vault 'service_role_key' secret (no new secret needed).
-- Hourly is ample against a 48h TTL (@aop/shared's LOBBY_TTL_MS) — this only ages out
-- rows nobody is actively using, so it doesn't compete with live match traffic and
-- doesn't need per-minute precision the way the turn-timer sweep does.
--
-- Idempotent: cron.schedule upserts a job by name.

select cron.schedule(
  'expire-lobbies-hourly',
  '0 * * * *',
  $$select extensions.invoke_maintenance_function('expire-lobbies', 'service_role_key')$$
);
