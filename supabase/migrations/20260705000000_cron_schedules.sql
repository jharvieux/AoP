-- Scheduled server-side maintenance jobs (#130, #144), per docs/MULTIPLAYER.md §8 and §10.
--
-- Combined into one migration on purpose: both jobs share the same mechanism (pg_cron +
-- pg_net invoking a deployed Edge Function), and #144 explicitly recommends folding into
-- #130's cron migration so the supervised `supabase/migrations/**` path is touched once.
--
--   #130 — sweep-turns:      every minute  (§8 turn-timer sweep; keeps matches live)
--   #144 — compact-snapshots: daily 04:00 UTC (§10 snapshot compaction; low-traffic window)
--
-- Auth: neither function takes a user JWT. `sweep-turns` requires the service-role key
-- (requireServiceRole in _shared/client.ts); `compact-snapshots` requires CRON_SECRET
-- (requireCronSecret in compact-snapshots/index.ts). Both are read at run time from Supabase
-- Vault so NO secret value is ever committed in this SQL.
--
-- Operator setup (one-time, per environment — secrets live in Vault, not in git):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY>',        'service_role_key');
--   select vault.create_secret('<CRON_SECRET>',                      'cron_secret');
-- Until those three secrets exist the scheduled jobs raise (fail loud) and log the failure
-- in cron.job_run_details rather than silently no-op'ing.
--
-- Idempotent (safe to re-run): create extension if not exists, create or replace function,
-- and cron.schedule upserts a job by name.

-- ---------------------------------------------------------------------------
-- Extensions: pg_cron (the scheduler) and pg_net (async HTTP from Postgres).
-- Both ship preloaded on the Supabase Postgres image (local and hosted).
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Helper: post to a deployed Edge Function, bearing a Vault-stored secret.
--
-- Lives in `extensions` (not `public`), so PostgREST never exposes it as an RPC and it does
-- not show up in the generated Data API types. Runs as its owner (postgres) inside the
-- cron job, which is what grants it Vault + pg_net access. Fails loud if a required secret
-- is missing so a misconfigured environment surfaces in cron.job_run_details.
-- ---------------------------------------------------------------------------
create or replace function extensions.invoke_maintenance_function(
  function_name text,
  auth_secret_name text,
  request_body jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  base_url text;
  auth_secret text;
  request_id bigint;
begin
  select decrypted_secret into base_url
  from vault.decrypted_secrets
  where name = 'project_url';
  if base_url is null then
    raise exception 'Vault secret "project_url" is not set; cannot invoke edge function %', function_name;
  end if;

  select decrypted_secret into auth_secret
  from vault.decrypted_secrets
  where name = auth_secret_name;
  if auth_secret is null then
    raise exception 'Vault secret "%" is not set; cannot invoke edge function %', auth_secret_name, function_name;
  end if;

  select net.http_post(
    url := base_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || auth_secret
    ),
    body := request_body
  ) into request_id;

  return request_id;
end;
$$;

-- Not exposed via the Data API, but revoke anyway (defense in depth): only the owner
-- (postgres), which the cron jobs run as, may call it.
revoke all on function extensions.invoke_maintenance_function(text, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- #130 — turn-timer sweep, every minute (§8). Service-role gated.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'sweep-turns-every-minute',
  '* * * * *',
  $$select extensions.invoke_maintenance_function('sweep-turns', 'service_role_key')$$
);

-- ---------------------------------------------------------------------------
-- #144 — snapshot compaction, daily at 04:00 UTC (§10). CRON_SECRET gated.
-- Daily is ample: compaction only trims snapshot history (the action log is untouched),
-- so a once-a-day pass keeps storage bounded without competing with live match traffic.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'compact-snapshots-daily',
  '0 4 * * *',
  $$select extensions.invoke_maintenance_function('compact-snapshots', 'cron_secret')$$
);
