-- Push-token retention: auto-purge tokens not re-registered for 90 days (#574).
--
-- Operator ruling on the docs/DATA-CLASSIFICATION.md "push-token retention" gap: adopt the
-- suggested default of purging device tokens whose last registration is older than 90 days.
--
-- Why updated_at is the freshness signal: push_tokens.updated_at is bumped server-side by the
-- push_tokens_set_updated_at trigger (20260705000003_push_tokens.sql, search_path pinned in
-- 20260719234510_...) on every insert/update. The web client re-registers on every app start
-- (apps/web/src/main.tsx calls registerForPushNotifications(); the 'registration' listener
-- upserts via syncPushToken -> PushTokenStore.upsert with resolution=merge-duplicates), so
-- updated_at is effectively "device last seen the app". A row older than 90 days means the
-- device has not opened the app in 90 days; deleting it is safe because the next launch
-- re-registers and re-inserts the row. Worst case for a purged-then-returning device is one
-- missed "your turn" push before its next app open re-registers it.
--
-- Definer-function hygiene (matches the rest of the chain -- see 20260719234448_...): the
-- routine is SECURITY DEFINER with an empty pinned search_path, and EXECUTE is revoked from
-- the client-facing roles so it is never callable as a PostgREST RPC. The daily purge runs
-- from a trusted maintenance context (postgres, via pg_cron) -- see the wiring note below.

create or replace function public.purge_stale_push_tokens(retention_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.push_tokens
  where updated_at < now() - make_interval(days => retention_days);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Newly created functions carry a default EXECUTE grant to PUBLIC, which also exposes them as
-- callable RPCs to anon/authenticated. This is server-only maintenance -- revoke that grant so
-- only the owner (postgres) and service_role can invoke it.
revoke execute on function public.purge_stale_push_tokens(integer) from anon, authenticated, public;

-- Scheduling note (operator follow-up): this migration ships the routine but does NOT add a
-- cron job. Neither existing scheduled function (sweep-turns, compact-snapshots) is a natural
-- home for a push-token DELETE, and a brand-new cron schedule is a net-new job. To activate
-- the daily purge, run once against the target environment (e.g. alongside the 04:00 UTC
-- maintenance window, offset to avoid contention):
--   select cron.schedule(
--     'purge-stale-push-tokens-daily',
--     '30 4 * * *',
--     $$select public.purge_stale_push_tokens()$$
--   );
