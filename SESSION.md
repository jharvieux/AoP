# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-10 (map-polish + issue sweep: 8 PRs merged, D-028/D-029)._

## Just completed

**Full issue sweep (2026-07-10): 13 issues closed across 8 merged PRs, all audited
(pre-pr-reviewer) and CI-green; production Vercel deploy READY on the final main.**

| PR   | Scope                                                             | Issues closed         |
| ---- | ----------------------------------------------------------------- | --------------------- |
| #406 | docs: map-polish design specs (`docs/design/UI/`)                 | —                     |
| #411 | Map polish: vignette, light, coast foam, land washes, caustics    | #401–#405             |
| #412 | D-028: battle-sessions design approved (operator answers)         | —                     |
| #413 | Probe extraction into `@aop/engine` (battle sessions step 1)      | #321 (with #412/#416) |
| #415 | Naval navigation/targeting client UI (+ conflict-resolve vs #413) | #371 #372 #375 #376   |
| #416 | §10 interactive-defender design extension + D-029 sign-off        | #410                  |
| #417 | Multiplayer approach-and-attack parity (audit warnings fixed)     | #414                  |
| #419 | `match_battle_sessions` two-seat schema + RLS (migration file)    | #407                  |
| #420 | Engine: server-authored `defenderOrders` on `attackCaptain`       | #418                  |

Also closed without code: #384 (branch protection already had `format-check-only` —
verified via API), #373/#374 (already shipped in PR #383; missing "Closes" keywords had
left them open).

Key decisions this session: **D-028** (battle sessions approved: 3–5 min deadline,
cyclic forced finish, interactive defender) and **D-029** (seven defender-seat product
decisions, operator "Approve all"), plus the operator-approved replay-contract expansion
(#418: defender picks ride the logged action, server-authored).

## In flight

None. Sweep ledger deleted; no open `auto-triaged` PRs.

## Next step

**#408 (edge functions: battle-session open/round/resolve + BATTLE_PENDING guard)** — now
unblocked: design (§10), schema (#419), and engine support (#420) are all on main. Then
**#409** (MatchScreen wiring). Both carry the D-028/D-029 decisions in their bodies.
When #408 ships, remember `deploy.yml` is manual-dispatch — edge functions and the
`match_battle_sessions` migration reach the real Supabase project only when the operator
runs it (no production Supabase project exists yet per supabase/README.md).

## Blocked on user

- Stale `.claude/worktrees/*` cleanup (~70 leftover worktrees from old sweeps; needs
  explicit permission to delete).
- The `needs-human-fix` backlog: #362 (CI docs-only fast path), #98/#100/#156/#159/#160/
  #161 (Capacitor/native), #4 (Phase 3 epic).

## Open questions

- #410's interactive-defender extension pulled a "both online" flow into scope earlier
  than the base design recommended; if async pacing suffers in playtests, D-029's
  presence-gated grace (offline defender = zero added latency) is the knob to revisit.
