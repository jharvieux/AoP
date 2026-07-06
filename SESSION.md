# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-05 (principal-architect review of the whole app; 52 issues filed,
no code changed)._

## Just completed

**Principal-architect audit of the entire app** (operator-requested): four parallel review
agents (engine / server tier / web client / cross-cutting) + supervisor verification of the
highest-stakes claims against source. 58 raw findings consolidated into **52 new issues,
#205–#256**, labeled bug/enhancement/security + P0–P3. No code changed this session.

Highest-priority findings (all verified against source unless noted):

- **#216 (P0)**: `appendAction` is two non-transactional statements — a crash between the
  `match_actions` insert and the `action_count` update permanently wedges the match
  (every later append SEQ_CONFLICTs forever). Fix is an RPC like
  `finalize_match_with_ratings`.
- **#205/#206 (P1, anti-cheat)**: client-submittable `gainCaptainXp` grants arbitrary XP;
  numeric action fields accept fractional values (and NaN via non-JSON paths) — the
  reducer-as-validation-layer has holes plus no structural Action validation at the
  submit-action boundary.
- **#217 (P1)**: self-referencing RLS policy on `match_players` likely makes every client
  PostgREST read of the game tables fail with infinite-recursion (needs local repro —
  service role masks it server-side).
- **#218 (P1)**: no `verify_jwt = false` config anywhere → default JWT verification will
  401 the Stripe webhook (paid but never granted) and the compaction cron.
- **#219 (P1)**: quick-match accepts 6–8 players but only 5 factions exist — the drain
  claims (deletes) the queue rows then crashes, silently stranding players.
- **#233/#234/#235 (P1, client)**: OAuth sign-in is a dead end (redirect tokens never
  parsed); access token never refreshed after mount (everything 401s after ~1h); setup
  offers hotseat seats GameScreen can't play.
- **#248/#249/#250 (P1, cross-cutting)**: edge functions have zero CI coverage (no deno
  check/test ever runs); no deploy pipeline or smoke test for any tier;
  buildMatchConfig/buildCatalog client/server twins have already drifted (resourceNodes —
  #169 was closed but the drift persists).

Several issues need **operator decisions/actions** (flagged in their bodies): #218
(config.toml, supervised), #248/#249/#252 (workflow changes, supervised), #243 +
#252 (runtime deps @supabase/realtime-js and Sentry need explicit approval), #219
(product call: cap matches at 5 players vs allow duplicate factions), #253 (git-LFS /
asset history).

## Next steps

1. Operator triage of #205–#256 (P0 #216 first; then the P1 batch). A normal
   `/issue-sweep` can pick up the rest — model-tier labels were deliberately left to
   sweep triage.
2. **#132**: email notifications — still needs a `RESEND_API_KEY` secret provisioned.
3. **Capacitor native track** (#98, #100, #156, #159, #160, #161): still blocked on
   physical device access.
4. **#203**: sweep process gap (CI silently blocked on conflict) — still unactioned.

## Blocked on user

- Decisions embedded in the new issues listed above (supervised paths + two runtime-dep
  approvals + the 5-faction/8-player product call in #219).

## Open questions

- None beyond the issue-embedded decisions above.

## Prior session summary (2026-07-06 follow-up round, unchanged)

#93/#177/#189 finalized (PRs #193–195); #63 fully closed (PRs #197, #199); visuals/audio
gaps fixed (PRs #200–202: tier-1 unit art, deep/port tiles, local music/SFX generation);
filed #203 (CI-silently-blocked-on-conflict process gap); closed #81 as stale.

## Prior session summary (2026-07-05, migration-unblocked sweep round, unchanged)

Operator approved migrations + #138 betrayal policy; full sweep round (3 waves, 15 issues,
PRs #174-176, #178-188, #190-191); fixed local Supabase/colima (PR #187); closed epics
#36-38, #40. Filed #189.

## Prior session summary (2026-07-05, DreamShaper art re-pass + multiplayer sweep, unchanged)

`/issue-sweep` against 34 epic sub-issues; 11-issue unsupervised plan (PRs #164-168), then
the full #89 DreamShaper re-pass (PR #172, #173).

## Prior session summary (2026-07-04 full issue-sweep, unchanged)

Triaged 27 open issues, executed 9 batches (16 issues, PRs #117-#125), all merged clean.
