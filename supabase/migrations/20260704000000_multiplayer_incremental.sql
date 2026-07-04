-- Multiplayer incremental schema additions (#31/#32/#33)
-- Adds new features on top of 20260702000000_initial_schema.sql and 20260702000001_rls_policies.sql.
-- All operations are idempotent (safe to re-run).

-- ---------------------------------------------------------------------------
-- Profiles: add is_guest column for auth upgrade tracking (#31)
-- ---------------------------------------------------------------------------
alter table profiles
add column if not exists is_guest boolean not null default false;

-- Trigger: auto-create profile row on new auth user (including guests) (#31)
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, is_guest)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Captain ' || substr(new.id::text, 1, 8)
    ),
    coalesce(new.is_anonymous, false)
  )
  on conflict (id) do update
  set is_guest = excluded.is_guest
  where profiles.is_guest is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Cloud saves: guest saves promoted to account on upgrade (#31)
-- ---------------------------------------------------------------------------
create table if not exists cloud_saves (
  user_id        uuid not null references profiles(id) on delete cascade,
  slot_id        text not null,
  schema_version int not null,
  config         jsonb not null,
  actions        jsonb not null,  -- action log; replayed on load (event-sourced)
  round          int not null,
  saved_at       timestamptz not null default now(),
  primary key (user_id, slot_id)
);

-- cloud_saves RLS: full CRUD on own rows (guest-accessible single-player data) (#31)
alter table cloud_saves enable row level security;
drop policy if exists cloud_saves_all_own on cloud_saves;
create policy cloud_saves_all_own on cloud_saves
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Indexes for query performance (#32, #33)
-- ---------------------------------------------------------------------------
create index if not exists match_players_user_idx on match_players(user_id);
create index if not exists matches_timer_idx on matches(status, turn_deadline);
