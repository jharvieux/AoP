# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-14 evening (captain rebalance + map quadrupling + round limit
shipped as a three-PR merge train)._

## Just completed

Three-PR merge train, each built by an isolated executor, audited, and squash-merged in
sequence:

- **#506 — flat captain stats + items boost stats** (D-043, RULES_VERSION→9): attack/
  defense stat points now add whole numbers to every unit's score before percent scaling
  (max impact on low-tier units, operator intent); items re-modeled as stat boosters
  (carried = equipped, stash inert, speed items apply from next refresh). Sim delta zero
  — verified live-but-unexercised (v1 AI spends few points, never gets items → #500).
- **#513 — map quadrupling + land-assault guarantee** (D-044, RULES_VERSION→10): all
  presets doubled per side (small 48² … xlarge 96²), correlated generator params
  rescaled, inland content at every size; structural guarantee that every capital/inland
  settlement is overland-assaultable (deterministic RNG-free repair pass + property
  battery across seeds/sizes/topologies/player counts). Authored starting map rebuilt at
  48² with real land islands (naive scaling gave zero assaults; re-spaced version: 69
  captures/96 in sim). Camera-opens-on-fleet fix. Land warfare now the dominant conquest
  vector in sims.
- **#511 — configurable round limit** (D-045, additive, no bump): optional
  GameSetup.roundLimit via SP setup + MP private matches; cap winner = cities → gold →
  draw (operator-vetoable pure function); "Round N / limit" in both headers.

Earlier today (see D-041/D-042 and the morning SESSION versions): #444 ComfyUI
migration; city-scene playthrough fixes ×2 rounds; issue sweep (#486/#490); Sentry Seer
PR #496 rebuilt and merged; synthetic monitor green for the first time ever (#497);
**#498 captain expansion epic** (stats/garrison/port-defense/items/captain-led parties,
PRs #501+#504).

## In flight

None. No open PRs, no active worktrees, no background processes.

## Next step

- **Operator playthrough** — captain stats/items on the new 4× maps with land warfare
  everywhere; round-limit option; all balance dials are single content numbers.
- **DEPLOY DISPATCH OVERDUE**: ENGINE_VERSION moved many times today (RULES_VERSION
  7→10); edge functions must be redeployed via deploy.yml before production multiplayer
  works. Blocked only on operator convenience (and VERCEL_TOKEN for the web tier).
- **#500 AI v2** (garrisoning, led parties, items, port-defense threat calc) + adjuncts
  #509 (round-limit awareness), #510 (capital conquest thins with distance on 4× maps).
- **#499** stranded shipless-captain rescue; **#502/#503** item toasts (MP / land hauls).
- **#512** size-aware minimum zoom / fit-to-map button (96² maps).

## Blocked on user

- `VERCEL_TOKEN` repo secret (#425); optional `SUPABASE_DB_URL` (monitor heartbeat).
- **#507** authored-map byte-budget raise — needs a companion DB migration (supervised).
- Operator veto windows: winner-at-cap rule (D-045), carried=equipped item reading
  (D-043), authored-map layout (D-044 preview delivered), DreamShaperXL adoption (D-041).
- `needs-human-fix` backlog unchanged: Capacitor cluster, #4, #422.

## Open questions

- Balance after a real playthrough on 4× maps: stat/item magnitudes, port-defense
  strength, fog radii (deliberately unscaled — single content numbers if wrong).
- Whether 30-round sim-battery cap needs revisiting once AI v2 lands (#500/#510).
