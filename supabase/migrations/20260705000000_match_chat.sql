-- Per-match chat (#139) with an alliance-scoped channel (#140).
-- Companion to docs/MULTIPLAYER.md §11 (listen-only channel) and §14 (chat is
-- per-match from match start; there is no pre-match lobby chat in v1).
--
-- Authority model (§4): writes never go through a client-facing INSERT policy —
-- they flow through the `send-chat` Edge Function using the service-role key,
-- which derives the author's seat from the JWT and enforces length/rate limits.
-- Clients only ever SELECT (RLS below); the channel stays listen-only for them,
-- matching the "notification spam via channel" mitigation in §11.
--
-- The alliance-channel column (`alliance_id`) and its RLS policy ship here up
-- front (recommended by #139) so #140 — which populates `alliance_id` by
-- mirroring the engine's AllianceState — needs no second migration.
-- All operations are idempotent (safe to re-run).

create table if not exists match_chat (
  id          bigint generated always as identity primary key,
  match_id    uuid not null references matches (id) on delete cascade,
  seat        int not null,                 -- author's seat; JWT-derived, never client-supplied
  channel     text not null check (channel in ('all', 'alliance')),
  -- Non-null iff channel = 'alliance': the sender's alliance-cluster id (the
  -- lowest seat in their connected alliance component, stamped at send time by
  -- send-chat). RLS below gates alliance reads on the reader's *current*
  -- alliance_id matching this value.
  alliance_id int,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now(),
  -- 'all' carries no alliance_id; 'alliance' must carry one.
  constraint match_chat_alliance_id_matches_channel
    check ((channel = 'alliance') = (alliance_id is not null))
);

-- Reading a match's chat in send order (both the initial fetch and the
-- refetch-on-poke path in apps/web/src/multiplayer/chatSync.ts).
create index if not exists match_chat_match_created_idx on match_chat (match_id, created_at);

alter table match_chat enable row level security;

-- 'all' channel: readable by any user who occupies a seat in the match. No
-- INSERT/UPDATE policy exists — all writes are service-role (§4).
drop policy if exists match_chat_select_all_channel on match_chat;
create policy match_chat_select_all_channel on match_chat for select
using (
  channel = 'all'
  and exists (
    select 1
    from match_players
    where match_players.match_id = match_chat.match_id
      and match_players.user_id = auth.uid()
  )
);

-- 'alliance' channel: readable only by a *current* member of the stamped
-- alliance cluster. Because #140 mirrors the engine's live AllianceState into
-- match_players.alliance_id, a member who leaves the alliance has their
-- alliance_id recomputed and immediately loses read access to the whole
-- channel history — the persisted-chat analogue of #137's vision revocation
-- (leaving revokes the shared benefit wholesale, not just prospectively).
drop policy if exists match_chat_select_alliance_channel on match_chat;
create policy match_chat_select_alliance_channel on match_chat for select
using (
  channel = 'alliance'
  and exists (
    select 1
    from match_players
    where match_players.match_id = match_chat.match_id
      and match_players.user_id = auth.uid()
      and match_players.alliance_id = match_chat.alliance_id
  )
);
