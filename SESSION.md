# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-14 (captain-expansion epic #498 shipped; monitor green; city scene polished)._

## Just completed

- **#498 captain expansion shipped end-to-end** (D-042): captain stats with level-up picks
  (alongside skills), garrison + ships-in-port city defense with all-captured stakes,
  13-item drop system (8-cap + faction stash + port transfer), captain-led landing
  parties with anchored-ship rules. RULES_VERSION 7→8. PRs #501 (engine/content/MP/AI)
  and #504 (UI), both audited clean. Sim battery: captures 75→71 (−5%, acceptable).
- **Synthetic monitor green for the first time ever** (PR #497): it had failed all 95
  lifetime runs asserting 403 on a probe the Supabase gateway 401s pre-function; now
  probes with the anon-key bearer to the functions' real 403 boundary. Full diagnosis on
  #425.
- **Sentry Seer auto-PR #496** (neutral-city faction crash, AOP-CLIENT-1): unsound as
  submitted (didn't compile, no tests); rebuilt through audit→fix→re-audit into a
  strict `factionOfPlayer` / nullable `factionOfOwner` split. Merged.
- **City scene playthrough polish** (PRs #489, #495, #491): tap-city-to-manage, new
  operator-approved backdrop + slot layout, fit-to-viewport + zoom controls, 2× town
  hall via alpha-trimmed sprites, turret flag, label chips.
- **Issue sweep**: #486 (ThemePackEditor party slot, PR #492) and #490 (shipyard feather
  - artLoaded fix, PR #491) merged; follow-ups #493, #494 filed.
- **#444 ComfyUI migration** (D-041, PR #488): pipeline on current torch/MPS, tooling in
  scripts/art/, DreamShaperXL Turbo evaluated (adoption = operator per-batch call).

## In flight

None. No open PRs, no worktrees in use, no background processes.

## Next step

- **Operator playthrough of the captain expansion** — stat picks, garrisoning, items,
  captain-led parties; balance dials all in @aop/content (CAPTAIN_STAT_TUNING,
  ITEM_DROPS).
- **#500 AI v2** — AI never garrisons or leads parties yet, so harbor-capture and led
  parties barely fire in AI matches; do before judging balance vs AI.
- **#499** — stranded shipless-captain rescue path (+2 audit-suggested tests).
- **#502/#503** — item-found toasts missing in multiplayer / for land hauls.
- **Deploy dispatch still pending** — ENGINE_VERSION moved again (a lot); edge functions
  need a deploy.yml run (xlarge migration applies then too).

## Blocked on user

- `VERCEL_TOKEN` repo secret (#425); optional `SUPABASE_DB_URL` for the monitor's cron
  heartbeat check.
- `needs-human-fix` backlog unchanged: Capacitor cluster (#98 #100 #156 #159 #160 #161),
  #4 (Phase 3 epic), #422 (live-defender lockstep — needs a dedicated two-client session).
- Art follow-ups awaiting operator style calls: #493 (shipyard cutout regen), #494
  (ThemePackEditor missing slot families).

## Open questions

- Captain-expansion balance after a real playthrough (stat rates, item drop chances,
  port-defense strength — all single content numbers).
- DreamShaperXL Turbo adoption for future art batches (D-041: contact-sheet both).
