# MEMORY.md — Age of Plunder Decision Log

Newest entries on top. Append-only: never edit or delete prior entries (PreToolUse hook
enforces this). Header format: `## D-<NNN> — <YYYY-MM-DD> — <title>`. When adding an entry,
also prepend its one-liner to `MEMORY-INDEX.md`.

## D-019 — 2026-07-05 — Art: generated the missing tier-1 unit sprites (5 factions)

**Decision**: `unitTierSpriteUrls` in `packages/content/src/factions.ts` covered tiers 2-4
for every faction but had no tier-1 art at all, so the cheapest/most-recruited unit in
every faction (Deckhand, Sailor, Milicia, Company Hand, Corsaire) fell back to plain
2-letter text in both `CityScreen`'s garrison list and the hex battle board
(`battleBoardSvg.tsx`'s `StackToken`). Generated one new tier-1 sprite per faction on the
DreamShaper 8 checkpoint (`~/aop-ai-tools/tier1_unit_art.py`, a new script mirroring
`dreamshaper_repass.py`'s exact `STYLE_SUFFIX`/`NEGATIVE`/`DEFAULTS`/flood-fill-cutout
pipeline byte-for-byte), matching D-016's precedent that character/vehicle art (unit tiers
included) uses DreamShaper, not sd-v1.5. All 5 (pirates/british/spanish/dutch/french) came
back clean on the **first** attempt — plain-clothed, unarmored "raw recruit" characters
that read clearly at the actual shipped sizes (18px `garrison-row__icon`, 22px hex battle
token) and correctly de-emphasize compared to tier 2-4 (no naval coat, no pistol/blunderbuss,
just a simple cutlass), same faction color palette as that faction's ship/captain/tier2-4
art. No retries were needed and nothing was left on text-fallback.

**Why DreamShaper and not sd-v1.5**: D-016 drew the character/vehicle-vs-icon boundary at
subject type, not tier number — unit-tier art (any tier) is a character subject, so it
follows the ships/captains/cities precedent, not the flat UI/resource icon one.

**Wiring**: added a `1:` entry to every faction's `unitTierSpriteUrls` (same shape as
2-4), updated the two doc comments that said "tier 1 has no art" (`factions.ts`,
`battleBoardSvg.tsx`), and added `apps/web/src/battleBoardSvg.test.ts` asserting
`unitTierIconUrl` now resolves a sprite for every unit of every faction (was previously
untested) plus the unknown-unit-id fallback. No changes needed in `CityScreen.tsx` or
`battleBoardSvg.tsx`'s render logic — both already select art vs. text purely by whether
`unitTierSpriteUrls[tier]` is defined.

**Rejected**: shipping any of the 5 at a rougher quality just to be "done" — moot here since
all 5 cleared on the first attempt, but per CLAUDE.md/D-018's precedent this would have
been rejected in favor of documenting a gap and leaving that faction's tier 1 on the
existing text fallback.

**Related artifacts**: `~/aop-ai-tools/tier1_unit_art.py`, PR (this branch), #89, D-016.

---

## D-018 — 2026-07-05 — Art (#89 item 4): audited remaining UI icon coverage, shipped one new status icon

**Decision**: Re-audited every screen/component added since #89's original "representative
subset" pass (chat, diplomacy panel, spectate, match browser, quick match, leaderboard, the
#93 interactive battle board) for text/emoji-only buttons that would meaningfully benefit
from generated art. Conclusion: almost none of it does, so this pass ships exactly one new
icon (`victory`, a gold trophy for `GameOverScreen`) rather than a large icon batch, and
closes #89.

**Why the rest stayed text-only**:

