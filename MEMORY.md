# MEMORY.md — Age of Plunder Decision Log

Newest entries on top. Append-only: never edit or delete prior entries (PreToolUse hook
enforces this). Header format: `## D-<NNN> — <YYYY-MM-DD> — <title>`. When adding an entry,
also prepend its one-liner to `MEMORY-INDEX.md`.

## D-013 — 2026-07-01 — Phase-1 engine vertical slice: map, pathfinding, hybrid combat, AI, sim harness

**Decision**: Land the deterministic engine core for Phase 1 in one sweep (issues
#6/#8/#12/#13/#18/#24). Key design choices: (1) square grid + 8-dir movement, home islands
placed on a circle so starts are fair by construction; (2) uniform-cost A* with fixed
tie-breaking (f, then h, then tile index) for replayable naval pathfinding; (3) combat is a
shared round engine (`resolveRounds`) parameterised by a `TacticChooser` + `onRoundEnd`
hook, so v1 auto-resolve and the hybrid tactical layer share one code path; (4) tactic
matrix is a bounded 4-cycle (×0.8–×1.25) so tactics never invert a 3× strength gap;
(5) the AI is a pure utility-scoring `nextAiAction` (engage/expand/defend) runnable chunked
in-browser or in an edge function; (6) the engine holds **no** balance data — combat stats
are injected from @aop/content via `GameConfig.combatStats` and frozen into the match.
**Why**: preserves the pure/deterministic + replay invariants while making a match playable
end-to-end vs AI. **Rejected/deferred**: adding `@aop/content` as an engine dependency
(would break the "engine holds no balance numbers" invariant + touch supervised manifests) —
used dependency injection instead; a real ±5% faction balance pass — deferred until the
economy exists (#9–#11), because faction stat asymmetry is intentional flavour meant to be
balanced by cost, which the sim can't yet model (measured tier-1-only spread ≈ 8%). Combat
`DAMAGE_SCALE=0.35` was tuned via the new harness to stretch duels to ~6–8 rounds and cut
mutual-destruction draws. Related: #6, #8, #12, #13, #18, #24; `scripts/balance-sim.ts`.

---

## D-011 — 2026-07-01 — Adopt ATC harness conventions (CLAUDE.md, MEMORY/SESSION, hooks, bare model labels)

**Decision**: Port the portable core of jharvieux/ATC's engineering harness: root CLAUDE.md
contract, MEMORY.md/MEMORY-INDEX.md/SESSION.md protocol with append-only hook,
typecheck/test Stop hooks, `pnpm verify` single gate, triage + flaky-test + claude-code-setup
runbooks, and bare `haiku`/`sonnet`/`opus` labels (the exact strings the portable
/issue-sweep skill from ATC#1620 expects — the namespaced `model:*` labels stay as
human-facing plan annotations). **Why**: same operator, same workflow across repos; sweep
pipeline prerequisites (AoP#1). **Rejected**: porting ATC's D-091 security anti-pattern
catalog, audit agents (d091-reviewer/pre-pr-reviewer), and PR-audit-marker CI gate —
they encode multi-tenant-SaaS threat models a single-player-first game doesn't have yet;
revisit at Phase 3 when server code exists. Related: AoP#1, ATC#1620,
docs/runbooks/claude-code-setup.md.

---

## D-010 — 2026-07-01 — Repo public; branch protection with required `ci` check on main

**Decision**: Owner made the repo public (branch protection on private repos requires
GitHub Pro). Protection on `main`: required status check `ci` (strict), no force
pushes/deletions, `enforce_admins` off. All changes land via PR into `main` from here on.
**Why**: prerequisite for auto-merge in the issue-sweep pipeline; public also gets free CI
and CodeQL. **Rejected**: GitHub Pro upgrade (unnecessary spend). Related: AoP#1, AoP#45.

---

## D-009 — 2026-07-01 — Multiplayer spec authored before any Phase 3 code

**Decision**: docs/MULTIPLAYER.md is the review gate for issues #30–#38. Load-bearing
choices: `rngState` never leaves the server; action log unreadable until match end; seat
identity (not user id) inside engine state; views are whole-state fetches, not diffs;
snapshot every turn advance; engine version pinned per match, upgrades continue from
latest snapshot. **Why**: anti-cheat boundaries are cheap to design and expensive to
retrofit. Related: AoP#29 (closed), docs/MULTIPLAYER.md.

---

## D-008 — 2026-07-01 — Art: stylized 2D sprites

**Decision**: Hand-painted-style 2D sprite sheets on the Pixi canvas. **Rejected**: pixel
art (audience reach), 2.5D pre-rendered (pipeline cost). Related: AoP#26.

---

## D-007 — 2026-07-01 — Monetization: ads + paid remove-ads

**Decision**: Ad-supported with a one-time remove-ads purchase; guest single-player,
account required for multiplayer. Plumbing deferred; design hooks reserved (`entitlements`
table, single `<AdSlot>` component). Placements between turns / match end only — never
mid-combat. Related: AoP#43, docs/ARCHITECTURE.md §9.

---

## D-006 — 2026-07-01 — Match size configurable in lobby (2–8 players)

**Decision**: Player count and map size are match settings, not fixed. AI takeover for
dropouts is a hard requirement for 5–8 player matches. Related: AoP#35.

---

## D-005 — 2026-07-01 — Title: Age of Plunder

**Decision**: Working title confirmed; package scope `@aop/*`. Rebrand later is just
strings. Related: repo name AoP.

---

## D-004 — 2026-07-01 — Stack: TypeScript monorepo + Supabase + Vercel

**Decision**: React/Vite/PixiJS client; Supabase (new, dedicated project) for
auth/Postgres/Realtime/Edge Functions; Vercel hosting; Capacitor for native later.
**Why**: async turn-based multiplayer is database-centric, not game-server-shaped; engine
kept pure/portable so the backend can be swapped if the game outgrows it. **Rejected**:
dedicated game server (Colyseus/Rust — pays real-time costs the design doesn't need),
Godot/Unity web export (weaker mobile-web). Related: docs/ARCHITECTURE.md §2–5.

---

## D-003 — 2026-07-01 — Single-player-first MVP

**Decision**: One faction vs AI end-to-end before networking; multiplayer architecture
(event-sourced actions, deterministic engine) designed in from day one. **Rejected**:
multiplayer-first (content too thin to retain testers), hotseat-first. Related: epic AoP#2.

---

## D-002 — 2026-07-01 — Hybrid combat model

**Decision**: Multi-round combat with player-chosen tactics per round (broadside, board,
ram, flee) over a strength-based resolver; odds preview + auto-resolve always available;
defenders use standing orders when offline. Full HoMM-style tactical battle board for
troop combat deferred to Phase 4. **Rejected**: pure auto-resolve (too shallow as the
signature system), tactical-board-first (pushes multiplayer out too far). Related: AoP#18,
AoP#20, AoP#39, docs/ARCHITECTURE.md §6.

---

## D-001 — 2026-07-01 — Match-based async turns

**Decision**: Multiplayer is match-based with asynchronous turns (matches span days,
notify-on-your-turn). **Rejected**: simultaneous turns (conflict-resolution complexity),
persistent world (server investment mismatch for v1). Related: docs/MULTIPLAYER.md.

---
