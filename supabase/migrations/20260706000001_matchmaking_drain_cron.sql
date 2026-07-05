-- Quick-match queue drain schedule (#153), reusing the pg_cron + Vault-secret invocation
-- pattern established by #130/#144 in 20260705000000_cron_schedules.sql — which created the
-- extensions.invoke_maintenance_function helper this migration calls, and the pg_cron/pg_net
-- extensions it depends on. Kept in its own migration rather than editing the already-applied
-- cron migration (migrations are immutable once applied).
--
-- drain-matchmaking is service-role gated (like sweep-turns, #130), so it authenticates with
-- the Vault 'service_role_key' secret. Every minute keeps quick-match queue waits short for a
-- v1 async experience; the drain is idempotent and cheap when the queue is empty (it claims
-- nothing and returns), so a frequent cadence costs little.
--
-- Operator setup (the same Vault secrets #130 already documents — no new secret needed):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY>',        'service_role_key');
--
-- Idempotent: cron.schedule upserts a job by name.

select cron.schedule(
  'drain-matchmaking-every-minute',
  '* * * * *',
  $$select extensions.invoke_maintenance_function('drain-matchmaking', 'service_role_key')$$
);
