-- Cron failure visibility (#224).
--
-- `extensions.invoke_maintenance_function` (20260705000000_cron_schedules.sql) does
-- `select net.http_post(...)` — pg_net enqueues the request and returns immediately; the
-- eventual HTTP response lands in pg_net's own `net._http_response` table, which nothing
-- reads. `cron.job_run_details` reports every run as "succeeded" regardless of whether the
-- edge function itself 401s/500s, so sweep-turns (or compact-snapshots, or drain-matchmaking,
-- #153) can fail on every single invocation forever with zero signal.
--
-- Fix: `invoke_maintenance_function` now records a heartbeat row per invocation
-- (`extensions.maintenance_heartbeats`); a new every-minute cron job resolves each pending
-- heartbeat's outcome from `net._http_response` once the async response lands, or marks it
-- `timed_out` if none ever does. An operator (or a future alerting integration — the alert
-- *channel* itself is out of scope here, same as the issue notes) can now catch a silently
-- failing job with e.g.:
--
--   select job_name, ran_at, outcome, status_code
--   from extensions.maintenance_heartbeats
--   where outcome in ('error', 'timed_out')
--   order by ran_at desc;
--
-- Kept in its own migration rather than editing the already-applied cron migration
-- (migrations are immutable once applied) — `create or replace function` safely evolves
-- `invoke_maintenance_function`'s body in place, same pattern as
-- 20260706000002_finalize_match_with_ratings.sql establishes for functions in general.
--
-- Idempotent (safe to re-run): create table if not exists, create or replace function, and
-- cron.schedule upserts a job by name.

-- ---------------------------------------------------------------------------
-- One row per invocation of invoke_maintenance_function. Lives in `extensions` (like the
-- function itself), not `public` — never exposed via PostgREST, no RLS needed.
-- ---------------------------------------------------------------------------
create table if not exists extensions.maintenance_heartbeats (
  id bigint generated always as identity primary key,
  job_name text not null,
  request_id bigint not null,
  ran_at timestamptz not null default now(),
  status_code int,
  outcome text not null default 'pending' check (outcome in ('pending', 'ok', 'error', 'timed_out')),
  checked_at timestamptz
);

create index if not exists maintenance_heartbeats_pending_idx
  on extensions.maintenance_heartbeats (ran_at)
  where outcome = 'pending';

revoke all on extensions.maintenance_heartbeats from public;

-- ---------------------------------------------------------------------------
-- invoke_maintenance_function — unchanged behavior, plus a heartbeat row per call.
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

  insert into extensions.maintenance_heartbeats (job_name, request_id)
  values (function_name, request_id);

  return request_id;
end;
$$;

revoke all on function extensions.invoke_maintenance_function(text, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- check_maintenance_heartbeats — resolves pending heartbeats from pg_net's response table,
-- times out anything that never got a response, and prunes old resolved rows so this table
-- (fed by three every-minute jobs) doesn't grow without bound.
-- ---------------------------------------------------------------------------
create or replace function extensions.check_maintenance_heartbeats()
returns void
language plpgsql
set search_path = ''
as $$
begin
  update extensions.maintenance_heartbeats h
  set status_code = r.status_code,
      outcome = case
        when r.error_msg is not null then 'error'
        when r.status_code between 200 and 299 then 'ok'
        else 'error'
      end,
      checked_at = now()
  from net._http_response r
  where h.request_id = r.id
    and h.outcome = 'pending';

  -- No response ever landed (edge function hung, project paused, network dropped) — that's
  -- itself a failure signal, not silence.
  update extensions.maintenance_heartbeats
  set outcome = 'timed_out', checked_at = now()
  where outcome = 'pending'
    and ran_at < now() - interval '5 minutes';

  delete from extensions.maintenance_heartbeats
  where outcome != 'pending'
    and ran_at < now() - interval '3 days';
end;
$$;

revoke all on function extensions.check_maintenance_heartbeats() from public;

select cron.schedule(
  'check-maintenance-heartbeats-every-minute',
  '* * * * *',
  $$select extensions.check_maintenance_heartbeats()$$
);

-- ---------------------------------------------------------------------------
-- Smoke test, runs every time this migration applies (local dev, CI's supabase.yml
-- migrations job, and once against production): exercises check_maintenance_heartbeats
-- against synthetic pg_net response rows for all three outcomes, then cleans up after
-- itself. Fails loud (raises) if the resolution logic is wrong.
-- ---------------------------------------------------------------------------
do $$
declare
  ok_id bigint;
  err_id bigint;
  timeout_id bigint;
  ok_request_id bigint := -101;
  err_request_id bigint := -102;
  timeout_request_id bigint := -103;
  outcome_check text;
begin
  insert into extensions.maintenance_heartbeats (job_name, request_id, ran_at)
  values
    ('smoke-test-ok', ok_request_id, now()),
    ('smoke-test-error', err_request_id, now()),
    ('smoke-test-timeout', timeout_request_id, now() - interval '10 minutes');

  select id into ok_id from extensions.maintenance_heartbeats where request_id = ok_request_id;
  select id into err_id from extensions.maintenance_heartbeats where request_id = err_request_id;
  select id into timeout_id from extensions.maintenance_heartbeats where request_id = timeout_request_id;

  insert into net._http_response (id, status_code, created)
  values (ok_request_id, 200, now());
  insert into net._http_response (id, status_code, error_msg, created)
  values (err_request_id, 500, 'internal server error', now());
  -- timeout_id deliberately gets no net._http_response row.

  perform extensions.check_maintenance_heartbeats();

  select outcome into outcome_check from extensions.maintenance_heartbeats where id = ok_id;
  if outcome_check != 'ok' then
    raise exception 'maintenance_heartbeats smoke test: expected ok row to resolve to ''ok'', got %', outcome_check;
  end if;

  select outcome into outcome_check from extensions.maintenance_heartbeats where id = err_id;
  if outcome_check != 'error' then
    raise exception 'maintenance_heartbeats smoke test: expected 500 row to resolve to ''error'', got %', outcome_check;
  end if;

  select outcome into outcome_check from extensions.maintenance_heartbeats where id = timeout_id;
  if outcome_check != 'timed_out' then
    raise exception 'maintenance_heartbeats smoke test: expected stale row to resolve to ''timed_out'', got %', outcome_check;
  end if;

  -- Clean up: neither the synthetic heartbeats nor the synthetic pg_net responses should
  -- persist past this migration.
  delete from extensions.maintenance_heartbeats where id in (ok_id, err_id, timeout_id);
  delete from net._http_response where id in (ok_request_id, err_request_id, timeout_request_id);
end $$;
