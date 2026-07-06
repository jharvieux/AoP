-- Private Realtime match channels (#228, docs/MULTIPLAYER.md §6/§7/§11).
--
-- Before this migration the `match:{id}` broadcast channels were public: any client
-- holding the anon key and a match id could subscribe (observing a private match's
-- activity timing), and — because Realtime broadcast is peer-to-peer on public
-- channels — could also SEND forged 'turn'/'chat' pokes to every legitimate
-- subscriber, triggering refetch storms (cheap client->server amplification).
--
-- Fix: match channels become private. The Edge Functions' poke path
-- (broadcastTurn / broadcastChat in supabase/functions/_shared) now sends with
-- `config.private = true`, and clients must subscribe the same way. Joining a
-- private channel is authorized against RLS on realtime.messages:
--
--   * SELECT (receive) — granted below only to an authenticated user who holds a
--     seat (match_players) or a spectator grant (match_spectators) in the topic's
--     match. Anyone else is refused at subscribe time.
--   * INSERT (send)    — NO policy is created, so no client can ever broadcast on
--     a match channel. The service role bypasses RLS, so the server poke path is
--     unaffected. This preserves the §7 listen-only contract.
--
-- The payloads were already safe (seq/id-only pokes, never state); this closes the
-- subscribe/forge hole around them.
--
-- Idempotent (safe to re-run): drop-then-create policy. RLS is enabled on
-- realtime.messages by the platform itself.

drop policy if exists match_channel_receive on realtime.messages;
create policy match_channel_receive on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      exists (
        select 1
        from public.match_players mp
        where mp.user_id = (select auth.uid())
          and realtime.topic() = 'match:' || mp.match_id::text
      )
      or exists (
        select 1
        from public.match_spectators ms
        where ms.user_id = (select auth.uid())
          and realtime.topic() = 'match:' || ms.match_id::text
      )
    )
  );
