-- Community map library (#63 Tier 2): publish/browse/search shared maps, download
-- counts, report/auto-hide moderation, author remove.
-- Adds on top of 20260702000000_initial_schema.sql / 20260702000001_rls_policies.sql.
-- All operations are idempotent (safe to re-run).
--
-- Moderation posture (operator decision, #63): POST-moderation. A published map is
-- live immediately (`status = 'published'`). Any authenticated user may report it;
-- once REPORT_AUTO_HIDE_THRESHOLD (3, an @aop/shared constant passed in by the
-- report-map Edge Function) DISTINCT REGISTERED (profiles.is_guest = false) accounts
-- have reported it, `file_map_report` flips it to 'hidden' — off the public library,
-- pending manual review. Guest/anonymous reports are recorded for the reviewer but
-- never counted toward the threshold: anonymous sessions are free to mass-create, so
-- counting them would let one person hide any map with three throwaway sessions.
-- Restoring is a manual moderation action (operator sets status back to 'published'
-- via the dashboard/SQL); nothing auto-restores. 'removed' is the author's own soft
-- delete (remove-map Edge Function) — soft so the row still counts against the
-- author's publish rate limit (remove-and-republish is not a spam bypass) and stays
-- auditable.
--
-- Publishers are REGISTERED users only (operator decision): the publish-map Edge
-- Function rejects profiles with is_guest = true, tying every published map to a real
-- account. Browsing/downloading needs only an authenticated session (guests included).

create table if not exists community_maps (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references profiles (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 60),
  -- The Tier-1 "AOPMAP1:" map code, exactly as validated. 64 KiB cap: the largest
  -- legal map (40x40) with zero RLE compression encodes to ~30 KiB, so this is ~2x
  -- headroom for any real map while rejecting oversized spam at the schema level too
  -- (defense in depth behind the Edge Function's own MAP_CODE_MAX_BYTES check).
  map_code       text not null check (octet_length(map_code) <= 65536),
  -- Browse/filter metadata denormalized from the validated map, so listing never
  -- decodes payloads.
  width          int not null,
  height         int not null,
  player_count   int not null,
  status         text not null default 'published'
                 check (status in ('published', 'hidden', 'removed')),
  download_count int not null default 0,
  -- Distinct REGISTERED reporters, maintained by file_map_report below.
  report_count   int not null default 0,
  created_at     timestamptz not null default now()
);

-- The browse query: published maps, newest first (keyset-paged on (created_at, id)).
create index if not exists community_maps_browse_idx
  on community_maps (status, created_at desc, id desc);
-- The publish rate-limit window count and "my maps" lookups.
create index if not exists community_maps_author_idx
  on community_maps (author_id, created_at desc);

-- One report per user per map, forever — the primary key makes re-reporting (even
-- after a restore) a no-op, so a single account can never stack the threshold.
create table if not exists community_map_reports (
  map_id      uuid not null references community_maps (id) on delete cascade,
  reporter_id uuid not null references profiles (id) on delete cascade,
  reason      text check (char_length(reason) <= 500),
  created_at  timestamptz not null default now(),
  primary key (map_id, reporter_id)
);

-- RLS: enabled with NO client policies on either table — all reads and writes go
-- through the community-map Edge Functions using the service role (#150's
-- access-control pattern). Rationale: every path here is abuse-adjacent. Publishing
-- must re-validate the map server-side and enforce the rate limit; downloads must
-- increment the counter server-side (a direct-read grant would let clients scrape
-- codes without counting, or hammer rows); report writes must stay tied to the
-- auto-hide accounting; and browse must never leak hidden/removed rows or report
-- state. A public SELECT policy was rejected because map_code egress and moderation
-- state are column-level concerns RLS can't express without a separate view.
alter table community_maps enable row level security;
alter table community_map_reports enable row level security;

-- ---------------------------------------------------------------------------
-- file_map_report — atomic report + auto-hide (#63).
--
-- Inserts the report (idempotent via the primary key), recounts DISTINCT registered
-- reporters, stores that count, and hides the map when the count reaches the
-- threshold — all in one transaction, so two concurrent reports can never race the
-- counter past the threshold without the hide firing. The threshold arrives as a
-- parameter so its single source of truth stays REPORT_AUTO_HIDE_THRESHOLD in
-- @aop/shared (communityMaps.ts), next to its tests.
--
-- Only ever transitions 'published' -> 'hidden' (a 'removed' map stays removed).
-- Note for moderators: the count includes prior reporters, so a manually-restored map
-- will re-hide on the NEXT registered report unless the restore also deletes the
-- map's community_map_reports rows ("the reports were bogus"). That lean-safe default
-- is deliberate — a restore without a wiped slate stays on a hair trigger.
--
-- SECURITY DEFINER + revoked-from-public: only the service role (the report-map
-- Edge Function) may call it.
-- ---------------------------------------------------------------------------
create or replace function public.file_map_report(
  p_map_id uuid,
  p_reporter uuid,
  p_reason text,
  p_auto_hide_threshold int
)
returns table (status text, report_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registered_reports int;
begin
  insert into public.community_map_reports (map_id, reporter_id, reason)
  values (p_map_id, p_reporter, nullif(p_reason, ''))
  on conflict (map_id, reporter_id) do nothing;

  select count(*) into v_registered_reports
  from public.community_map_reports r
  join public.profiles p on p.id = r.reporter_id
  where r.map_id = p_map_id
    and p.is_guest = false;

  update public.community_maps m
  set report_count = v_registered_reports,
      status = case
        when m.status = 'published' and v_registered_reports >= p_auto_hide_threshold
          then 'hidden'
        else m.status
      end
  where m.id = p_map_id;

  return query
  select m.status, m.report_count
  from public.community_maps m
  where m.id = p_map_id;
end;
$$;

revoke all on function public.file_map_report(uuid, uuid, text, int) from public;
grant execute on function public.file_map_report(uuid, uuid, text, int) to service_role;

-- ---------------------------------------------------------------------------
-- increment_map_downloads — atomic download counter (#63). Guarded on
-- status = 'published' so downloads of a hidden/removed map (only its author can
-- fetch those) never move the public counter. SECURITY DEFINER + service_role-only,
-- same as above.
-- ---------------------------------------------------------------------------
create or replace function public.increment_map_downloads(p_map_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.community_maps
  set download_count = download_count + 1
  where id = p_map_id
    and status = 'published';
$$;

revoke all on function public.increment_map_downloads(uuid) from public;
grant execute on function public.increment_map_downloads(uuid) to service_role;
