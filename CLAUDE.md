# CLAUDE.md — Age of Plunder

> **Branch policy**: `main` is protected (required check: `ci`, strict). All changes land
> via PR into `main` — including docs, MEMORY, and workflow YAML. Branch as `feature/<name>`
> or `docs/<name>`, run `pnpm verify`, push, open PR, squash-merge when CI passes.

## Session start

1. Read `/MEMORY-INDEX.md` (one line per decision, newest first). Do NOT read `/MEMORY.md`
   in full — grep it for the specific `D-NNN` entries you need.
2. Read `/SESSION.md` fully (resume state from the last session).
3. State your understanding of the current goal in one paragraph before making changes.

## The project

Pirate strategy game (HoMM-inspired), TypeScript pnpm monorepo. Architecture and roadmap:
`docs/ARCHITECTURE.md`. Multiplayer spec: `docs/MULTIPLAYER.md`. Work is tracked as GitHub
issues under four phase epics (#2–#5).

**Engine invariants (never break these):**

- `@aop/engine` is pure and deterministic: no I/O, no DOM/Node/Deno APIs, no runtime
  dependencies, no `Math.random()`/`Date.now()`. All randomness flows through the seeded
  RNG whose state lives inside `GameState`.
- `GameState` is plain JSON-serializable data. Every mutation goes through `applyAction()`.
- Replay determinism is load-bearing (saves, multiplayer authority, anti-cheat). The replay
  tests in `packages/engine/test` are the contract — extend them with every new action.
- Game balance numbers live in `@aop/content` as data, never hardcoded in engine logic.

## Verify

- `pnpm verify` — full gate: format check, typecheck, tests, build. Run before every push.
- `pnpm verify:fast` — format check + typecheck only (mid-session sanity).
- Base branch for PRs: `main`. CI check name: `ci`.

## The user

Technically fluent but does not write or review code. Never ask them to read diffs or pick
between code-level alternatives. Do ask about: product/gameplay behavior, plain-English
trade-offs, scope, model selection, MEMORY changes.

## Decision log (MEMORY.md)

- `/MEMORY.md` is append-only, newest entries on top. Header format:
  `## D-<NNN> — <YYYY-MM-DD> — <title>`, body covers decision, why, what was rejected,
  related artifacts. Entries end with `---`.
- You add entries; never edit prior ones without explicit permission. A PreToolUse hook
  enforces this and fails closed (see `docs/runbooks/claude-code-setup.md`).
- When prepending an entry, also prepend its one-liner to `/MEMORY-INDEX.md`.
- `/SESSION.md` is transient whole-file-overwrite resume state. Update it at session end:
  Just completed / In flight / Next step / Blocked on user / Open questions.

## Engineering principles

- Simplicity first; surgical changes. Match existing conventions.
- Tests verify intent, not just behavior — determinism and invariants over line coverage.
- Never ignore a bug you find: trivial → fix inline; non-trivial → open a GitHub issue
  before the session ends. Every deferral gets an issue before its PR merges.
- Fail loud. Report failures plainly; never claim unverified success.
- End-of-session slop sweep: re-read your own diff; delete comments that restate code,
  single-use helpers, pointless try/catch, orphan TODOs (use `TODO(#123)` form).
- Stop-hook feedback is background telemetry from an automated code-health review — NEVER
  reply to it with a chat message. Do not acknowledge it, summarize it, or emit filler like
  "(waiting)". If it surfaces a genuine bug, fix it or open an issue silently.

## Issue triage & sweep support

- Model-tier labels are the bare strings `haiku` / `sonnet` / `opus` (rubric in
  `docs/runbooks/triage.md`). The namespaced `model:*` labels are human-facing plan
  annotations only — sweep tooling ignores them.
- Exclusion labels: `needs-human-fix`, `blocked`.
- Audit agent: `pre-pr-reviewer` (`.claude/agents/pre-pr-reviewer.md`) — run it on every
  sweep/feature PR before squash-merge; findings are posted as a PR comment. BLOCKER
  findings must be fixed before merge; WARNINGs are the supervisor's judgment call.

## Sensitive paths (supervised — never auto-change; flag for the operator)

- `.github/workflows/**` — CI is the merge gate
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` — dependency manifests and
  `allowBuilds` script-execution policy
- `.env*` — secrets (gitignored; never commit)
- `supabase/migrations/**` — database schema (Phase 3+)
- `MEMORY.md` prior entries — append-only

## Never without explicit permission

Delete/rename files or branches (except your own merged feature branches); restructure
directories; edit prior MEMORY entries; force-push; disable or bypass branch protection or
CI checks; install new runtime dependencies (dev-deps OK); change repo visibility or
settings.

## Freely allowed

Read anything; run typecheck/tests/build; create files under `docs/`, `scripts/`, `tests/`;
add MEMORY entries; overwrite SESSION.md; commit/push feature branches; open PRs and
squash-merge them into `main` when CI is green; delete your own merged branches; create and
label GitHub issues.
