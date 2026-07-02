# Issue triage

Manual — run only when the operator asks (or via a sweep pipeline that references this
runbook). Adapted from ATC's triage runbook for this repo's risk profile.

## Model-tier rubric (bare labels: `haiku` / `sonnet` / `opus`)

Risk-based, not size-based. Large mechanical diffs do NOT escalate.

**`opus` if ANY of:**

- Touches engine determinism: RNG, `applyAction`/reducer semantics, replay/serialization,
  turn-order logic
- Combat math or balance-affecting formulas
- Multiplayer authority surface: edge functions, fog-of-war filtering, `supabase/**`
  (also → supervised)
- Map generation / pathfinding algorithms
- Cannot be estimated from the issue text

**`haiku` if ALL of:**

- Single file, no control-flow change (docs, copy, config values, label chores)

**`sonnet` otherwise** — the default tier: UI screens, data/content additions, standard
features with existing patterns to follow.

## Supervised scopes (flag `⚠ supervised`; excluded from auto-execution unless the operator explicitly includes them)

- `.github/workflows/**`
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- `.env*`
- `supabase/migrations/**`
- `MEMORY.md`

## Routing labels

- `needs-human-fix` — confirmed not agent-doable (account/billing actions, external
  services, art/assets)
- `blocked` — waiting on another issue or a user decision; reference the blocker
- Phase/priority labels (`phase:N`, `P0`–`P3`) are assigned at issue creation and rarely
  change during triage; model-tier labels are what triage adds.

## Procedure

1. `gh issue list --state open` — sweep newest first.
2. For each unlabeled or stale issue: assign category, priority sanity-check, model tier
   per the rubric above, supervised flag if predicted files hit supervised scopes.
3. Apply via `gh issue edit <n> --add-label <tier>`.
4. Anything unestimatable → `opus` + a comment stating what's unclear.
