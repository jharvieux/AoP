## D-048 — 2026-07-19 — Issue sweep: 23 closed across 14 PRs (harvey-audit burn-down + operator rulings)

**Decision.** Full /issue-sweep over the 16 harvey-audit findings plus #539/#540/#535.
Operator rulings recorded mid-sweep: (a) supabase/migrations/** and supabase/functions/**
pre-approved for executors; (b) #541 CORS = env-var allowlist (`ALLOWED_ORIGINS`, default
https://age-of-plunder.vercel.app), Vercel previews allowed, localhost included; (c) #540
saves = Option A snapshot saves (GameState snapshot beside the replay; same-version keeps
replay verification, cross-version resumes from snapshot, schemaVersion 2→3); (d) #574
push tokens purged after 90 days un-refreshed (`purge_stale_push_tokens`, cron wiring =
operator step, #580); (e) #575 payment/entitlement history retained indefinitely
(documented in docs/DATA-CLASSIFICATION.md).

**Why.** Harvey audit backlog was the bulk of open issues; sweep closed 23 (net −14 after
9 filed, 5 of which the sweep itself closed). Notable landings: RLS initplan + policy
consolidation and definer-fn hardening (#567), GDPR chat erasure via BEFORE DELETE
trigger on profiles (#577), CI SHA-pinning + injection fix (#562), catalog de-triplication
into @aop/content (#569), bounded-concurrency sweeps + bit-identical AI lookup refactor
(#578, ENGINE_VERSION bump).

**Rejected.** #535/#422 (live-defender lockstep server side) — needs live two-client
verification, not sweep-landable. Retroactive match_chat orphan cleanup — post-deletion
NULLs indistinguishable from seats vacated to AI; blanket sweep could erase live users'
messages. Batching matchmaking drainQueue / checkout poll — sequential by design (claim
atomicity / backoff), documented won't-fix in #578.

**Artifacts.** PRs #557 #558 #560 #562 #563 #564 #567 #568 #569 #571 #576 #577 #578 #579;
issues filed #559 #565 #566 #570 #572-#575 #580; docs/DATA-CLASSIFICATION.md. Operator
still owes: deploy.yml run (edge functions + migrations + ENGINE_VERSION skew),
`supabase secrets set ALLOWED_ORIGINS`, cron wiring #580, colima disk cleanup.

---

## D-047 — 2026-07-14 — #517 map entity-count ceilings (maxEncounters/maxResourceNodes = 200 each)

**Decision.** `MAP_VALIDATION_LIMITS` (@aop/content's `tuning.ts`, mirrored in the engine's
`MapValidationLimits` shape) gains `maxEncounters`/`maxResourceNodes`, both 200, enforced by
`validateMapDefinition` with specific `encounter-count-exceeded`/`resource-node-count-exceeded`
errors (type, count, ceiling in the message). Deferred from #516 (that PR raised
`MAP_CODE_MAX_BYTES` to 256 KiB but only capped dimensions, not entity counts — a legal map
could carry ~2000 encounters + 2000 resource nodes, ~395 KiB, relying on the byte gate alone
to reject it).

**Why 200.** Measured against the largest legal map (96x96, 8p): the procedural
water-encounter scatter (`ENCOUNTER_CATALOG.spawnDensity` 0.012/navigable-water-tile) places
~80 encounters there (6733 measured navigable water tiles) — 200 keeps 2.5x headroom over
that natural density. Resource nodes have no procedural equivalent (author-placed only); the
canonical authored `STARTING_MAP` places 4 nodes for 2 players on 48x48, which scales to ~16
at the 96x96/8p ceiling — 200 keeps >10x headroom. Both ceilings sit an order of magnitude
below the 2000-per-type spam case, so the entity-count check now rejects that case first,
with the byte gate remaining the final backstop (still load-bearing: a highly
RLE-compressible map could otherwise spend its saved byte budget on far more entities than
the byte gate alone would imply).

**Rejected.** Leaving the byte gate as the only backstop (works only when tiles compress
poorly — a real, compressible map could hide a large entity count in the byte budget it
saves on tiles). Not a RULES_VERSION bump: validation runs at publish/load time, not inside
replay — no GameState/action semantics changed. No DB migration: entity counts aren't
mirrored in a SQL check constraint (only byte/length caps are), confirmed via
`constants-parity.test.ts`'s existing coverage. ENGINE_VERSION regenerated (content/engine
source changed).

---

## D-046 — 2026-07-14 — Evening sweep: AI v2 live (garrison/led-parties/items/endgame), rescue+toast plumbing, theme/zoom UI

**Sweep of 8 issues, 5 batches, all landed** (PRs #518 #521 #520 #525; #524 shipyard art
left open for operator style approval). Highlights: **AI v2** (#500/#509/#510, PR #525) —
the planner now garrisons against naval threats (never the last mobile captain), leads
parties ashore only on expected-win, takes stash items at port, makes role-aware stat
picks, plays the scoreboard under a round limit, and the #510 spacing-20 capital-conquest
stall is broken (0→46 captures/96) via a stall-gated landAttritionMinRatio (0.20) after
two measured-and-rejected designs (documented in-code; naive variants starved sieges —
#526). **Rescue** (#499, PR #521, RULES_VERSION→11): operator-decided instant pool
transfer; modeled as shipLost+leading-nothing (no new fields), port-proximity sweep,
recruitCaptain rehire; ghost-hull embark bug fixed inline. **Toasts**: #503 SP land-haul
(siteItemGained) + #502 MP transport (acting-seat-only, structurally leak-proof) — the
two halves were never cross-wired, filed #527. **UI** (#494/#512, PR #520): theme slots
for every themeable family (audit caught the missing land-encounter kinds), whole-board
fit zoom for 96² maps.

**Process notes.** One primary-checkout contamination (stale pre-#521 reducer.ts staged
on main) was caught by the stop hook and restored from HEAD; no agent admitted the write —
watch for recurrence. Composition auditing between same-sweep PRs earned its keep twice
(#521×#525: pooled captains invisible to four planner liveness checks, fixed pre-merge;
#518×#521: the #527 gap).

**Follow-ups filed**: #519 #522 #523 #526 #527. Prior gate items still open: #524
(operator), VERCEL_TOKEN (optional now, #425).

---

## D-045 — 2026-07-14 — #508 configurable round limit (optional GameSetup.roundLimit, additive, no RULES_VERSION bump)

**Decision.** Round limit is a game-start option (SP NewGameSetup + MP private-match
settings; quick match stays unlimited). Absent = unlimited = pre-existing behavior,
proven byte-identical by test — hence no RULES_VERSION bump. Limit N = last round
played (ends before phantom-round income). **Winner at cap: most cities → gold
treasury tiebreak → draw (winnerId null)** — operator-vetoable, isolated in the pure
`roundLimitWinner` function. Limit is public to both seats (rides GameSetup through
PlayerView). No DB migration (matches.settings is code-validated JSONB).

**Rejected.** Engine-level default limit (changes existing behavior); seat-order
tiebreak (arbitrary advantage). **Deferred:** #509 AI round-limit awareness.

**Artifacts.** PR #511 (audited + rebind-re-audited post map-rebase), issue #508.

---

## D-044 — 2026-07-14 — Map quadrupling: 4x area on every preset, structural land-assault guarantee, authored map rebuilt with land (RULES_VERSION→10)

**Decision.** Operator directive (verbatim): "Quadruple size of all maps and adjust them so
they all allow land based attacks." Interpreted as 4x AREA — both dimensions doubled on
every preset (`MAP_DIMENSIONS` 24/32/40/48 → 48/64/80/96) — and land attacks as a
STRUCTURAL guarantee, never seed luck: every player capital (and every inland settlement)
must be reachable by a landing party from at least one disembark tile — a land tile
adjacent to navigable (ship-reachable, not pond) water — that is NOT adjacent to the city,
marching overland to an assault position. Correlated content scaled in lock-step:
`homeIslandRadius` 2→4 (xlarge override 4→8), so land keeps pace with sea (disc area ~r²)
and EVERY size now has island interiors — inland settlements appear on every board,
superseding D-038's "xlarge is where they appear". RULES_VERSION 9→10 (MAP_DIMENSIONS is an
engine constant, not config-frozen, so same-seed generation changes break replays).

**How.** Guarantee = `hasLandAssaultRoute`/`navigableWaterTiles` (map.ts, exported) +
a generator post-pass `ensureLandAssaultRoute`: deterministic, RNG-FREE repair (grows a
bounded two-tile land bridge off the port, fixed direction order, re-verifies navigability
and start-to-start sea connectivity, throws if irreparable) — a no-op byte-for-byte on
healthy output, never a retry loop. Property battery: `landAssaultGuarantee.test.ts` (25
seeds × 4 sizes × square+hex + degenerate radius-0 repair cases); authored maps held to
the same guarantee in `contentHexDeterminism.test.ts`. Authored `STARTING_MAP` rebuilt at
48x48 with radius-3 home islands — port spacing is a MEASURED choice (sweep in
startingMap.ts doc): naive 2x corner scaling gave ZERO assaults ever (flagships duel
mid-sea while garrisons outgrow the attrition floor); the shipped ~15-apart layout restores
69 captures/96 with 24 by landing party and 72/96 multi-wave sieges. New tools:
`land-battery.ts` (parameterized conquest battery incl. `authored`), `map-preview.ts`
(tile-dump PNG). MapCanvas now opens centered on the viewer's fleet (fixed top-left origin
stranded spawns in fog at 96-wide); editor offers xlarge and resolves the per-size radius.

**Measured.** Generated battery (30-round cap, flat-stats era): small 111 captures/48
matches (93 by party, 25 capitals), medium 86/48 (81, 7), large 37/48 (37, 0), xlarge
31/24 (31, 1) — land warfare dominant everywhere; capital conquest thins with distance
(garrison snowball outpaces travel) → #510 (AI v2 adjunct). 96x96 in-app pan: 60fps
(median 16.7ms), no errors. Typical 96x96 map code ≈20 KiB of the 64 KiB cap; the
adversarial zero-RLE 96x96 exceeds it and is cleanly rejected — cap raise needs a DB
migration, operator-gated → #507. Matchmaking size enum unchanged (names only) — NO new
migration needed.

**Rejected.** Retry-until-valid generation (unbounded draws); raising MAP_CODE_MAX_BYTES
without its companion migration (parity test enforces the mirror); scaling fog/vision
radii (bigger maps are relatively more fogged — deliberate exploration gameplay, single
content numbers if the operator wants them scaled); minSize raise (existing community maps
stay valid).

---

## D-043 — 2026-07-14 — #498 rebalance: flat captain stats (+N per unit, not %), items boost stats (RULES_VERSION→9)

**Decision.** Operator (2026-07-14, amending D-042's rates): captain attack/defense stat
points are whole-number FLAT adds to EVERY commanded unit's attack/defense score, applied
BEFORE percentage scaling — `(unit.score + flat) × (1 + pct/100)` — so a point matters most
to low-tier units (3 points take a tier-1's attack 1–3 to 4–6, up to 4×; a tier-4 gains
~25%). Default 1 per point, content-tunable (`CAPTAIN_STAT_TUNING.attackPerPoint`/
`defensePerPoint`). Skills keep their percentages; speed stays +1 MP/pt. Mid-flight
amendment: items no longer carry their own percentages — each item grants stat points
(`ItemDef.statBonuses`; commons +1 to one stat, rares +2 or +2/+1), live while CARRIED
(carried = equipped, all 8 slots; stash inert), speed items flow through the same refresh
path (effective from the NEXT refresh — no mid-turn take/deposit movement exploit).

**How.** New `Combatant.attackFlatBonus`/`defenseFlatBonus` channel parallel to the pct
fields, threaded through naval auto-resolve, the tactical board (flat lands on per-strike
attack/defense scores before that path's percent ratio), port defense (flats sum across
defenders like the percentages), and led parties. `effectiveCaptainStats` (skills.ts) is
the single stats+items aggregation point for reducer/AI/board/UI. RULES_VERSION 8→9 (field
meaning changed). PR #506.

**Sim battery (same 96-match harness).** Combined delta on every counted metric: ZERO —
verified per-match, all 96 outcome vectors identical. Gameplay states DO diverge in every
match where the AI spends stat points (~0–6 late picks/match) and are byte-identical where
it doesn't; no discrete battle outcome flipped because v1 AI stat usage is thin and AI
matches have no item source (planner never resolves encounters — #500). Real impact lands
with #500 and human play; no counterweights added per instruction.

**Rejected.** Overloading the pct fields with flat semantics (parallel channel instead); an
equip-slot mechanic (carried = equipped); balance counterweights (nothing measurable to
counter yet).

---

## D-042 — 2026-07-14 — #498 captain expansion shipped: stats, garrison & port defense, items, captain-led parties (RULES_VERSION→8)

**Decision.** Operator-commissioned epic, four product calls locked in session: (1) level-up
grants a stat point (attack/defense/speed, 2%/2%/+1MP per point, content-tunable) IN
ADDITION to the existing skill pick; (2) garrisoned captain AND in-port captains join city
defense and are ALL captured if the city falls; (3) captains can lead landing parties
(operator scope addition) — leader bonuses/XP in land combat, land item finds go to the
leader; the anchored ship is orderless and can be lost WITHOUT capturing the ashore captain
(`Captain.shipLost`); (4) items: 13 content-defined drops (sea encounters, land hauls, land
encounters, seeded RNG), 8-per-captain cap, faction `itemStash` overflow, port transfer.

**Shipped as** PR #501 (engine+content+MP+AI, RULES_VERSION 7→8 for the new drop draws) and
PR #504 (UI both screens + playerViewBoard parity), both audited clean. Sim battery:
captures 75→71 (−5%, cities tougher as intended, no counterweight); harbor-capture rarely
fires AI-vs-AI because the AI never garrisons (deferred to #500).

**Deferred (issues filed).** #499 stranded shipless-captain rescue path (+2 audit-suggested
tests); #500 AI v2 (garrisoning, led parties, item management, port-defense threat calc);
#502 MP submit-action has no encounterOutcome surface (item toasts SP-only); #503 land-haul
drops have no ActionOutcome to toast.

**Rejected.** Stats replacing skills (breaks shipped content/AI); uncapped inventories (cap
keeps choices meaningful); auto-balance counterweight for port defense (−5% is acceptable).

**Also this session:** synthetic monitor fixed after 95/95 lifetime failures — it asserted
403 on a bearer-less probe the gateway 401s before function code runs; now probes with the
anon key to the functions' real 403 boundary (PR #497, operator-approved workflow change).
Sentry Seer's auto-PR #496 (neutral-city faction crash) was unsound as submitted (didn't
compile, no tests); rebuilt via audit→fix→re-audit into strict/nullable helper split.

---

## D-041 — 2026-07-13 — #444 art pipeline migrated A1111 → ComfyUI; checkpoint successor evaluated, adoption deferred

**Decision.** Local art generation moves from AUTOMATIC1111 webui (v1.10.1, final/unmaintained
release, required torch pinned to 2.3.1 for working MPS) to ComfyUI (v0.27.0,
`~/aop-ai-tools/ComfyUI`, own venv, current torch 2.13). MPS output verified clean on
current torch — the corruption class that forced the A1111 pin does not reproduce. The
"upgrade" is by isolation: fresh venv per tool, never in-place torch upgrades (the July 11
failure mode). A1111 install is retained untouched as legacy; its venv keeps the 2.3.1 pin.

**Durable tooling (new, in-repo).** `scripts/art/comfyui_client.py` (stdlib-only txt2img
client for ComfyUI's workflow-graph API; A1111-style sampler names accepted),
`scripts/art/aop_styles.py` (the previously session-scratch prompt families: building
sprites, unit/party style, faction flavors — including the recovered gen_city_art.py
prompts), `scripts/art/gen_building_art.py` (candidate generator + contact sheet).
Gotcha encoded in the client: ComfyUI's execution cache returns NO images for a
byte-identical graph resubmission — vary `filename_prefix`.

**Checkpoint evaluation (same-seed contact sheet, 4 buildings x 2 seeds).**
DreamShaperXL Turbo V2 (SDXL, same author) vs DreamShaper 8: XL produced 8/8 coherent
buildings (DS8: 6/8, with its known badge-frame/logo failures firing twice) and no ring
framing, but reads more "3D render" than the shipped flat-cel style, ignores
plain-background instructions more (harder cutouts), and costs ~116s vs ~31s per image
(XL figure inflated by 6.5GB model swaps on 16GB RAM; batched same-model runs faster).
**Adoption is the operator's style call, per-batch — not decided here.** Both checkpoints
stay available; new art batches should contact-sheet both until a winner is declared.

**Rejected.** Upgrading torch inside the A1111 venv (breaks MPS, root-caused 2026-07-11);
Flux-class models (12GB+ weights exceed 16GB RAM headroom); SDPA attention flag
(`--use-pytorch-cross-attention` measured 41s vs 34s default).

**Artifacts.** PR for #444 (docs/AI-TOOLS-GUIDE.md rewrite + scripts/art/), comparison
sheet delivered to operator, private tooling memory note updated.

---

## D-040 — 2026-07-12 — #482 party UX round 2: standing march orders (RULES_VERSION→7), interactive land battles, multiplayer party controls

**What shipped** (PR for #482, code items; party art is separate work). Four pieces:

- **Standing march orders (engine).** `LandingParty.marchOrder` (plain JSON:
  `destination`, `knownContactIds`, `interrupted?`) + two actions, `setMarchOrder` /
  `clearMarchOrder` — the overland twin of #372 sail orders, fixed-tile destinations only
  (no intercept variant: parties don't chase; the AI re-plans each turn). Set-time first
  leg and every turn-start continuation share one `advanceMarchOrder` code path; the party
  walks tile by tile, revealing as it goes, and **pauses** (`interrupted`) on a NEW
  fog-of-war contact — and, unlike sail orders, also when no land route currently exists
  (another party blocks every path or squats the destination): a stopped column is loud,
  surfaced as a Resume/Cancel banner. Manual `moveParty` clears the order; arrival clears
  it; it dies with the party. Own-seat-only in player views, like `sailOrder`.
  **RULES_VERSION 6→7**: `endTurn` gains the auto-march phase (after sail-order
  continuation), so a v7 log replays differently on a v6 build. `sanitizeAction` extended
  (Deno check+test run). New `marchOrders.test.ts`: replay determinism, JSON round-trip
  resume at every prefix, all interruption edges, destroyed-marcher turn-start, view
  filtering.
- **Dotted march-route preview (web).** MapCanvas's #375 course preview now draws
  overland routes for a selected party from the same `findLandPath` inputs the engine
  validates (`partyBlockedSet`, the one shared block-set helper — #476's client-side
  partial-march planner in partyMarch.ts is superseded and removed). A party with a queued
  march shows breadcrumbs to a destination pennant (alert-colored when paused); tap-beyond-
  range sets the order (mouse) or two-tap-confirms (touch), mirroring ships exactly.
- **Interactive tactical land battles (engine probes + single-player web).** The reducer
  already resolved `attackParty`/`partyAssaultCity` on the `'land'` board with attacker
  `boardCommands` — what was missing was the probe/UI halves. New `probePartyBattle` /
  `probePartyAssault` (shared `probeLandBoard` core) mirror `probeCityAssault`'s
  record-and-pause contract; probe report == reducer `battleReport` bit-for-bit
  (probe.test.ts parity + interleaved-prefix determinism). In Tactical mode (#305) both
  fight kinds now play out through BoardingCommandSheet with the D-002 auto-resolve escape
  hatch; Auto mode and AI-vs-AI resolve byte-identically to before (no reducer change).
  **Both** fight kinds shipped interactively for single-player — no follow-up needed.
- **Multiplayer party controls (web).** MatchScreen gains the full party surface via pure
  PlayerView classifiers in matchActions.ts (`interpretPartyTileClick`, `selectParty` /
  `disembark` intents, nine `matchAction` builders, `partyFromView`): disembark sheet,
  march/march-order, embark, party attack + land assault confirms, site capture,
  land encounters, range shading, march banners. Multiplayer land battles stay on the
  async auto-resolve path — an interactive land board needs a battle session (#422
  territory); noted, deliberately not built here.

**Rejected:** intercept-style march orders (YAGNI until parties need to chase);
RULES_VERSION-free framing (the task and the endTurn semantics change both demanded the
bump); routing multiplayer land fights through battle sessions (out of scope, #422).

**Related:** PR for #482, branch `feature/sweep-party-ux2-482`. Foundations: #465/#477
parties, #480 land content, #479 AI land player, D-015/D-028 board conventions.

---

## D-039 — 2026-07-12 — #475 AI becomes a land player: planner uses/counters landing parties

**What shipped** (planner + content only; `runAiTurn` stays a pure per-turn function of
state, no cross-turn memory; no reducer change in this PR — RULES_VERSION is 6, bumped by
sibling #466/#467 land content merged separately, not by this work; ENGINE_VERSION regen).
`nextAiAction` now emits all five party verbs (#465):

- **Offense — the captain-preserving attrition vector.** On an _attrition_ wave (a city
  it can't yet win outright, ratio in `[attritionMinRatio, engageMinRatio)`), a loaded
  captain beside the target's landmass now prefers to **disembark** a party rather than
  storm by sea. Rationale, and the whole point: a repelled _sea_ assault captures the
  captain (ship + crew lost); a repelled _land_ assault destroys only the party. Parties
  then **march** (`moveParty`, land A*) and **assault** (`partyAssaultCity`) over the
  next turns, reusing the same attrition/siege-stickiness scoring the captain uses.
- **Counter.** A party **intercepts** an adjacent enemy party it can beat (`attackParty`);
  a city an enemy party marches on (within `partyThreatRadius`) is **reinforced** by a
  docked captain handing troops to its garrison (`transferTroops` toGarrison). To stop a
  reinforce/garrison-to-ship oscillation and avoid stripping defenders under threat,
  `planGarrisonToShip` now skips threatened cities.
- **Logistics.** A party with no reachable enemy city and no beatable foe **re-embarks**
  onto an adjacent friendly ship with room (`embark`); otherwise it holds
  (stranded-until-rescued). `runAiTurn` is crash-safe for every party state — extended
  the ai.test.ts crash-safety battery (six party scenarios) + determinism, alongside
  behavior tests for each verb.

**New AI_TUNING knobs** (all in @aop/content, personality-scaled where it's combat):
`landAssaultBonus` (30, ×combatScoreMult), `partyRescueScoreBase` (15),
`reinforceCityScoreBase` (60), `partyThreatRadius` (3), `partyThreatMinRatio` (0.4, audit
fix: a party below 40% of a city's intrinsic auto-defence is no threat — without the
floor a 1-troop nuisance party froze that city's garrison→ship logistics forever;
garrison-independent basis so the verdict can't oscillate with reinforce/unload).

**Measured (honest).** The `conquestReachable` battery is unchanged: its authored
`STARTING_MAP_HEX` has single-tile _port_ islands with **zero land**, so parties are
structurally impossible there and #475 is inert — no regression on the sea-assault
contract, and the no-free-capture / siege / multi-wave assertions stay green. Land
behavior is measured on a new **generated-map** 96-match battery (`landConquest.test.ts`,
small+medium, 30-round cap): vs the sea-only baseline (89 captures, 67 captains captured
on failed waves, 0 party actions), the land vector gives **75 captures — 25 of them by a
landing party — with captains captured down to 44 (−34%) and 62 failed waves costing only
troops, not captains**; 56/96 matches disembark. So the AI trades ~14 raw city-flips for a
markedly better captain economy: it spends cheap parties, not captains, to grind defended
cities. `landAssaultBonus`'s magnitude is not outcome-sensitive on radius-2 islands (a
party lands adjacent and assaults immediately, no march); it matters on larger islands.

**Related:** PR #479, branch `feature/sweep-ai-land-475`. Sibling work #466/#467 (land
sites/settlements) is independent — the planner degrades to no-ops if those targets are
absent. Follow-up candidates: escort/rescue-sailing a captain toward a stranded friendly
party; land targets for sites/settlements once they land.

**Merge note (2026-07-12, merging into main behind #480/D-038 below).** Checked the semantic interaction #480 flagged: unlike the captain planner's `approachCity` (sea-only, returns null for a water-neighbourless inland city), the party planner's land-only pathing (`cityLandApproaches`/`landStepTowardCity`, filtered by tile type, not water adjacency) already reaches inland neutral settlements — confirmed empirically (xlarge, 15 seeds: every seed's parties targeted an inland settlement, most captured one). That surfaced a real crash: `planConstruct`'s `constructibleBuildings` didn't know about #467's landlocked-shipyard reducer rule, so once the AI owned a captured inland settlement it could propose a `construct shipyard` action there and `applyAction` would throw `InvalidActionError`. Fixed inline (`constructibleBuildings` now filters `unlocksShipyard` buildings at a city with no adjacent water tile, mirroring the reducer check) with a regression test (`ai.test.ts` — landlocked-city construct planning). Planner-only change, no reducer/RULES_VERSION impact.

---

## D-038 — 2026-07-12 — #466/#467 land content: resource sites, land encounters, inland settlements, RULES_VERSION→6

**What shipped** (land-expansion epic #469, on top of #465 parties). Two new required
`GameState` piece domains plus inland neutral cities, all placed at match creation on
GENERATED maps only (authored/community maps untouched):

- **Land resource sites (#466)** — `GameState.landSites`, scattered on `land` tiles.
  Content `LAND_SITES` (`@aop/content/landSites.ts`) defines two behaviours:
  **hold** sites (mine → gold+iron, sawmill → timber) pay ongoing income each round to
  whoever last _claimed_ them, and **haul** sites (lumberCamp, ruins) pay a one-time
  reward on capture then go inactive. New action `captureSite` (party stands on the
  site): a hold claim is a **persistent marker** — it keeps paying after the party
  marches off and only flips when a rival party recaptures it (operator's likely-intent,
  chosen for simplicity + replay-safety over "party must stay present"). Hold-site income
  flows through the existing per-round `playerIncome` path (`economy.ts landSiteIncome`).
- **Land encounters (#466)** — `GameState.landEncounters` (separate array from sea
  `encounters`), content `LAND_ENCOUNTERS` (nativeVillage/hermit/banditCamp), resolved by
  an adjacent party via `resolvePartyEncounter` — the sea encounter's seeded
  `resolveEncounterChoice` reused, crediting party troops (no crew cap ashore, no captain
  XP). Kept a separate domain so the sea encounter stream is untouched.
- **Inland settlements (#467)** — neutral cities (`ownerId: 'neutral'`) seeded on
  _interior_ land tiles (every neighbour is land ⇒ ≥2 tiles from water ⇒ **no sea assault
  can reach them by construction**; still land-path-reachable on a solid island). Capture
  is **overland-only** via `partyAssaultCity` against the full militia+turret neutral
  defense (D-030/#435). No port tile, no shipyard: a new `construct` rule refuses an
  `unlocksShipyard` building at a city with no adjacent water (data-flag-driven, not
  hardcoded). Once captured they behave as normal cities minus ship functions. Counts are
  `INLAND_SETTLEMENTS.density`-scaled and capped by available interior tiles, so
  small/medium/large (home-island radius 2) seed few/none and **xlarge (#468, radius 4)**
  is where they appear in numbers.

**Determinism / no-perturbation**: all three placers draw from a **separate RNG stream**
(`seedForLandContent`, `landContent.ts`), never the live `GameState.rngState` — so combat
and sea-encounter roll order is byte-identical to a pre-#466 match of the same seed, and
the conquest-sim battery is unperturbed (verified: 587 engine tests green, incl. the sim
suites; the AI is party-ignorant #475, and `approachCity` returns null for the
water-neighbourless inland cities so the AI never even scores them). `RULES_VERSION 5→6`
(new required fields + reducer semantics; ENGINE_VERSION regenerated). New replay/mapgen/
economy tests in `landContent.test.ts`. UI: sites/land encounters render as tokens with
`resolveSpriteUrl` art fallbacks (#458 pattern) across all four map screens; GameScreen
wires party capture + a land-encounter choice sheet; CityScene degrades for no-shipyard
cities by construction (renders only present buildings).

**Rejected**: reusing the map-editor `resourceNodes` system for sites (occupation-based,
hold-only, editor-placed — wrong shape); folding land encounters into the sea `encounters`
array (risked AI/sim perturbation and cross-resolution bugs); folding land placement into
the live RNG the way sea encounters do (would shift every downstream roll and the sim
battery). Follow-up: AI valuing inland targets is out of scope here (#462/#475).

---

## D-037 — 2026-07-12 — #465 landing parties: new land-piece domain, five actions, RULES_VERSION→5

**What shipped** (engine foundation of the land-expansion epic #469, PR pending):
a new `GameState.parties` piece domain — `LandingParty` (troops, position on a `land`
tile, movement points; no XP/skills/orders, captains stay ship pieces) — and five
actions through `applyAction()`:

1. **disembark** — a captain on water lands chosen troops on an adjacent empty `land`
   tile for 1 ship movement point; the party lands with 0 MP (marches from next turn).
2. **moveParty** — deterministic land A* (`findLandPath`, same tie-breaks as naval
   `findPath`; shared `aStar` core) over `land` tiles only; never enters or crosses a
   tile any party holds; port/city tiles are never walkable.
3. **embark** — a friendly ship on an adjacent water tile re-boards the party;
   **partial re-board** (capacity-clamped in the party's stack order, remainder stays
   ashore); free of movement cost.
4. **attackParty** — adjacent land-board battle (auto or recorded boardCommands);
   decisive: the loser's party is destroyed outright (no capture — no captain ashore).
5. **partyAssaultCity** — land-side assault against the **full** `cityToCombatant`
   defense (militia + turrets, operator decision on #469); capture semantics identical
   to a sea assault; a failed assault destroys the party.

**Key semantics choices** (mine, flagged in the PR):

- Enemy parties are engaged by explicit attack, never by moving onto them (the issue
  floated enter-triggers-auto-battle; explicit attack matches attackCaptain/attackCity UX).
- Stranded-until-rescued (operator): parties persist indefinitely, no attrition, and a
  party ashore **keeps its seat alive** (it can still take a city) — elimination now
  requires no live captain AND no city AND no party. Elimination/resign sweeps remove
  parties (#450 interplay tested).
- Parties see with `captainVisionRadius` (no separate knob yet) and count as sail-order
  contacts; PlayerView filters them exactly like ships (own = full, enemy = sighting).
- `partyMovementPoints: 3` in @aop/content GAME_SETUP (marching slower than sailing's 5).

**Contract**: RULES_VERSION 4→5 (new required GameState field + elimination-rule change);
replay/serialization tests in `packages/engine/test/landingParties.test.ts`;
ENGINE_VERSION regenerated; multiplayer `sanitizeAction` extended.

**UI (minimal but playable, single-player)**: banner-token rendering + selection pulse
in MapCanvas, disembark troop-picker sheet, tap-to-march, tap-ship-to-embark, party
attack/assault confirm sheets. **Deferred** (issues filed): AI stays ignorant of
parties (#475); march orders, tactical land-battle planner, range shading, party art,
multiplayer action UX (#476).

---

## D-036 — 2026-07-12 — #471 multi-wave sieges: siege-commitment bonus makes attrition sieges sustain

**Problem.** #462 (D-035) taught the AI to launch attrition assaults but left a residual
limit: no attacker ever assaulted the same city twice (`bestSameCityAssaults == 1` across
all 96 battery matches, even at a 40-round cap), so the designed "war of attrition" (grind
one garrison down over waves until it falls) never actually happened.

**Diagnosis (sim-instrumented, not the #462 executor's guess).** The #462 hand-off blamed
offensive logistics / target-persistence. Instrumenting the battery showed the real cause is
a **scoring gap**: a loaded captain's attrition _approach_ is scored `combatMult` 0.5, which
lands below the economy verbs (~25-40), so the captain lingers at sea instead of pressing a
reachable siege. In seed 3 a captain sat at distance 13 from a city it could still attrit
(ratio 0.43-0.82) for many turns doing economy while the defender rebuilt its garrison. (Two
compounding facts, reported but not "fixed": the free militia+turret floor resets every
battle so only recruited-troop thinning persists, and defenders rebuild that garrison faster
than an attacker reloads a party — so waves must be _pressed_, not merely enabled.)

**Decision.** New `AI_TUNING.siegeStickinessBonus` (= 40, personality-scaled by
`combatScoreMult`): a ratio-scaled score bonus (`bonus × ratio`) added to a conquest
approach/assault, **applied only to the attrition case** (a city the captain can't yet win).
Scaling by the assault ratio makes the captain converge on the _softest_ (most ground-down)
reachable city and the pull decays for free as that garrison rebuilds — target persistence
with zero cross-turn planner memory (engine stays a pure function of GameState). Planner +
content only; **no reducer/replay change, RULES_VERSION stays 4** (ENGINE_VERSION regen only,
since content changed).

**Why derived, not new tracked state.** The task allowed a per-city recent-assault marker
(would be RULES_VERSION 4→5 + replay tests). Not needed: the assault ratio already rises as a
garrison thins, so "prefer the most-weakened reachable city" falls out of ratio-scaling on
current GameState alone.

**Sim outcome (deterministic 96-match battery, 25-round cap; CAP=40 identical):**

| metric                          | baseline | #462 (D-035) | #471     |
| ------------------------------- | -------- | ------------ | -------- |
| captures / 96                   | 3        | 13           | **77**   |
| repelled assaults               | 0        | 16           | 52       |
| repelled per capture            | —        | 1.23         | **0.68** |
| max same-city assaults          | 1        | 1            | **2**    |
| matches with a multi-wave siege | 0        | 0            | **27**   |

Conquest rose ~6× _and_ got more cost-effective (repelled/capture 1.23→0.68): the extra
captains spent convert into captures rather than feeding the turrets — not a captain-
hemorrhage. Tuned on a wide stable plateau (bonus 32-44 all give ~77/27); below it noisy,
above ~48 multi-wave decays. **Rejected**: applying the bonus to winnable cities too — that
made the AI beeline and trade cities in runaway churn (300+ captures), an unrelated lever.

**Judgment call for the operator.** 13→77 captures is a large AI-vs-AI conquest swing (games
now decide by conquest instead of stalemating). It's the single `siegeStickinessBonus` knob;
dial down toward 20 for a gentler lift if playtests find the map too swingy.

**Artifacts.** `packages/engine/src/ai.ts` (conquest scoring), `packages/content/src/tuning.ts`
(`siegeStickinessBonus`), `apps/web/src/conquestReachable.test.ts` (multi-wave assertion +
before/after table), `packages/engine/test/fixtures.ts`, ENGINE_VERSION regen. PR #474.

---

## D-035 — 2026-07-12 — #462 attrition warfare: AI values garrison-thinning assaults; %-of-base ship refits

**What shipped** (the operator's answer to D-034's residual bottleneck — "conquest is
possible by attacking multiple times in a row and winning a war of attrition"). Two
@aop/content + planner changes, no reducer/replay-semantics change:

1. **AI attrition planner** (`ai.ts` + `AI_TUNING`): the city-assault engage gate is no
   longer absolute. New `attritionMinRatio` (0.40, scaled by personality `engageMinRatioMult`)
   is a floor _below_ `engageMinRatio` (0.90): a landing party at ≥40% of the defenders'
   troops-only strength lands an assault it does not expect to win, because a _failed_ assault
   permanently thins the recruited garrison (militia/turrets are free and don't persist —
   reducer.ts:1142) and that damage carries between assaults (pools replenish every 5 rounds,
   #461). Attrition assaults score `attackScoreBase·ratio·attritionScoreMult` (mult 0.50), so
   a genuine win is always preferred and the score rises as the garrison thins (follow-ups
   score higher, for free). Below the floor the AI holds — the "don't feed captains to
   turrets for negligible damage" cost-effectiveness bound the operator asked for.

2. **Ship refits become percentage-of-base on ALL four tracks** (`ships.ts`, per operator
   mid-task clarification, superseding the "capacity track only" first cut): each upgrade
   level is +10%/+15%/+25% of that class's base stat (~+50% fully refitted regardless of
   class), pre-computed to whole `amount`s (round half-up, floored at +1 so no level is a
   no-op) so the flat-amount `upgradeShip` reducer stays untouched. Bases rebased: sloop
   25 / brig 50 / frigate 100 / galleon 200 (from 20/30/40/60). Floor bites the speed track:
   speed is now uniformly +1/+1/+1 on every hull (10-25% of speed 2-5 rounds/floors to 1) —
   brig speed L1, frigate speed L1+L2, galleon speed L1+L2 hit the round→0 floor specifically.

**Sim result (honest)**: deterministic 96-match full-content battery, 25-round cap.
Baseline (main/#461) 3 captures / 96 (3 assaults, 0 repelled). Capacity rebase _alone_ moves
it to 4/96 — barely. Adding attrition → **13/96 (4.3×)**, 29 assaults, 16 repelled: attrition
willingness is the driver, not the bigger holds. **Caveat**: same-city multi-wave sieges
stay rare (max 1 assault per (attacker,city) across all 96 matches even at 40 rounds) — the
AI seldom sails a _second_ loaded captain back to one target, so conquest rises via more
first-shots at beatable-ish cities rather than sustained sieges. That is an offensive-logistics
/ target-persistence limit, not a scoring bug; flagged as a follow-up. No-free-capture
(#435/#442) holds — the change is attacker-side eagerness only; defence (militia/turrets) is
untouched, and the #442 ship-exclusion test was retargeted (2 grunts vs 8, ratio 0.25) to keep
its invariant below the new attrition band. Lowering the floor to ~0.35 roughly doubles
conquest again but sheds noticeably more captains (less cost-effective); 0.40 is the bounded
choice, dialable in `AI_TUNING`.

**Determinism**: planner + content only. RULES_VERSION unchanged (4); ENGINE_VERSION
regenerated (`e4673cf7b451c3be` → `24eb9ecbc76ed60c`) for the content data change. Catalog
twins (apps/web + supabase _shared) derive ship stats generically from @aop/content, so both
pick up the new numbers with no edit; parity test green. **Artifacts**: PR for #462;
`conquestReachable.test.ts` extended to the 96-match before/after guard + an attrition-behavior
assertion (repelled-assault count > 0, impossible under the old absolute gate).

---

## D-034 — 2026-07-12 — #453 conquest levers implemented (RULES_VERSION→4); sim result: reachable but rare, follow-up #462

**What shipped** (implements the D-033 decision): two @aop/content levers —
`RECRUIT_REPLENISH_INTERVAL = 5` (city recruit pools top up every 5 rounds, not every round;
"every 5 turns" maps to a 5× slower per-round-wrap cadence, read by the reducer's turn-advance
from the frozen catalog, `?? 1` preserves old behaviour) and `SHIP_CLASSES.crewCapacity` ×5
(sloop 4→20 … galleon 12→60; the crewCapacity upgrade amounts ×5 too, 1/1/2→5/5/10). The
cadence changes the round counter's meaning for recruitment → replay-breaking → `RULES_VERSION`
3→4, ENGINE_VERSION regenerated, engine replay tests pin the cadence, `conquestReachable.test.ts`
guards it.

**Sim result (honest, tempers D-033's expectation)**: the levers move conquest from 0 →
_reachable but rare_ — 3 captures / 96 deterministic full-content matches, all by round ~17 in
the early window. Pushing the cadence harder (interval 10/20) does NOT help; the residual
bottleneck is the single-captain offensive-landing model + a still-unbounded garrison (peaks
~320), exactly the design work #453 enumerated. No-free-capture holds — militia/turrets
(#435/#442) stay effective. Tracked the gap as follow-up **#462** for the operator's scope
decision (garrison caps/upkeep or multi-captain assaults) — deliberately not added here
("no new mechanics").

**Artifacts**: PR #461 (implementation + tests); follow-up #462. D-033 is the decision; this
records the measured outcome.

---

## D-033 — 2026-07-12 — Conquest rework (#453): troop availability populates every 5 turns; ship troop capacity ×5

**Decision** (operator): make AI-vs-AI conquest reachable with two levers — city troop
availability replenishes every **5 turns** instead of every turn, and every ship's troop
capacity is **quintupled**. **Why**: #455's sim probes proved conquest was structurally
impossible in full-economy matches — per-turn garrison recruitment always outgrows
crew-capacity-capped landing forces, at any militia/turret tuning. **Rejected**: a hard
garrison cap and a new siege/attrition mechanic (larger scope; the operator chose the
two-lever economy change). **Artifacts**: #453; implementation ships with a RULES_VERSION
bump, replay tests, and sim validation that conquest occurs without trivializing the
#435/#455 city-defense calibration.

---

## D-032 — 2026-07-12 — City art v1 shipped: cutouts, harbor backdrop, citadel corner tower (amends D-031's fortification-art detail)

**Decision**: the city-art production line (#445–#447) closed out with operator sign-off.
Cutouts approved after one revision round (sawmill keeps its logs/trees; wallseg-citadel
split into a tower-free tileable strip + an extracted `citadel-tower` sprite). Backdrop:
candidate seed 2928388781 with water confined to a lower-left harbor pocket (sized to seat
the shipyard sprite) and a continuous sand shore band — `backdrop-final-v4` approved.
**Amendment to D-031**: ring corners use the extracted **citadel corner-tower** sprite
(`BuildingDef.cornerTowerSpriteUrl`), not the turret sprite as D-031 recorded; `turret.png`
shipped but is deliberately unwired (battle-board turrets are synthetic units with no
BuildingDef — wiring tactical-board turret art would extend #441). **Rejected**: AI
inpainting for coastline edits (reliably hallucinated buildings even with negative
prompts); PIL flood-fill + one light img2img blend pass (denoise ~0.3) is the working
recipe for backdrop surgery. **Artifacts**: PR #458 (assets + `BuildingDef.spriteUrl`
wiring + CityScene rendering with color-block fallback); #436/#445/#446/#447 closed; epic
#427 closed; WIP branch `art/city-assets-v1-wip` deleted after merge; generation
provenance preserved in the MANIFEST copied into `apps/web`; follow-up #459 (FactionFlag
bypasses the theme-override chain, pre-existing).

---

## D-031 — 2026-07-11 — Local SD art pipeline: MPS requires pinned torch 2.3.1; city-art v1 approved

**Decision**: The local AUTOMATIC1111 install runs MPS-accelerated ONLY with the torch build
it pins (2.3.1/0.18.1); the venv had drifted to torch 2.12.1, which makes MPS emit
corrupted output (smeared blobs → pure noise) while CPU stays correct — proven by same-seed
CPU-vs-MPS comparison. Downgraded the venv, restored MPS flags in `webui-user.sh` (with a
do-not-upgrade warning), and corrected `docs/AI-TOOLS-GUIDE.md`, whose "black/corrupted
images → upgrade PyTorch" advice is the likely origin of the breakage. Also corrected the
false beliefs that CPU generation takes hours (it's ~50s per 512² image; MPS ~12s) and that
several "DreamShaper can't do X" caveats from 2026-07-06 were model limits (some were MPS
corruption). A1111 v1.10.1 is the project's final release — migration to ComfyUI tracked as
#444, triggered by the next large art effort or a torch-pin failure.

**Also decided (operator, art session)**: city-view v1 asset set approved — 15 sprites +
5 flags, preserved with regen manifest on branch `art/city-assets-v1-wip`
(`docs/art/city-v1/`). Product calls made interactively: fortification tiers render as
tiled straight WALL SEGMENTS around the city (not standalone buildings), citadel ring gets
its towers from the turret sprite at corners; troop buildings must show tiny troops; flags
are period-authentic vectors (Jolly Roger bones-behind-skull, pre-1801 Union Jack, Cross of
Burgundy, Dutch tricolor, French royal fleurs-de-lis) — SVG sources are canonical, edit
those, never repaint PNGs. Production tracked in #445 (cutouts) → #446 (backdrop) → #447
(integration, closes #436).

**Rejected**: upgrading the webui instead of downgrading torch (no newer A1111 exists);
web-sourced art (licensing/style drift); SD-generated flags (muddy at small sizes).

---

## D-030 — 2026-07-11 — City rework Wave 1 shipped: tavern gates captains, militia+turrets, starting barracks, faction identity

**Decision**: Four gameplay foundations of epic #427 merged to main via audited PRs:
#437 (faction `primaryColor`/`flagSpriteUrl` in content, #428), #438 (every city starts
with townhall+barracks, #434), #440 (tavern building; `recruitCaptain` and rehire require
a tavern via a generic `unlocksCaptains` building flag mirroring `unlocksShipyard`; ransom
stays ungated; #433), #443 (automatic city militia — 5 per recruitable unit type at the
city's unlocked tiers — plus two stationary ranged turrets derived at battle time in
`cityDefenderTroops`, no new GameState fields, all tuning in `CITY_DEFENSE_TUNING`; #435).
Operator product calls: tavern REQUIRED for new captains (starting captain unaffected);
NEUTRAL cities field the full militia from a neutral roster (default pirate units, content
data); standing orders / boarding defence / captain skills consolidate into the tavern
modal in the future city view (#429). No city is a free capture anymore — AI conquest
aggression re-tune deferred to #442; AI tavern-priority tuning to #439; turret sprite
naming to #441.

**Why**: engine/content foundations land first so gameplay improves behind the existing
UI while the graphical city view (#429-#432) is built; battle-time derivation keeps saves
compatible and replay determinism intact (new `cityDefense.test.ts`, 15 tests, bit-exact
replay assertions).

**Rejected**: persisting militia in GameState (save-format churn for derivable data);
hardcoding 'tavern' in engine logic (used the content-flag pattern instead).

---

## D-029 — 2026-07-10 — Interactive defender seat: product decisions signed off (#410)

**Decision.** The operator reviewed the §10 interactive-defender design extension
(`docs/design/multiplayer-tactical-probe.md`, PR #416, #410) during the 2026-07-10 issue
sweep and signed off on all seven of its product decisions (verbatim: "Approve all"):

1. **Offline defender = standing orders with zero added latency.** A detectably-offline
   defender is auto-filled from their pre-declared standing orders / board doctrine / AI
   tail — the base design's non-interactive defender — and adds no wait to the attacker.
2. **Online defender gets a short per-round grace** (`round_deadline`, config; suggested
   30–45 s) bounding how long the attacker waits on the defender each round.
3. **One shared whole-battle deadline** (3–5 min, implementer default 5, or remaining
   attacker turn time, whichever is smaller — per D-028), the single hard cap across both
   seats. Not two separate chess clocks.
4. **Both seats pick each round blind** — simultaneity as an anti-cheat property: neither
   seat learns the other's round-N tactic until both are bound.
5. **No peek-and-retract for either seat** — each submitted round-N order is irrevocable,
   closing the cross-seat retraction oracle.
6. **Asymmetric force-resolution.** On force-resolve each seat keeps its recorded prefix
   and fills only the tail from its own fallback: attacker = cyclic wrap of the recorded
   naval plan (`tacticPlanDriver`, per D-028); defender = standing orders → board doctrine
   → AI. Both follow "prefix counts, fallback finishes the tail," with a per-seat driver.
7. **Online defender gains real-time under-attack awareness**, bounded to engaged ships
   only (no leak beyond the symmetric `PlayerView` / decision-context the seat already has).

**Why.** Locks the async-pacing fallbacks that D-028 deferred to #410, so the #407 (schema)
/ #408 (API) / #409 (client) follow-ups have a settled two-seat contract to build against
and cannot merge a single-seat-only shape.

**Rejected.** Separate per-seat clocks (over-engineered for async play); a
defender-visible view of the attacker's current-round picks (breaks simultaneity /
anti-cheat); treating the per-round defender grace as blocking for offline defenders (it is
skipped / 0 when the defender is detectably offline).

**Related.** #410, PR #416, D-028; `docs/design/multiplayer-tactical-probe.md` §10.

---

## D-028 — 2026-07-10 — Battle sessions design approved (#321): 3–5 min deadline, cyclic forced finish, interactive defender

**Decision.** The operator reviewed the binding-battle-sessions proposal
(`docs/design/multiplayer-tactical-probe.md`, PR #329) during the 2026-07-10 issue sweep
and approved it with three answers to its §9 open questions:

- **Session deadline: 3–5 minutes** (tighter than the doc's 10-minute proposal) or
  remaining turn time, whichever is smaller — stored as config, implementer default 5 min.
- **Forced completion keeps the cyclic wrap**: a truncated naval plan repeats its recorded
  orders via the existing `tacticPlanDriver` behavior — zero engine change. The optional
  plan-then-AI flag (§4.2) was rejected.
- **The defender IS interactive** — an operator override of the doc's single-interactive-
  seat recommendation. The session model must grow a second seat's cursor before the
  schema/edge-function steps land; async-pacing fallbacks (offline defender → standing
  orders) get designed in #410.

**Execution split.** Step 1 of the §8 plan (engine probe extraction, ungated) runs in the
sweep as `feature/sweep-mp-probe-321`. Steps 2–4 were filed as follow-ups carrying these
decisions: #407 (schema, supervised migration), #408 (edge functions), #409 (client
wiring), plus #410 (interactive-defender design extension, which #407–#409 must not
contradict).

**Rejected.** 10-minute session deadline (opponent wait too long for async pacing);
AI-takeover forced finish (unneeded engine/replay-surface change); defender-as-AI-only
(operator wants both seats interactive).

---

## D-027 — 2026-07-07 — Naval navigation UX batch: seven ready-to-execute issue designs (#370–#376)

**Decision.** The operator reported that naval navigation is hard to understand and
requested six improvements; per the request, they were filed as ready-to-execute designs
(model-labeled per the triage rubric) rather than implemented this session:

- **#371 (P1, opus)** — movement-range shading on ship selection (green empty/ally, red
  enemy, yellow neutral). Adds the engine's first `reachableTiles` helper (BFS, topology-
  aware, deterministic ordering) — the opus trigger.
- **#375 (P1, sonnet)** — dotted course preview with arrowhead; dot colors split the
  this-turn leg from later-turn legs, ring dots at turn boundaries; defines the two-tap
  preview→confirm pattern for touch.
- **#376 (P1, sonnet)** — target ships/cities/encounters from any distance: client composes
  approach `moveCaptain` + attack when affordable this turn, otherwise sets an intercept
  course via #372. Engine adjacency validation unchanged (stays the authority).
- **#372 (P1, opus)** — engine multi-turn sail orders: `sailOrder` field on `Captain`,
  `setSailOrder`/`clearSailOrder` actions, auto-continuation inside `advanceTurn`, pausing
  when contacts not in the order's `knownContactIds` snapshot become visible (covers both
  "they sailed into view" and "our other units revealed them").
- **#373 (P2, sonnet)** — multi-city ownership audit: AI `planRecruitCaptain` first-city
  bug (`ai.ts:489`), owned-city roster strip in the HUD, income/upkeep/vision multi-city
  tests. Settler-founded cities explicitly out of scope (no `foundCity` action exists).
- **#374 (P2, opus)** — decisive naval win spawns the loser's hull as a prize: new level-1
  prize captain with the captured ship class/upgrades and zero troops; ransomed captains
  return on a starter hull (new content field).
- **#370 (P1, sonnet, bug)** — found during exploration: client adjacency gates use
  `chebyshevDistance` while the engine validates with hex-aware `mapDistance`, so on hex
  maps the client offers targets the engine rejects — likely part of the operator's
  "can only target when right next to it" complaint. Ship this small fix first.

**Embedded product defaults (flagged in-issue; operator can veto):** no auto-attack when a
sail order reaches its intercept target (halt adjacent, player confirms); prize ships join
empty-crewed as the built-in anti-snowball lever (given the #308 rush history); failed city
assaults award no prize; allied contacts don't pause sail orders.

**Sequencing.** #370 → #371 + #372 (engine foundations) → #375 + #376 (build on both);
#373 and #374 are independent.

**Rejected.** Implementing directly this session (operator asked for issues); placing the
approach-path helper in the engine now (kept client-side so #376 stays sonnet-tier;
revisit if #372's intercept work grows an equivalent engine helper).

---

## D-026 — 2026-07-07 — Quality triage: six operator-reported issues investigated, decisions made, tracked as #342–#348

**Decision.** The operator reported six quality problems (blocky map, no way to attack a
city/win, no visible combat tactics, lost title music, unsignposted navigation, parchment
palette stopping at the menu). Investigated all six in parallel, made the product calls
with the operator, and — per operator direction — filed tracked issues instead of
implementing this session:

- **Map visuals (#347, P1):** polish the square-grid rendering now (coastline autotiling,
  tile variety, gradient fog, crisper scaling). Hex conversion deliberately deferred to an
  evaluation issue (#348, P3) — the blockiness is a rendering problem, not a grid-shape
  problem, and hex is a deep engine change (adjacency/pathfinding/AI/replay contract).
- **Navigation (#346, P1):** minimap with viewport rect + click-to-jump, zoom buttons,
  center-on-fleet, and a turn-event feed. Rejected native scrollbars — impossible on the
  Pixi world-transform camera — and rejected scrollbar-style gutters as inferior to a
  minimap for a 2-D map.
- **Combat tactics (#343, P1):** the tactical system is fully built (naval rounds + hex
  boarding, #18/#39/#93/#305) but hidden behind `battleResolution` defaulting to `'auto'`
  (`packages/content/src/tuning.ts`). Decision: default new single-player games to
  `'tactical'`; Auto stays selectable. Multiplayer tactical remains #321.
- **City assault (#344, P0):** confirmed no attack-city action exists, making conquest
  victory unreachable (resign is the only game end). Scoped to plug into
  `resolveBoardCombat`'s existing land-combat entry point with `city.garrison` as
  defenders; ownership flips on a win; AI gets basic assault usage.
- **Title music (#342, P1):** root cause is the #302 title splash auto-advancing with no
  user gesture + `audioManager` swallowing the browser autoplay rejection. Fix scoped:
  title plays the menu theme, advances on tap too, and a one-time gesture listener retries
  playback.
- **Palette (#345, P2):** parchment goes to **UI chrome only**; world-map sea and battle
  board keep their diegetic colors (resolves D-023's open boundary question). The two gold
  tokens (`--color-gold #c9a227` vs `--accent #c8962c`) unify to the parchment gold —
  resolves the #319 two-gold question.

**Also this session.** PR #340 (D-025's vendoring fix) was red because CI never generates
the gitignored `_vendor/`; with explicit operator approval (supervised path), added the
vendor-script step to `ci.yml`'s edge-functions job and `deploy.yml`, fixed the stale
functions README, ran the pre-pr-reviewer audit (0 blockers), and squash-merged (`4f65ab1`).
Operator also granted blanket permission this session to install skills/dependencies as
needed for this work (none ended up required).

**Rejected.** Implementing all six fixes as five feature PRs this session (operator chose
issues-only); hex-now (see #348); scrollbar gutters (see above); keeping Auto as the
combat default.

---

## D-025 — 2026-07-07 — First real prod deploy attempt: DB live, edge functions vendor edge functions' `@aop/*` deps, blocked by local colima bug

**Decision.** First-ever deploy attempt against the real prod Supabase project
(`udsuxdoavlvosvbjwmud`). Pushed all 23 migrations — DB now has its full schema (was
completely empty; the project had existed but nothing had ever been deployed to it).

**Bug found and fixed (#339, PR #340).** `supabase/functions/deno.json` mapped
`@aop/shared`/`@aop/engine`/`@aop/content` to `../../packages/*/src`, outside
`supabase/functions/`. `supabase functions deploy`'s bundler (Docker- or API-based) can
only see files under `supabase/functions/`, so every function deploy failed on "module not
found" — never caught before because deploy had never been run for real; local `supabase
start` masked it since those containers mount the whole repo. Fix: `scripts/
vendor-function-deps.mjs` copies the three packages into a gitignored `supabase/functions/
_vendor/` and rewrites their extensionless relative imports to add `.ts` (Deno requires
explicit extensions; the rest of the repo uses bundler-style resolution). `deno.json` now
points at the vendored copies. Confirmed via `--debug`: full `@aop/*` module graph now
resolves cleanly.

**Second bug found, not fixed (#341).** Even with the above fix, `supabase functions
deploy` still fails locally — for any function, including an empty one with zero imports —
with an opaque `Effect.tryPromise` error right after "Building vfs". Ruled out: bundle
size (swapped `@sentry/deno` for a zero-dep stub, same failure), Docker daemon health
(colima's dockerd logs show the bundler container running and exiting cleanly), colima
resources (bumped to 4 CPU/8GB, no change), stale CLI (same on both v2.102.0 and the
pinned v2.109.0). Looks like a CLI/colima Docker incompatibility, not a code issue.

**Why stopped here.** Operator chose to stop for the day rather than set up the
`deploy.yml` GitHub Actions path (which runs on real Ubuntu Docker and likely sidesteps the
colima issue) — that path needs minting a new `VERCEL_TOKEN` and provisioning the
`production` environment's 6 secrets, an operator-facing step. PR #340 (vendoring fix) is
open, `pnpm verify` green, not yet merged. #341 tracks the remaining local-deploy blocker.

**State the prod project is in right now.** DB fully migrated and live. 0 edge functions
deployed. Vercel web deploy not attempted (deploying the client against a functionless
backend would ship a broken app) — Vercel CLI is authenticated and the `age-of-plunder`
project exists, just not yet linked from `apps/web`.

---

## D-024 — 2026-07-06 — Issue sweep (14 issues) + title emblem sourced CC0, not AI-generated

**Decision.** Ran a full `/issue-sweep`: triaged the open backlog, executed 14 issues
across 8 PRs (#313 #314 #315 #316 #318 #319 #323 #324 #325 #327), all squash-merged into
`main` with the `pre-pr-reviewer` audit + green `ci`. Closed: #295 #296 #297 #298 #299
#300 #301 #303 #304 #305 #306 #308 #309 #311.

**#311 emblem — what shipped and why.** The interim hand-drawn `SkullEmblem` (from #316,
an over-eager first pass) was replaced. We first tried the documented local Stable
Diffusion pipeline (AUTOMATIC1111 + DreamShaper_8, `docs/AI-TOOLS-GUIDE.md`): three passes
on GPU/MPS could not meet the brief — DreamShaper would not render crossbones behind the
skull and biased strongly yellow, so the outputs were rejected (consistent with the
DreamShaper failure notes already in `uiIcons.ts`). Instead sourced **"Jolly Roger 2"**
from Wikimedia Commons / Open Clip Art Library (**CC0 1.0**, no attribution required),
recoloured to the Weathered Parchment tokens and cropped/centred. **Shipped as a static
asset** (`apps/web/public/art/ui/skull-emblem.svg` + `<img>`), NOT inline, because the
~113 KB vector path inlined into the JS bundle blew the #253 asset-size budget (923 KB raw
vs 850 KB). Parchment texture stayed the existing CSS gradient (operator decision — did
not regenerate).

**Why (rejected alternatives).** AI-generated skull rejected on quality; inline SVG
rejected on bundle budget; paid/attribution-required art avoided in favour of CC0.

**Open tech-debt from the sweep (operator calls).**

- **#319 palette split:** the design-token migration introduced `--color-gold #c9a227`
  (HUD chrome) which now coexists with D-023's `--accent #c8962c` (Weathered Parchment) —
  two "gold" tokens live at once. D-023 flagged this as an operator decision when #301 was
  swept; still unresolved.
- Bundle is at ~846 KB raw / ~250 KB gzip — thin headroom under the 850/260 budget.
- #293 (multiplayer boarding race) closed-as-skipped: the buggy code only ever existed on
  unmerged PR #294; left OPEN with an explanatory comment rather than auto-closed.
- Follow-ups filed: #320 (spectate battle playback), #321 (multiplayer tactical authority),
  #322 (first-contact tuning), #326 (recruit/ransom captain UI).

**Excluded (not swept).** #307 (OAuth — now scoped to Google + Microsoft/Azure AD per the
ATC pattern, GitHub dropped; supervised, left open). Native-mobile issues #98 #100 #156
#159 #160 #161 and epics #2–#5 relabeled/held as `needs-human-fix`.

---

# MEMORY.md — Age of Plunder Decision Log

## D-023 — 2026-07-06 — Visual theme: "Weathered Parchment & Rope" is the canonical app palette

**Decision**: The operator delivered a Claude Design handoff for the launch experience
(`docs/design_handoff_start_screen/`, README is the spec, HTML prototype is the fidelity
reference) and chose direction **1a "Weathered Parchment & Rope"** — warm tan/brown
parchment, gold accent `#c8962c`, rust accent `#7a2e1a`, Pirata One display font, Cabin
body font. PR #310 shipped it: a new title splash (skull emblem, engraved title, loading
bar, ~3.2s auto-advance) and a restructured main menu (New Game primary; Quick Match +
Map Editor row; seven secondary actions behind a "More Options" toggle), closing #302.
The palette lives as `:root` CSS custom properties in `apps/web/src/styles.css` and is
the **single source of truth for the app-wide theme migration tracked in #301** — new UI
work should consume the tokens, not add hex values.

**Why**: first-impression gap (#302) + no design tokens (#301); the handoff resolves both
the direction and the token values in one operator-approved artifact.

**Rejected**: directions 1b "Dark Stormy Sea" (teal/navy) and 1c "Blood & Gold"
(dark red/gold) — kept in the prototype HTML as a record only. Also rejected: reformatting
the handoff files (added to `.prettierignore` so the reference stays verbatim), and the
prototype's "Replay intro" affordance (README marks it optional; no current use case).

**Open boundary question** (flagged in #301): whether the world-map sea palette
(`MapCanvas.tsx`) and battle board (`battleBoardSvg.tsx`) count as diegetic art (keep
their own colors) or UI chrome (migrate to tokens) — operator call when #301 is swept.

**Follow-ups**: #311 (Stable Diffusion-generated skull illustration + real parchment
texture, operator approved the SD approach; contact-sheet curation gate per D-016),
#296 comment (Account moved behind "More Options", making its sign-in fix more urgent).

Related: PR #310, #301, #302, #311, `docs/design_handoff_start_screen/`, fonts
self-hosted in `apps/web/public/fonts/` (OFL).

---

## D-022 — 2026-07-05 — Match size capped at 5 (faction-pool bound), amending D-006's 2–8 range

**Decision**: Maximum players per match is now `MAX_MATCH_PLAYERS = FACTION_IDS.length`
(5), enforced in `parseSettings` (create-match), the `matchmaking_queue.match_size` DB
constraint (2..5), and the Quick Match UI. This amends D-006's "2–8 players" — with
factions unique per match and exactly 5 factions, every 6–8 player lobby or queue bucket
was unfillable by construction (the 6th joiner always failed on faction exhaustion), and
6–8 player quick-match groups crashed the drain and stranded queued players (#219).

**Why this branch**: #219 offered two fixes — cap at the faction pool, or allow duplicate
factions (a product decision). The approved issue-sweep Batch 2 plan selected the cap.
6–8 player matches remain possible in the future by either adding factions to
`@aop/content`/`FACTION_IDS` (the cap follows the pool automatically) or deciding to
allow duplicate factions; either path should revisit this entry. D-006's AI-takeover
requirement is unaffected (it applies to any multi-human match and is shipped, #133/#134).

**Rejected**: allowing duplicate factions silently — visual/identity collisions and
balance questions deserve an explicit product call, not a sweep-batch side effect.

**Note**: originally authored for PR AoP#262, whose squash-merge stranded it (AoP#280);
relanded via PR AoP#289.

Related: AoP#219, PR AoP#289, `packages/shared/src/index.ts` (`MAX_MATCH_PLAYERS`),
`supabase/migrations/20260707091000_matchmaking_match_size_cap.sql`.

---

## D-021 — 2026-07-05 — Audio: local music generation (MusicGen) + procedural SFX, wired into gameplay

**Decision**: Stood up local background-music generation via MusicGen
(`facebook/musicgen-small`, `transformers`, MPS/CPU on Apple Silicon — no CUDA) and
generated 3 looping tracks (menu, exploration ambient, battle), each a self-crossfaced
28s loop (`loop_crossfade()` blends the generated tail into the head so playback with
`audio.loop = true` has no audible seam regardless of the raw generation's start/end).
Batching all 3 prompts into a single `model.generate()` call cut wall-clock time roughly
3x over sequential generation (~8 min total for all 3 vs. an estimated ~21 min
sequential) — token-by-token decoding parallelizes across the batch dimension. For the 5
generic gameplay SFX (UI click, combat hit, ship movement, coin pickup, notification
chime), used procedural synthesis (numpy/scipy sine tones + filtered noise + envelopes)
instead of a generative model — short, pitch-precise UI blips are cheap to synthesize
directly and don't benefit from a heavier text-to-audio model. Wired both into the client:
`apps/web/src/audio/audioManager.ts` gained a third `AudioCategory` axis
(`dialogue`/`music`/`sfx`) with independent persisted volumes (`useAudioSettings.ts`
exposes `setMusicVolume`/`setSfxVolume` alongside the original `setVolume`/`setMuted`);
`selectGameplayMusicContext()` (`musicClips.ts`) is the pure, tested logic picking
exploration-vs-battle music from whether a battle report or boarding-melee sheet is open;
`feedback.ts` pairs each existing haptic category (`hapticTap`/`hapticImpact`/
`hapticNotify`) with its matching SFX clip at every call site that already had a haptic
(City/Saves/End Turn/Resign/Attack/Encounter-resolve/boarding-order-confirm/sheet-dismiss),
plus new ship-movement and coin-pickup triggers on captain move and gold-rewarding
encounter outcomes.

**Why**: the operator's task explicitly asked to try local generation for this content
category (no music/SFX generation existed at all before this), following the same
"try it, curate carefully, fall back if quality isn't there" precedent as D-016/D-018.
Generation quality was verified numerically (RMS/peak checks confirming non-silent,
non-clipping output; valid 16-bit PCM WAV) rather than by ear — this session cannot
listen to audio — so an actual listen-through by the operator before/after merge is the
outstanding step, same spirit as any AI-generated asset in this pipeline.

**Rejected**: AudioLDM/AudioLDM2/Stable Audio Open for the SFX category (heavier
dependency, worse fit for short pitch-precise blips, no clear advantage over direct
synthesis); reusing `hapticTap`/`hapticImpact` calls as a dumping ground for a single
generic "click" without categorizing volumes separately (the operator's brief was
explicit that music/SFX/dialogue are now distinct enough to need independent sliders).
Longer (90s) loop targets were also rejected after measuring generation time scaling
poorly with sequence length on this hardware — 28-35s was the practical ceiling for a
"a few minutes, not tens of minutes" per-batch budget.

---

Newest entries on top. Append-only: never edit or delete prior entries (PreToolUse hook
enforces this). Header format: `## D-<NNN> — <YYYY-MM-DD> — <title>`. When adding an entry,
also prepend its one-liner to `MEMORY-INDEX.md`.

## D-020 — 2026-07-05 — Art (#108 retry): shipped `deep`/`port` map tiles, closing the gap

**Decision**: `deep` and `port` map tiles had failed generation twice (per #108: repeating
decorative-pattern drift and a baked-in watermark on sd-v1.5) and were left on the
flat-color `Graphics` fallback with an explicit "stop trying" recommendation. Re-diagnosed
rather than repeating the same approach:

- **`port`**: a clean, unwatermarked wood-plank tile already existed on disk from the prior
  session's second attempt (`~/aop-ai-tools/sd-game-art/tiles/port.png`) but was never
  shipped — the prior session left it as an unresolved "style call" (plank pattern vs. a
  flatter redo) and the session ended before a decision was made. Rendered it tiled 3x3 at
  full res and at actual 32px game scale: no seams, no watermark, planks are on-theme for a
  dock. Shipped as-is.
- **`deep`**: root-caused the repeating-motif failure to the checkpoint, not the prompt —
  all 3 prior attempts used sd-v1.5, which (per this session's and #89/D-016's own
  DreamShaper-comparison finding) has a specific bad association with "dark navy blue flat
  pattern" prompts. Switched to the DreamShaper 8 checkpoint, which D-016 already
  established as unsuitable for tiles in its _default_ framing (it drew an app-icon/badge
  composition for a `shallows` comparison prompt) — but that specific failure was traced to
  the "product shot on plain white studio background, isolated single object" phrase in the
  shared `STYLE_SUFFIX`, which reads as icon-composition instruction to this checkpoint.
  Dropped that phrase for tiles specifically (replaced with explicit full-bleed/edge-to-edge
  framing) and regenerated: seed 42 came back clean — flat navy with a subtle wave-line, no
  motif, no watermark. Two other seeds (7, 99) regressed back to the icon-composition
  problem (a circle and a bordered oval), confirming the checkpoint's icon bias is real and
  seed-sensitive, not fully eliminated by the prompt change. Kept seed 42 and retouched one
  small (~40px) corner color blemish by cloning a matching patch from the opposite corner
  (feathered blend) — invisible at both full res and actual 32px tile-render scale.

**Also tried and explicitly rejected**: the AUTOMATIC1111 API's `tiling: true` seamless-mode
flag (untried by any prior attempt) — on this CPU-only local WebUI instance
(`--use-cpu all`), it was dramatically slower (a single 512x512/28-step image did not
complete within a 300s timeout) with no clear quality benefit over plain generation, so
abandoned in favor of plain generation plus the checkpoint/prompt fix above.

**Wiring**: `apps/web/public/art/tiles/{deep,port}.png` added; `TILE_SPRITE_URL` in
`MapCanvas.tsx` now covers all four tile types (`TILE_COLOR` stays as the generic
missing-art fallback). Updated the stale comment that said only shallows/land had art.

**Verified**: `pnpm verify` green (format, typecheck, tests, build). Manually rendered both
new tiles at 3x3 full-res tiling and at real 32px game scale before accepting either.

Closes #108. Related: #26, #76, #89, #115, D-016.

---

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
