# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-04 (Issue sweep: 9 batches planned, 8 PRs opened, all 8 merged; 0 left open)._

## Just completed

Full `/issue-sweep`: triaged 27 open issues (Haiku fan-out), planned 9 executable batches
(16 issues) with operator approval at the gate, executed all 9, then finalized (CI wait →
`pre-pr-reviewer` audit → merge) one at a time. Every PR that reached the merge stage
merged clean — nothing was left open.

- **#118 — stripe-security** (#105, #106): origin allowlist on checkout redirect URLs, added
  webhook signature/entitlement tests. The audit caught a real (if low-severity, non-
  exploitable-without-the-secret) bug: a non-numeric webhook timestamp made the replay-window
  check fail open via a `Math.abs(NaN)` comparison — fixed inline before merge, with a
  regression test.
- **#117 — art-integration** (#108, #109, #110, #111, #112, #113, #115): landed remaining
  sprite/portrait assets and the actual `MapCanvas.tsx` sprite-rendering plumbing
  (`SpritePool`, texture caching, flat-color fallback). #89 (further art polish) stays open,
  intentionally deferred — needs more local Stable Diffusion generation time.
- **#123 — captain-portraits** (#114): army/fleet list broken out per-captain (data already
  existed as `Captain` entities — no engine change needed) plus portraits in the
  attack-confirmation sheet. Conflicted with #117 on `factions.ts` (both added
  `captainPortraitUrl`) — rebased and resolved by hand before merge.
- **#119 — ci-fix** (#86): pinned prettier to the exact installed version, fixing the
  `format:check` drift. **#104 turned out to be a false alarm** — investigated properly:
  `database.types.ts` was never stale; the real bug is in
  `.github/workflows/supabase.yml`'s diff step (formats a `/tmp` file with no
  `--config`, so it never finds this repo's `.prettierrc` and always shows a spurious
  diff). Retitled #104 to reflect the real root cause, labeled `needs-human-fix` — it's a
  one-line workflow fix but touches a supervised path.
- **#121 — balance** (#90): retuned tier-1 unit stats in `@aop/content` to equalize combat
  win-rate spread across all 5 factions (was 75.0%, now 0.0% against a documented ~10%
  target). Filed **#120** for a separate tooling gap found along the way (the
  `balance-sim.ts` harness can't resolve `@aop/content` — needs a `pnpm-workspace.yaml`
  touch, supervised, so deferred rather than fixed inline).
- **#122 — testing** (#51): added `@vitest/coverage-v8` + Stryker mutation testing for
  `packages/engine`, scoped to `combat.ts`/`reducer.ts`.
- **#124 — economy** (#101): map-editor resource-node markers now grant a passive per-turn
  resource bonus to whichever player controls (has a captain standing on) the tile.
  Replay-determinism tests extended. Known gap, disclosed in the PR: `PlayerView` doesn't
  yet expose resource nodes for fog-of-war filtering — separate, larger change.
- **#125 — battle-board** (#93, #94): #94 (ranged units + line-of-sight) shipped in full —
  new deterministic `hexLine`/`hexLineOfSight`, range-aware combat resolution and board AI,
  replay tests extended. **#93 (interactive stack-by-stack UI) was deferred, not rushed** —
  investigation found it isn't actually UI-only as the issue assumed; it needs unexported
  engine internals exposed plus a new session API, a much larger and riskier lift. Left open
  with that explanation.
- **#63 — map-sharing**: no-op. Tier 1 (export/import codes) was already fully implemented
  by the map editor (#102) exactly as the issue's own plan anticipated. Commented and left
  open, now tracking **Tier 2 only** (community library, Phase 3+, needs `supabase/migrations/**`).

**Operator decisions during the plan gate**: escalated #63 and #90 to a new `fable` model
tier (created the label); resolved #114's scope ambiguity by confirming per-ship captains
already exist as first-class engine data (no schema change needed); approved touching
`package.json`/`pnpm-lock.yaml` for #86's specific fix.

**Still excluded / not batch-executable** (unchanged from the plan): epic-scale multiplayer
and Capacitor features — #35, #36, #37, #38, #40, #42, #100 — all re-labeled `opus`, need a
human breakdown before any future sweep can touch them. #98 (`needs-human-fix`), #81/#73
(`blocked`) untouched.

## Next steps

1. **#104**: apply the one-line `.github/workflows/supabase.yml` fix (add `--config
.prettierrc` to the `npx prettier --write` call, or write the temp file inside the repo
   tree) — supervised path, needs explicit sign-off.
2. **#120**: fix `balance-sim.ts`'s module resolution (likely a `pnpm-workspace.yaml` tweak)
   so the balance harness is runnable again — supervised path.
3. **#89**: art polish follow-up (ship/unit size variants, painterly style pass, remaining
   UI icons) needs more local SD generation time / a different checkpoint.
4. **#93**: needs a dedicated feature-scoping pass (interactive battle-board session API)
   before it's attempted again.
5. **#63 Tier 2**: community library (Phase 3+) still unscheduled.
6. The 7 epic-scale multiplayer/Capacitor issues above need manual breakdown into
   sweep-sized pieces before they can go through this pipeline.

## Prior session summary (2026-07-04 full open-PR review sweep, unchanged)

- Reviewed all 11 open PRs; merged/closed 8 of 9 (see prior entries in git log for detail).
- Filed #104, #105, #106 during that sweep's audits.

## Prior session summary (2026-07-01 sweep, unchanged)

- **Issue-sweep complete**: 10 issues across 4 batches (audio, platform/PWA, auth,
  multiplayer) merged into `main` — PRs #82, #83, #84, #85.
