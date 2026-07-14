# MEMORY index

One line per decision, newest first. Rebuild with:

```bash
{ printf '# MEMORY index\n\n'; \
  printf 'One line per decision, newest first.\n\n## Entries\n\n'; \
  grep -E '^## D-[0-9]+' MEMORY.md | sed 's/^## /- /'; } > MEMORY-INDEX.md
```

## Entries

- D-046 — 2026-07-14 — evening sweep: AI v2 live (garrison/led-parties/round-limit endgame, #510 stall 0→46 captures), #499 instant-pool rescue (RULES_VERSION→11), item toasts SP+MP, theme/zoom UI; #524 art awaiting operator; follow-ups #519 #522 #523 #526 #527
- D-045 — 2026-07-14 — #508 configurable round limit (optional roundLimit in setup, additive no-bump; cap winner = cities→gold→draw, operator-vetoable; AI awareness deferred #509)
- D-044 — 2026-07-14 — Map quadrupling: 4x area all presets (48/64/80/96), structural land-assault guarantee w/ RNG-free repair post-pass + property battery, authored map rebuilt w/ land at measured spacing (69 captures/96), RULES_VERSION→10; land warfare dominant in sims, capital conquest thins w/ distance (#510); byte-cap raise operator-gated (#507)
- D-043 — 2026-07-14 — #498 rebalance: flat captain stats (+N per unit, not %), items boost stats (RULES_VERSION→9)
- D-042 — 2026-07-14 — #498 captain expansion shipped (stats+skill picks, garrison/port defense all-captured, items w/ 8-cap+stash, captain-led parties, RULES_VERSION→8); sim −5% captures; AI v2 deferred #500; monitor fixed after 95/95 failures (#497); Seer PR #496 rebuilt
- D-041 — 2026-07-13 — #444 art pipeline migrated A1111 → ComfyUI (torch 2.13 MPS clean, tooling in scripts/art/); DreamShaperXL Turbo evaluated 8/8 coherent vs DS8 6/8 but more 3D-render style — adoption deferred to operator
- D-040 — 2026-07-12 — #482 party UX round 2: standing march orders (marchOrder + setMarchOrder/clearMarchOrder, pause on new contact OR blocked route, RULES_VERSION→7), dotted march-route preview + pennants, interactive tactical land battles via probePartyBattle/probePartyAssault (both kinds, single-player; MP stays auto-resolve pending #422), MatchScreen party controls (all nine verbs via pure PlayerView classifiers)
- D-039 — 2026-07-12 — #475 AI land player: planner disembarks/marches/assaults with parties (captain-preserving attrition vector), intercepts + reinforces vs enemy parties, re-embarks stranded ones; planner+content only, RULES_VERSION 6 (bumped by sibling #466/#467); conquestReachable inert (authored map has no land), new generated-map battery: 89→75 captures but captains-captured 67→44 (−34%), 25 captures by party, 56/96 disembark
- D-038 — 2026-07-12 — #466/#467 land content shipped: GameState.landSites (hold=persistent-claim income mine/sawmill, haul=one-time lumberCamp/ruins) + landEncounters (nativeVillage/hermit/banditCamp) + captureSite/resolvePartyEncounter actions; inland neutral settlements seeded on interior tiles (no-sea-assault by construction, overland-capture-only, no shipyard), xlarge is where they appear; separate placement RNG keeps sim battery byte-identical; RULES_VERSION→6
- D-037 — 2026-07-12 — #465 landing parties shipped: GameState.parties + 5 actions (disembark/moveParty/embark/attackParty/partyAssaultCity), RULES_VERSION→5, full-defense land assaults, stranded-until-rescued keeps seats alive; AI ignorant (#475), UX polish (#476)
- D-036 — 2026-07-12 — #471 multi-wave sieges: AI_TUNING.siegeStickinessBonus makes loaded captains press attrition sieges (was scored below economy → dithered); sim 13→77 captures/96, max same-city assaults 1→2, 27/96 multi-wave, repelled/capture 1.23→0.68; planner+content only, RULES_VERSION stays 4
- D-035 — 2026-07-12 — #462 attrition warfare: AI attritionMinRatio floor + %-of-base ship refits (all 4 tracks); sim 3→13 captures/96 (4.3×), planner+content only, no RULES_VERSION bump
- D-034 — 2026-07-12 — #453 conquest levers implemented (RULES_VERSION→4); sim result: reachable but rare (3/96), follow-up #462 (PR #461)
- D-033 — 2026-07-12 — Conquest rework (#453): troop availability populates every 5 turns; ship troop capacity ×5
- D-032 — 2026-07-12 — City art v1 shipped: cutouts, harbor backdrop, citadel corner tower (amends D-031's fortification-art detail)
- D-031 — 2026-07-11 — Local SD art pipeline: MPS requires pinned torch 2.3.1; city-art v1 approved (#436, #444–#447)
- D-030 — 2026-07-11 — City rework Wave 1 shipped: tavern gates captains, militia+turrets, starting barracks, faction identity (#427–#443)
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
