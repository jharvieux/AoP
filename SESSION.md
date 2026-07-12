# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-12 evening (city rework COMPLETE; conquest levers shipped; 16 issues closed today)._

## Just completed

**Epic #427 (city management rework) is fully done and closed.** Beyond the morning
sweep (see PR #456's SESSION version), the afternoon shipped:

- **#458** — city art integrated: 15 building cutouts + citadel corner tower +
  harbor backdrop live in `apps/web`, `BuildingDef.spriteUrl` /
  `citadel.cornerTowerSpriteUrl` in content, CityScene renders real art with the
  color-block fallback. Art WIP branch deleted; provenance MANIFEST copied into the
  repo. Interactive rounds: sawmill cutout redone (props kept), wallseg-citadel split
  into strip + extracted corner tower (operator-directed, recorded as **D-032**),
  backdrop = candidate seed 2928388781 with lower-left harbor pocket + sand shore
  (v4 approved). `turret.png` shipped but unwired (no BuildingDef for battle-board
  turrets; wiring tactical-board turret art would extend #441).
- **#461** — conquest levers (operator decision **D-033**): recruit pools replenish
  every **5 rounds** (`RECRUIT_REPLENISH_INTERVAL`, catalog-threaded), ship
  `crewCapacity` **×5** (upgrade track scaled too). RULES_VERSION 3→4.
  **Measured outcome (D-034): conquest is now reachable but rare** — 3 captures/96
  sim matches (was 0/96); residual bottleneck = single-captain landings vs
  still-unbounded garrisons (peaks ~320). Filed **#462** for the operator's scope
  decision (garrison cap/upkeep vs multi-captain assaults). No-free-capture holds.
- **#457** — deploy.yml smoke test fixed to expect 401 (gateway verify_jwt), runbook
  aligned. #425 remains open ONLY for the `VERCEL_TOKEN` secret (operator action).
- **#463** — faction flags now respect the theme-pack override chain (closed #459,
  found by #458's audit).
- **#362** closed as already-fixed (PR #378, 2026-07-08) with live evidence.
- MEMORY: **D-032, D-033, D-034** recorded (PRs #460, #461).

**Today's totals**: 16 issues closed, 10 feature/docs PRs + 5 dependabot PRs merged,
main CI green throughout. Save/load is player-reachable (main-menu Continue/Load,
#454), resign bug fixed (#450), city UI rebuilt graphical (#452), balance
sim-validated (#455).

## In flight

None. No open PRs, no worktrees, no background art processes (SD server down,
torch pin intact; rembg lives in the separate `~/aop-ai-tools/venv`).

## Next step

- **#462** — needs an operator DESIGN decision before any code: make conquest common,
  not just reachable. Options analyzed in the issue: garrison cap or upkeep vs
  multi-captain/escorted assaults. The 5-turn/×5 levers are already in; sims show
  pushing them further doesn't help.
- **#444** — ComfyUI migration, before the next large art effort.
- **#422** — live-defender lockstep: needs a dedicated session with two live clients
  (engine collect-pass + supervised edge functions).
- Operator to eyeball the new city scene + conquest pacing in a real playthrough —
  tavern-less cities having no captain UI (PR #452 note) is intended friction unless
  play says otherwise.

## Blocked on user

- `VERCEL_TOKEN` repo secret (last piece of #425; deploy.yml Vercel steps + smoke
  tests).
- #462 design direction (above).
- ~28 stale local `feature/sweep-*` branch refs from PRIOR sessions (today's were
  cleaned as merged); deleting needs a per-branch merged-PR check.
- `needs-human-fix` backlog: #98/#100/#156/#159/#160/#161 (Capacitor/native), #4
  (Phase 3 epic), #425 (secret only).

## Open questions

- #462: how aggressive should AI conquest be? (3/96 today; what rate feels right?)
- Whether battle-board turrets should get the shipped-but-unwired `turret.png` art
  (extends #441's name/icon fix).
- #422 UX presentation questions (grace countdown, notification cadence) — D-029
  bounds the mechanics.
