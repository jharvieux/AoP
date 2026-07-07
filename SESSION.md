# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-07 evening (quality triage session — MEMORY D-026)._

## Just completed

- **Six operator-reported quality issues investigated end-to-end** (blocky map, no city
  attack/no win path, no visible combat tactics, lost title music, unsignposted
  navigation, parchment palette stopping at the menu). All product decisions made with the
  operator and captured in MEMORY D-026. Per operator direction, filed as tracked issues
  rather than implemented:
  - **#342** (P1, bug) title music + autoplay-unlock — root-caused to the #302 splash
    auto-advancing with no gesture + `audioManager` swallowing the rejection.
  - **#343** (P1, haiku) default single-player `battleResolution` `'auto'` → `'tactical'`
    — the tactical system is fully built, just hidden.
  - **#344** (P0, opus) city assault + conquest victory — no attack-city action exists;
    resign is currently the only way a game ends. Hooks identified
    (`resolveBoardCombat` land entry, `city.garrison`, elimination check already handles
    last-city loss).
  - **#345** (P2) parchment retrofit, UI chrome only; two golds unify to parchment gold
    (resolves the #319 open question and D-023's boundary question).
  - **#346** (P1) minimap + zoom buttons + center-on-fleet + turn-event feed.
  - **#347** (P1, opus) map rendering overhaul on the square grid (autotiling coastlines,
    tile variety, gradient fog); **#348** (P3) hex conversion as a future evaluation gated
    on #347's outcome.
- **PR #340 merged** (`4f65ab1`): last session's `_vendor/` fix, plus this session's
  operator-approved workflow edits — `ci.yml` edge-functions job and `deploy.yml` now run
  `node scripts/vendor-function-deps.mjs` before deno check/deploy (CI was red because
  `_vendor/` is gitignored and never generated in CI). Functions README updated to match.
  pre-pr-reviewer audit: 0 blockers (comment on the PR); local
  `deno check` verified clean over the full vendored module graph.

## In flight

- Nothing. No feature branches open. (An unrelated `feature/sweep-ui-326` branch got a
  push upstream during the session — not this session's work.)

## Next step

- Implement the new issues, suggested order: **#344 first** (P0 — makes the game winnable),
  then #342 + #343 as one quick-wins PR, then #346, #347, #345. Bundle budget is
  ~848/850 KB — #346/#347 likely force a code-splitting pass (no `React.lazy` anywhere yet).
- Deploy path (unchanged from D-025): provision `deploy.yml`'s `production` environment
  secrets (VERCEL_TOKEN needs minting; SUPABASE\_\* values are in `.env.local`; org/project
  IDs come from `vercel link` in `apps/web`), then `workflow_dispatch` — now viable since
  the vendor step is wired into deploy.yml.

## Blocked on user

- **#307 OAuth** (supervised): Google + Microsoft provider provisioning.
- **#321** (multiplayer tactical authority): awaiting read of
  `docs/design/multiplayer-tactical-probe.md` + the 3 open questions.
- **deploy.yml secrets** (above) — operator-facing setup.
- **#341** (colima local deploy bug): parked unless root-causing is wanted; GitHub-Actions
  deploy sidesteps it.

## Open questions

- Code-splitting: do it proactively before #346/#347, or when CI forces it?
- Stale `.claude/worktrees/*` housekeeping (~35 entries; one has a committed
  merge-conflict marker) — breaks local repo-root `prettier --check .`, not CI. Needs an
  operator-sanctioned cleanup pass.