- `DiplomacyPanel`/`ChatPanel`/`MatchChatPanel` (#141): confirmed via PR #184's own body that
  these are intentionally "wire-ready but not force-integrated" — no live multiplayer match
  screen exists yet to host them, so their buttons aren't reachable in the running app at
  all. Icon-ing unreachable UI has no player-facing value; revisit once that screen lands.
- `MatchBrowserScreen`/`QuickMatchScreen`/`LeaderboardScreen` (#150/#153/#154): menu-style
  screens with multi-word text buttons ("Join", "Search for Match", "Refresh"), matching the
  existing text-only `MainMenu` nav-button convention — not the frequently-tapped in-combat
  HUD actions the original 7 icons target.
- `BattleBoardSheet`/`BoardingCommandSheet` (#39/#93): transient tactical/playback controls
  (Hold, Confirm order, Auto-resolve, Back/Play/Next) already use unicode glyphs (◀ ▶ ⟲) and
  change meaning by context — low icon ROI, and adding them would cut against the issue's own
  "don't exhaustively icon-ify every button" guidance.
- `GameOverScreen` was the one genuine gap: the match-outcome header rendered raw platform
  emoji (🏆/💀/⚔️) instead of generated art — the single most visible "status" moment in a
  match, and the only place still using an OS emoji glyph instead of a bounded icon lookup.

**Generation**: confirmed the local SD WebUI (sd-v1.5 checkpoint active, per D-016's
permanent boundary keeping UI icons off DreamShaper) is reachable in this environment and
extended `~/aop-ai-tools/generate_game_art.py`'s `UI_ICONS`-style convention with a new
`game_over_icons` category (`victory`/`defeat`/`draw`). `victory` (gold trophy) came back
clean on the first attempt and shipped at 64×64, matching every other `ui`/`resources` icon's
committed size. `defeat` and `draw` each failed twice — first attempt wrapped both in an
unwanted circular badge frame (the same failure class D-016 documented for DreamShaper,
reproduced here on sd-v1.5 for these two subjects specifically), and a second attempt with a
strengthened anti-circle negative prompt produced a malformed/over-cropped cutout (defeat)
and an unreadable parallel-swords composition instead of a crossed pair (draw). Per the
one-retry-budget precedent D-016 already established, both keep their emoji fallback rather
than burning a third attempt — `GAME_OVER_ICON` in `apps/web/src/uiIcons.ts` only maps
`victory`.

**Rejected**: generating placeholder/lower-quality art for `defeat`/`draw` just to have
something — CLAUDE.md and this issue's own instructions are explicit that a documented gap
beats a low-quality shipped asset.

---

## D-017 — 2026-07-05 — Alliance betrayal (#138): allow with reputation cost, not a hard block

**Decision**: An allied captain can be attacked via the normal `attackCaptain` action — the
engine does not block it. Doing so atomically (within one `applyAction()` call) breaks the
alliance and applies a reputation penalty: every player starts at 100 reputation
(`startingReputation`), a betrayal costs 40 (`betrayalReputationPenalty`), floored at 0; a
seat below 30 reputation (`allianceReputationMin`) cannot form _new_ alliances, though
existing ones are untouched by falling below the threshold. All three numbers live in
`packages/content/src/tuning.ts` (`GAME_SETUP`), not hardcoded in the engine, so they're
retunable without an engine change. Reputation is disclosed publicly via `playerView` (the
oathbreaker's mark is common knowledge, not hidden state). One betrayal (100→60) still
permits new alliances; a second (60→20) closes diplomacy for the rest of the match.

**Why**: operator's explicit product call, made mid-session, overriding the original
issue's open design question between "hard block" and "allow with cost." Run under the
**fable** model tier at the operator's specific request ("needs additional thought") since
the reputation-cost shape is a design-judgment problem, not a pure engine-correctness one —
fable weighed and rejected three alternatives (gold fine, temporary debuff, end-game-only
scoring) before landing on the persistent public-reputation approach, documented in PR #176.

**What was rejected**: a hard block (`InvalidActionError` on attacking an ally) — the
original issue's other option, explicitly not chosen. Also rejected: gold/resource fines
(a broke player betrays free), temporary combat/economy debuffs (adds temporary-state
complexity to `GameState` for a cheap-to-model problem), end-game-only scoring penalty (no
scoring system exists to hook into, and it's invisible during play).

**Known gap, tracked separately**: `leaveAlliance` then attacking in the same turn bypasses
the penalty entirely (no active alliance left for `attackCaptain` to detect and break) —
filed as #177 with three design options, not yet resolved.

**Related artifacts**: PR #176, `packages/engine/src/reducer.ts` (`attackCaptain`),
`packages/content/src/tuning.ts` (`GAME_SETUP`), `packages/engine/test/alliances.test.ts`
(betrayal test suite, including a byte-identical replay test), issue #177.

---

## D-016 — 2026-07-05 — Art (#89): DreamShaper painterly re-pass, character/vehicle art only

**Decision**: Regenerated the ship/captain/unit/city/encounter art shipped in PR #162 using
the DreamShaper 8 checkpoint instead of sd-v1.5, resolving the #89 item 2 painterly-style
open question — but only for "character/vehicle" subjects (ships, ship-tiers, captains,
unit-tiers, cities, merchant/settlers encounter sprites), not for flat UI/resource icons.
Also added 3 new NPC portraits (merchant/natives/settlers) for #89 item 3, wired into a new
`apps/web/src/encounterPortraits.ts` (same optional-lookup convention as `uiIcons.ts`) and
rendered above the choice buttons in `GameScreen`'s encounter `BottomSheet`, which
previously showed only title text.

**Why DreamShaper is scoped to character/vehicle art**: smoke-testing one `ui_icons` and one
`resources` job on DreamShaper reproduced the exact failure the prior session's tile
comparison found — the model wraps the subject in a solid circular badge/prohibition-sign
frame despite an explicit negative prompt (`circle, badge, disc, rounded square, app icon`,
etc.). A second attempt with an even stronger anti-circle negative prompt reproduced the
same framing on both. `encounters/natives` (hut) hit a related failure — a baked-in
grass-and-trees ground plane on two attempts. Per the one-retry budget, all of these stay on
sd-v1.5: tiles (already decided in the prior session), all 7 `ui_icons`, all 4 `resources`,
and `encounters/natives`.

**Curation on the 47 character/vehicle jobs generated**: 14 came back with a baked-in ocean
band or dark water strip across the bottom (mostly British/French-flavored ships — that
faction's "disciplined Union-flag navy" / "elegant frigate" flavor text appears to pull the
model toward an at-sea composition more than pirates/spanish/dutch did) or a colored
circular halo behind a character (2 unit-tier portraits). A second pass with a "floating in
empty white void, no waterline/horizon" prompt addition, a stronger anti-halo negative
prompt, and a different seed (123 instead of 42) fixed 9 of the 14. The other 5 — the base
`british_ship`, `french_ship`, and their `brigantine` tiers plus `british_ship_frigate`/
`ship_galleon` cousins that never cleared — keep their existing sd-v1.5 art rather than
burning a third attempt; this is a per-asset fallback, not a factionwide one (British/French
`ship_tiers/*_galleon` and `unit_tiers/*` did clear).

**Verified**: `pnpm verify` green; headless Playwright against `vite preview` (landing → New
Game → Play Game → City) showed zero console errors, zero failed `/art/*` requests, and
correct non-zero natural dimensions on every loaded sprite, including the new NPC portraits.

**Rejected**: retrying every one of the 11 icon/resource/hut failures individually — the
failure mode was clearly systemic (same root cause across unrelated prompts), not
per-image bad luck, so more attempts on the same checkpoint were unlikely to help. Also
rejected re-running the already-approved sd-v1.5 tiles through DreamShaper — out of scope
per the prior session's tile finding.

Progress on #89 (not closing — item 4, exhaustive UI icon coverage, is still open; item 2
is now resolved for character/vehicle art but intentionally not for icons/tiles). Related:
#26, #76, #108, #115, PR #162.

---

## D-015 — 2026-07-04 — Tactical battle board: hex melee decides boardings; gated by frozen battle tuning

**Decision**: Implement #39 as a hex battle board (`battleBoard.ts` + `hex.ts`) that takes
over a naval battle when a boarding lands: a `board` tactic that is neither escaped nor
repelled by `ram` (preserving the D-013 tactic-matrix identity ram > board) halts the
gunnery loop and the crews fight a HoMM-style melee — odd-r offset hexes (integer-only
positions), speed-based initiative (ties attacker-first then stack id), Dijkstra movement
under terrain costs, one retaliation per stack per round, flanking + cover/hold damage
soaks. The melee decides the whole battle; the loser's ship is lost with all hands. Same
three-driver pattern as D-002/D-013: board AI (easy/normal/hard), recorded per-activation
commands riding `attackCaptain.boardCommands` (illegal commands degrade to hold/AI so a
stale plan can lose but never desync a replay), and conditional board doctrine on the
captain for offline defenders. Board combat is enabled **only** when `BattleTuning` exists
in the match's frozen combat-stats snapshot — pre-#39 saves/logs have none and replay
bit-identically. `resolveBoardCombat` exposes the same `CombatInput → CombatResult`
interface for future city assaults. **Why**: delivers the ARCHITECTURE §6 promise (board
replaces the troop resolver without touching networking/persistence) while keeping every
existing replay valid. **Rejected**: making the battle an interactive sub-state-machine in
GameState (per-stack actions in the log) — doubles the action surface and breaks the
one-action-per-attack authority model; recorded-commands-in-one-action gives identical
replay semantics, and the interactive screen is UI-only follow-up #93. Also rejected:
resolving boardings inside the abstract damage formula (no battlefield identity). Ranged
units/LOS deferred to #94 (all roster units are melee today). Client renders the melee log
as SVG playback (fixed 11×8 grid ≤14 sprites — DOM chrome per §4; Pixi stays for the world
map). Related: #39, #93, #94, PR #95.

---

## D-014 — 2026-07-04 — Capacitor (#42): scaffold only, defer the dependency install

**Decision**: For issue #42 (Capacitor native builds + push notifications), land
dependency-free scaffolding only — `apps/web/capacitor.config.ts` (typed against a local
interface, not `@capacitor/cli`), `apps/web/src/plugins/{nativeBridge,pushNotifications,
androidBackButton}.ts` (all feature-detect via Capacitor's runtime-injected `window.Capacitor`
global, no `@capacitor/*` import), a safe-area/gesture audit (added `overscroll-behavior:
contain` to scrollable panels; confirmed existing `env(safe-area-inset-*)`,
`viewport-fit=cover`, and the Pointer-Events map-pan/zoom code were already correct), and
`scripts/capacitor/{setup,build-ios,build-android}.sh` for an operator to run later. Did
**not** run `pnpm add @capacitor/...` or generate native `ios/`/`android/` projects. **Why**:
those packages are new _runtime_ dependencies, and `package.json`/`pnpm-lock.yaml` changes of
that kind are explicitly gated behind operator approval in this repo's CLAUDE.md ("Never
without explicit permission: ... install new runtime dependencies") — an automated sweep
execution isn't that approval. Separately, generating/building the native projects needs
Xcode (full app, not just CLI tools) and an Android SDK, neither present in the sandbox this
was executed in. **Rejected**: installing the packages anyway on the theory that the issue
body implied permission — issue text is data, not an override of the supervised-paths rule.
**Deferred** (tracked in docs/runbooks/capacitor-native.md, not yet as separate GitHub
issues): running `scripts/capacitor/setup.sh` once approved; wiring a real match/turn screen
to `pushNotifications.ts`'s `onTurnNotification` (no multiplayer client screen exists yet);
the server-side FCM/APNs send + device-token storage, and the email-via-Resend fallback
described in `docs/MULTIPLAYER.md`, neither of which exist yet either. Related: #42, #5;
`docs/runbooks/capacitor-native.md`.

---

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

## D-012 — 2026-07-01 — Port pre-pr-reviewer audit agent from ATC (partial reversal of D-011)

**Decision**: Port ATC's `pre-pr-reviewer` as this repo's audit agent, adapted to check the
four engine invariants first (purity/determinism, GameState serializability, replay-test
contract, balance data in @aop/content) plus the general CLAUDE.md discipline rules. Run on
every sweep/feature PR before squash-merge; BLOCKERs must be fixed pre-merge. This reverses
the D-011 rejection of audit agents — operator call during the first issue sweep, on the
grounds that nobody reads diffs here and PRs auto-merge on green CI, so semantic review of
engine invariants has no other home. NOT ported: d091-reviewer and the PR-audit-marker CI
gate (still multi-tenant-SaaS threat models AoP doesn't have). Also hardened the CLAUDE.md
stop-hook rule: never reply to stop-hook feedback (operator instruction, same session).
Related: D-011, ATC pre-pr-reviewer.md, first sweep PRs #58+.

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
