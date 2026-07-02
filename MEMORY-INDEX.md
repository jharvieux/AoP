# MEMORY index

One line per decision, newest first. Rebuild with:

```bash
{ printf '# MEMORY index\n\n'; \
  printf 'One line per decision, newest first.\n\n## Entries\n\n'; \
  grep -E '^## D-[0-9]+' MEMORY.md | sed 's/^## /- /'; } > MEMORY-INDEX.md
```

## Entries

- D-013 — 2026-07-01 — Phase-1 engine vertical slice: map, pathfinding, hybrid combat, AI, sim harness
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
