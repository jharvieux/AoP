-- Push-token storage for "your turn" notifications (#157).
--
-- Unlike the multiplayer game-state tables (which are written only by Edge
-- Functions with the service-role key — see 20260702000001_rls_policies.sql),
-- push tokens are written directly by the authenticated client: the device is
-- the only party that knows its own APNs/FCM token. RLS therefore restricts
-- every operation to the caller's own rows so a token — which can be used to
-- spam a specific device — is never readable or writable across users.
--
-- Sending pushes is out of scope here (#158); this migration only establishes
-- the storage surface.

create table push_tokens (
  user_id    uuid not null references auth.users (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android', 'web')),
  token      text not null,
  updated_at timestamptz not null default now(),
  -- One token per user per platform: a device re-registering (e.g. after a
  -- reinstall issues a fresh token) upserts this row rather than accumulating
  -- duplicates. Trade-off: only the most-recently-registered device per
  -- platform is retained for a given user.
  primary key (user_id, platform)
);

-- Server-authoritative updated_at: bumped on every insert/update so the column
-- reflects the last registration regardless of client clock skew (an upsert's
-- ON CONFLICT DO UPDATE would otherwise leave the default-only value stale).
create or replace function set_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger push_tokens_set_updated_at
  before insert or update on push_tokens
  for each row execute function set_push_tokens_updated_at();

alter table push_tokens enable row level security;

-- Own rows only, for every operation (select/insert/update/delete). `using`
-- guards reads/updates/deletes; `with check` guards the post-image of
-- inserts/updates so a caller cannot write a row owned by another user.
create policy push_tokens_all_own on push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
