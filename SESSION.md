# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-12 late (party UX round 2 + party art shipped; 26 issues closed today)._

## Just completed

**#482 (party UX round 2) shipped in full, closing the party arc**: standing march orders
(engine, RULES_VERSION 6→7, auto-march with loud interruption), dotted route previews from
engine pathfinding, BOTH land battle kinds playable on the tactical board (zero reducer
changes — probes + existing boardCommands), full multiplayer party controls (PR #484,
audit spotless); and operator-approved party sprites for all five factions integrated with
theme-override support and color-banner fallback (PR #485 — Spanish flag corrected to
Cross of Burgundy, Dutch banner rebuilt to canonical tricolor after one rejection). Art
WIP branch deleted post-merge; provenance MANIFEST in-repo. Follow-up filed: #486
(ThemePackEditor lacks an upload slot for the new party override). MEMORY through D-040.


**The land-expansion epic (#469) went from operator vision to fully shipped in one
evening**, on top of the earlier waves (sweep + city rework completion + conquest levers —
see PRs #456/#464 SESSION versions for the morning/afternoon detail):

- **#477** (#465, built at Fable) — landing parties: `GameState.parties`, five new actions
  (disembark/moveParty/embark/attackParty/partyAssaultCity), RULES_VERSION 4→5, replay
  tests, playable UI. Operator decisions: land assaults face FULL defenses; stranded
  parties persist until rescued.
- **#480** (#466 #467) — land content: mines (ongoing income via persistent claims that
  flip on enemy recapture), one-time haul sites, land encounters, inland neutral
  settlements (sea-unreachable by construction, party-capture only, no shipyards when
  landlocked). Separate placement-RNG stream keeps same-seed pre-existing matches
  byte-identical. RULES_VERSION 5→6.
- **#479** (#475) — the AI plays land: disembarks attrition parties (captain-preserving:
  −34% captains lost in sims), marches/assaults incl. inland settlements, intercepts
  enemy parties, reinforces threatened cities (with a `partyThreatMinRatio` floor so
  nuisance parties can't freeze logistics). Two real crashes caught pre-merge by the
  audit/reconciliation loop: AI shipyard-at-landlocked-city, and multiplayer
  `sanitizeAction` missing the two new actions (#480).
- **#472/#478** (#468 #473) — extra-large maps (48-wide, doubled home-island radius)
  everywhere: single-player, private multiplayer, quick-match (migration file
  `20260712000000_matchmaking_queue_xlarge_map_size.sql` — **applies on next deploy
  dispatch**), and authored maps (ceiling 40→48, size budget CI-pinned at ~3KiB margin).
- **#481** (#476) — party UX: partial-march, range shading, minimap presence, MP readout,
  and a real bug fix (site capture was unreachable via tap; now a tested pure classifier).
- **MEMORY through D-039** (D-037 landing parties, D-038 land content, D-039 AI land).

**Day totals**: 24 issues closed, 15 feature/docs PRs + 5 dependabot PRs merged, main
green throughout. RULES_VERSION 2→6 over the day (resign fix, conquest cadence, land
domain, land content).

## In flight

None. No open PRs, no worktrees, no background processes.

## Next step

- **Operator playthrough** is the real next gate: new city scene, conquest pacing
  (`siegeStickinessBonus` 40 — dial down if too aggressive), land gameplay on an
  xlarge map (interiors are tiny below xlarge), inland settlements, mine claims.
- **#482** — party UX round 2 (standing march orders need engine state; tactical land
  battles; party art; multiplayer party controls).
- **#444** — ComfyUI migration before the next art batch (party/site art wants it).
- **#422** — live-defender lockstep (dedicated two-client session).
- Dispatch `deploy.yml` when convenient — the xlarge quick-match migration and all of
  today's engine changes need an edge-function deploy (ENGINE_VERSION moved many times).

## Blocked on user

- `VERCEL_TOKEN` repo secret (#425 — the only remaining piece).
- ~28 stale local `feature/sweep-*` branch refs from PRIOR sessions + two old stashes
  (`stash@{0}` 2026-07-07, `stash@{1}` older) — one popped itself onto the checkout
  mid-session and was restored; say the word to clear them after a merged-PR check.
- `needs-human-fix` backlog: Capacitor/native cluster (#98 #100 #156 #159 #160 #161),
  #4 (Phase 3 epic).

## Open questions

- Conquest/land pacing after a real playthrough (all dials are single content numbers).
- Mine claims: persistent-claim semantics (pays after the party leaves, flips on enemy
  recapture) was the executor's reading of "held" — operator veto welcome (#480 PR body).
- Whether battle-board turrets should use the shipped-but-unwired `turret.png`.
