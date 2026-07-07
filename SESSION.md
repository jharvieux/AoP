# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-07 (first real prod deploy attempt — DB live, edge functions
blocked, MEMORY D-025)._

## Just completed

- **First-ever prod deploy attempt** against the real Supabase project
  (`udsuxdoavlvosvbjwmud`). Full story in MEMORY D-025.
  - **Database: live.** All 23 migrations pushed; 14 tables now exist (was completely
    empty going in — the project existed but nothing had ever been deployed to it).
  - **Edge functions: still 0 deployed**, but made real progress. Found and fixed the
    actual blocking bug (#339, PR #340 open, not yet merged): `supabase/functions/
    deno.json`'s import map pointed `@aop/shared`/`@aop/engine`/`@aop/content` at
    `../../packages/*/src`, which `supabase functions deploy`'s bundler can't reach
    (only sees `supabase/functions/`). Added `scripts/vendor-function-deps.mjs` to copy
    those packages into a gitignored `supabase/functions/_vendor/` with `.ts` extensions
    added to relative imports (Deno requires them). Confirmed via `--debug` that the
    full module graph now resolves cleanly — this part of the fix works.
  - **Hit a second, separate, unrelated bug** (#341, not fixed): local colima Docker
    fails at the bundler's "Building vfs" step with an opaque `Effect.tryPromise` error,
    for literally any function including an empty test one. Ruled out bundle size,
    Docker daemon health, colima resources, CLI version — looks like a colima/CLI Docker
    incompatibility specific to this machine. Local `supabase start`/dev is NOT
    affected, only the deploy path.
  - **Vercel web deploy: not attempted.** Vercel CLI is already authenticated
    (`jharvieux-1491`) and the `age-of-plunder` project already exists, just not yet
    linked from `apps/web` (`vercel link` not yet run). Per `docs/runbooks/deploy.md`'s
    own rule, didn't deploy the client against unconfirmed backend state.
  - Operator chose to **stop for the day** rather than set up the `deploy.yml` GitHub
    Actions path (the likely way around #341 — real Ubuntu Docker, not colima) — that
    needs minting a new `VERCEL_TOKEN` and provisioning 6 `production`-environment
    secrets, flagged as an operator-facing step rather than done silently.

## In flight

- **PR #340** (vendoring fix for #339) — open, `pnpm verify` green, not yet merged.
  Needs CI to run + squash-merge.
- **colima is currently running** on this machine (started this session, previously
  stopped; bumped to `--cpu 4 --memory 8` mid-session for a since-ruled-out OOM theory).
  Left running; harmless to stop or leave.

## Next step

- Merge PR #340 once CI is green.
- To actually finish the deploy: set up `deploy.yml`'s `production` environment secrets
  (`SUPABASE_ACCESS_TOKEN` = the `SUPABASE_PAT` already in `.env.local`,
  `SUPABASE_PROJECT_REF` = `udsuxdoavlvosvbjwmud`, `SUPABASE_DB_PASSWORD` already in
  `.env.local`, `VERCEL_TOKEN` = needs minting, `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` = from
  linking `apps/web` to the existing `age-of-plunder` project), then run `workflow_dispatch`
  on `deploy.yml`. This runs on GitHub's native Ubuntu Docker and likely sidesteps #341
  entirely.
- Alternative if #341 gets root-caused instead: retry `supabase functions deploy` locally
  directly (vendoring fix from #340 already in place).
- **Bundle budget still critically thin** (~848/850 KB raw as of #326, not touched this
  session). The next feature PR touching `apps/web` bundle size should budget for this —
  may need an actual code-splitting pass (no `React.lazy` used anywhere yet).
- **#320** (spectate battle playback) ready for a future sweep — full design already
  posted to the issue as a comment.

## Blocked on user

- **#307 OAuth** (supervised, open): scoped to Google + Microsoft/Azure AD, needs Supabase
  provider provisioning by you.
- **#321** (multiplayer tactical/boarding authority): awaiting your read of
  `docs/design/multiplayer-tactical-probe.md` and a decision on its 3 open questions plus
  the proposed `match_battle_sessions` migration.
- **#341** (colima Docker deploy bug): no further local debugging planned unless you want
  it root-caused instead of routed around via GitHub Actions.

## Open questions

- Two-gold-token palette split (#319, from the 2026-07-06 sweep) — still unresolved.
- Bundle budget: is a code-splitting pass worth doing proactively now, before the next
  feature forces it under CI failure?
- Housekeeping (flagged before, more concrete now): stale `.claude/worktrees/*` entries
  (~35, accumulated across sessions) make `pnpm verify`'s repo-root `prettier --check .`
  fail locally — one worktree (`agent-a7b35f6863a6c68de`) has an actual unresolved git
  merge-conflict marker committed in `apps/web/src/App.tsx`. Doesn't affect CI (fresh
  checkout), but worth a cleanup pass. Not touched this session — out of scope, and some
  worktrees may be other in-progress work.
