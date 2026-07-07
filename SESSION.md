# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-06 (follow-up sweep: #326, #322, #321 design doc; #320 deferred)._

## Just completed

- **Follow-up issue sweep** (after the main 14-issue sweep, see MEMORY D-024): triaged the
  4 remaining non-native/non-epic open issues (#320, #321, #322, #326), executed 3:
  - **#326** (recruit/ransom captain UI) → PR #331, merged. Wires the #308/#309 engine
    actions into `CityScreen.tsx` (single-player + multiplayer via `matchActions.ts`).
    Bundle at 848.11 KB raw / 250.29 KB gzip — **very thin headroom** under the #253
    850 KB/260 KB budget (~2 KB raw left).
  - **#322** (first-contact balance tuning) → PR #330, merged. Promoted the hardcoded
    `0.34` ring-radius factor into `@aop/content` as `homeIslandRingRadiusFactor`, set to
    `0.40`.
  - **#321** (multiplayer tactical/boarding authority design) → PR #329, merged
    (docs-only, `docs/design/multiplayer-tactical-probe.md`). **Issue left open** — the
    doc found the issue's own suggested "stateless probe" approach is unsafe (deterministic
    engine + real rngState = a free outcome oracle, enabling save-scumming) and instead
    proposes binding battle sessions, which also unifies the fix with #293. Needs operator
    review of 3 product questions (doc §9) and approval of a `match_battle_sessions`
    migration (supervised path) before implementation.
  - **#320** (spectate battle playback) — **not completed this session**. First attempt
    ran long, did thorough research, and correctly stopped without committing code when
    asked for a status check (initially misreported as "stalled" — it wasn't; see below).
    Per your call, the full design was posted to the issue as a comment
    (https://github.com/jharvieux/AoP/issues/320#issuecomment-4899810781) rather than
    resumed, for a future sweep to implement directly: extend `GameState` with a bounded
    `recentBattles` ring buffer (N=5) written in `attackCaptain()`'s reducer branch, surface
    through the existing `playerView()` fog filter (no new edge function/migration needed),
    wire a "View Battle" button into `SpectateScreen.tsx` reusing `BattleBoardSheet`.
- **CLAUDE.md preference added** (`~/.claude/CLAUDE.md`, global): open to suggestions for
  better/longer-lasting approaches over tactical fixes — surface these proactively.

## In flight

- None — all sweep PRs from this session are merged or closed out; no open PRs.

## Next step

- **Bundle budget is now critically thin** (~848/850 KB raw after #326). The next feature
  PR touching `apps/web` bundle size should budget for this — may need actual code-splitting
  work (no `React.lazy` used anywhere in the app currently) rather than continuing to add
  to the single bundle.
- **#320** ready for a future sweep with the full design already posted to the issue —
  should go faster next time since research is done.
- **#321** needs your review (3 product questions in the design doc + migration approval)
  before any implementation sweep.

## Blocked on user

- **#307 OAuth** (supervised, open): scoped to Google + Microsoft/Azure AD, needs Supabase
  provider provisioning by you.
- **#321**: awaiting your read of `docs/design/multiplayer-tactical-probe.md` and a
  decision on the 3 open questions + the proposed migration.

## Open questions

- Two-gold-token palette split (#319, from the main sweep) — still unresolved.
- Bundle budget: is a code-splitting pass worth doing proactively now, before the next
  feature forces it under CI failure?
- Housekeeping note (not urgent): the repo has ~35 stale `.claude/worktrees/*` entries
  accumulated across sessions, mostly from already-merged/abandoned sweep branches. Not
  touched this session (out of scope) — flag for a cleanup pass if you want one.
