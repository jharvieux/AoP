# MEMORY index

One line per decision, newest first. Rebuild with:

```bash
{ printf '# MEMORY index\n\n'; \
  printf 'One line per decision, newest first.\n\n## Entries\n\n'; \
  grep -E '^## D-[0-9]+' MEMORY.md | sed 's/^## /- /'; } > MEMORY-INDEX.md
```

## Entries

- D-029 — 2026-07-10 — Interactive defender seat: product decisions signed off (#410)
- D-028 — 2026-07-10 — Battle sessions design approved (#321): 3–5 min deadline, cyclic forced finish, interactive defender
- D-027 — 2026-07-07 — Naval navigation UX batch: seven ready-to-execute issue designs (#370–#376)
- D-026 — 2026-07-07 — Quality triage: six operator-reported issues investigated, decisions made, tracked as #342–#348
- D-025 — 2026-07-07 — First real prod deploy: DB pushed live (was empty); fixed edge-fn `@aop/*` vendoring (#339/PR #340); blocked by colima Docker bug (#341)
- D-024 — 2026-07-06 — Issue sweep (14 issues); title emblem sourced CC0 (SD couldn't meet brief), shipped as static asset for #253 bundle budget
- D-023 — 2026-07-06 — Visual theme: "Weathered Parchment & Rope" is the canonical app palette
- D-022 — 2026-07-05 — Match size capped at 5 (faction-pool bound), amending D-006's 2–8 range
- D-021 — 2026-07-05 — Audio: local music generation (MusicGen) + procedural SFX, wired into gameplay
- D-020 — 2026-07-05 — Art (#108 retry): shipped `deep`/`port` map tiles, closing the gap
- D-019 — 2026-07-05 — Art: generated the missing tier-1 unit sprites (5 factions)
- D-018 — 2026-07-05 — Art (#89 item 4): audited remaining UI icon coverage, shipped one new status icon
- D-017 — 2026-07-05 — Alliance betrayal (#138): allow with reputation cost, not a hard block
- D-016 — 2026-07-05 — Art (#89): DreamShaper painterly re-pass, character/vehicle art only
- D-015 — 2026-07-04 — Tactical battle board: hex melee decides boardings; gated by frozen battle tuning
- D-014 — 2026-07-04 — Capacitor (#42): scaffold only, defer the dependency install
- D-013 — 2026-07-01 — Phase-1 engine vertical slice: map, pathfinding, hybrid combat, AI, sim harness
- D-012 — 2026-07-01 — Port pre-pr-reviewer audit agent from ATC (partial reversal of D-011)
- D-011 — 2026-07-01 — Adopt ATC harness conventions (CLAUDE.md, MEMORY/SESSION, hooks, bare model labels)
- D-010 — 2026-07-01 — Repo public; branch protection with required `ci` check on main
- D-009 — 2026-07-01 — Multiplayer spec authored before any Phase 3 code
- D-008 — 2026-07-01 — Art: stylized 2D sprites
- D-007 — 2026-07-01 — Monetization: ads + paid remove-ads
- D-006 — 2026-07-01 — Match size configurable in lobby (2–8 players)
- D-005 — 2026-07-01 — Title: Age of Plunder
- D-004 — 2026-07-01 — Stack: TypeScript monorepo + Supabase + Vercel
- D-003 — 2026-07-01 — Single-player-first MVP
- D-002 — 2026-07-01 — Hybrid combat model
- D-001 — 2026-07-01 — Match-based async turns
