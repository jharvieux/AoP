# Age of Plunder — Architecture & High-Level Plan

_Pirate-themed strategy game loosely based on Heroes of Might and Magic._

## 1. Game summary

- **World map**: island-and-sea map explored by **captains** (the hero analog), each with a
  flagship, a skill tree, and troops aboard.
- **Cities** replace castles: build structures, recruit troops, generate resources (gold,
  timber, iron, rum, etc.).
- **Four factions** with distinct troop rosters: Pirates, British, Spanish, Dutch.
- **Combat**: ship-vs-ship and city assault. Outcome driven by ship strength (hull, cannons,
  upgrades), captain skills, and troop composition. **Hybrid model**: combat resolves in
  rounds, and each round the player picks a tactic (broadside, board, ram, flee, …) that
  shifts the odds — auto-resolve stays available for lopsided fights. A landed boarding
  action sends both crews to the full HoMM-style **tactical battle board** (#39): a hex
  grid with initiative order, terrain, retaliation, and flanking, where the melee decides
  the battle.
- **Random encounters**: merchants (trade), natives (trade/fight/quest), settlers
  (recruit/escort/raid).
- **Multiplayer**: match-based, asynchronous turns (a match may span days; players are
  notified when it's their turn). Alliances between players are allowed. AI players can fill
  any seat.

## 2. Core architectural decision: a deterministic engine package

Everything hinges on one rule: **all game logic lives in a pure, deterministic TypeScript
engine with zero I/O**. Given `(state, action, rngSeed)` it produces the next state — same
result on any machine.

This single package powers:

| Mode                 | How the engine runs                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Single-player vs AI  | Entirely in the browser                                                                                                          |
| Async multiplayer    | Server-side (Supabase Edge Function) as the authority; client runs the same engine for instant optimistic UI and combat previews |
| Replays / spectating | Re-run the action log from turn 1                                                                                                |
| Anti-cheat           | Server re-validates every submitted action; illegal actions are rejected                                                         |

Game state is **event-sourced**: the database stores an append-only action log plus periodic
snapshots. RNG is seeded per match so combat rolls and encounter spawns replay identically.

## 3. Repo layout (pnpm monorepo)

```
/packages
  engine/      # pure game logic: state, actions, reducers, combat, pathfinding, AI
  content/     # data-driven game content: factions, units, ships, buildings,
               # skill trees, encounter tables (typed JSON/TS, no logic)
  shared/      # types + zod schemas for actions/state, shared utils
/apps
  web/         # React + Vite + PixiJS client
/supabase
  migrations/  # Postgres schema
  functions/   # Edge Functions: submit-action, advance-turn, ai-turn, get-player-view
```

## 4. Client (apps/web)

- **React + Vite + TypeScript**. PWA from the start (installable, offline single-player).
- **PixiJS** canvas for the world map and battle report animations — WebGL, fast on mobile.
  UI chrome (city screens, skill trees, menus) is plain React DOM layered over the canvas;
  far faster to iterate than in-canvas UI and naturally responsive.
- Mobile-first layout: touch pan/zoom on the map, bottom-sheet panels, 44px touch targets.
- State: Zustand (or similar light store) wrapping the engine state + UI state.
- **Native ports later via Capacitor** — wraps the same web app; push notifications become
  native notifications. No rewrite.

## 5. Server (Supabase)

_Full multiplayer spec — schema, RLS, edge function contracts, threat model — lives in
[MULTIPLAYER.md](MULTIPLAYER.md)._

- **Auth**: Supabase Auth (email + OAuth). Guest play for single-player.
- **Postgres** (row-level security on everything):
  - `profiles` — user data
  - `matches` — settings, map seed, RNG seed, status, current turn/player
  - `match_players` — seat, faction, user or AI, alliance id
  - `match_actions` — append-only action log (`match_id, seq, player, action jsonb`)
  - `match_snapshots` — periodic full-state snapshots for fast loads
- **Edge Functions** (run the engine server-side):
  - `submit-action` — validate + apply a player action, append to log
  - `end-turn` — advance turn order, trigger notifications, run AI seats
  - `get-player-view` — return state filtered by **fog of war** (clients never receive the
    full state in multiplayer; this is the anti-cheat boundary)
- **Realtime**: Supabase Realtime channels push "it's your turn" / "match updated" to online
  clients; email (and later native push) for offline players. Turn timers with auto-skip so
  one absent player can't freeze a match.
- **Hosting**: web app on Vercel; DB/functions on Supabase.

## 6. Combat model (hybrid)

Deterministic multi-round resolution with player-chosen tactics each round:

1. Compute effective fleet strength: ship class + upgrades (hull, cannons, sails, crew
   capacity) × captain skill modifiers (gunnery, boarding, navigation…) × troop stats.
2. Each round, the player picks a **tactic** (broadside, board, ram, evade/flee, …); some
   tactics unlock via captain skills or ship upgrades. The round resolves with seeded RNG,
   tactic vs tactic (light rock-paper-scissors on top of raw strength).
3. Pre-battle **odds preview** and an **auto-resolve** button (engine picks tactics) for
   lopsided fights — both run the same engine code.
4. City assaults add fortification tiers and garrison; same pipeline.

**Async-multiplayer wrinkle**: the defender is usually offline when attacked. Solution:
defenders set **standing orders** (default stance/tactic priorities per fleet and city, e.g.
"evade if outgunned, else broadside"); the attacker plays their rounds interactively against
the defender's orders. This is the same mechanism the AI uses, so it comes nearly free.

Because all combat flows through one engine function, the tactical battle board (#39)
replaced the troop-combat resolver without touching networking or persistence: a landed
grapple halts the gunnery and the crews fight it out on a hex board (initiative by unit
speed, terrain movement costs and cover, one retaliation per round, flanking). The same
three-driver pattern carries over — the attacker's recorded board commands ride the
attack action, offline defenders fight by saved board doctrine, and the AI drives
auto-resolve. Board combat is enabled by the battle tuning in a match's frozen stats
snapshot, so pre-existing saves and logs replay unchanged. City assaults will reuse the
same board via its land-combat entry point.

## 7. AI

- AI players implement the same interface as humans: read visible state → emit actions.
- Start with a utility-scoring AI (weighted goals: expand, build, raid, defend) — good
  enough for a v1 opponent and cheap to run in an Edge Function or in-browser.
- Encounter entities (merchants, natives, settlers) are simpler scripted behaviors, spawned
  from `content/` encounter tables by the map generator.

## 8. Phased plan

**Phase 0 — Foundation (repo scaffolding)**
Monorepo, TypeScript strict, Vitest, CI, engine skeleton with the state/action/reducer
pattern and seeded RNG. Golden-master replay tests from day one.

**Phase 1 — Core loop, single-player (the "is this fun?" milestone)**
Hex/tile world map generation, one faction, captain movement + pathfinding, resource
economy, city building, troop recruitment, turn loop, basic auto-resolve combat, dumb AI
opponent, placeholder art. Playable in the browser end-to-end.

**Phase 2 — Content & depth**
All four faction rosters, ship classes + upgrade trees, captain skill trees, random
encounters (merchants/natives/settlers), improved combat model with odds preview and battle
reports, smarter AI, real art pass, mobile UX polish.

**Phase 3 — Multiplayer**
Supabase auth, match creation/lobby, server-authoritative action submission, fog-of-war
filtered views, async turn notifications + turn timers, alliances (shared vision,
non-aggression, chat), reconnect/resume, replays.

**Phase 4 — Polish & expansion**
Tactical battle board for troop/land combat (engine + playback shipped in #39; interactive
battle UI tracked in #93), matchmaking/rankings, more maps + a map editor, Capacitor
native builds with push notifications.

## 9. Accounts, ads & monetization

- Single-player is playable as a **guest** with local saves; an account (email/OAuth via
  Supabase Auth) is required for multiplayer and for the remove-ads purchase to persist.
- **Ads with a paid "remove ads" option**: web uses an ad network slot; native builds use
  AdMob via Capacitor. Ad placements are non-intrusive by design (e.g. between turns / on
  the match-end screen), never mid-combat.
- Implementation is deferred past MVP, but designed for now: an `entitlements` table keyed
  by user (`remove_ads`, purchasable later via Stripe on web / IAP on native), and a single
  `<AdSlot>` component in the UI layer that renders nothing when the entitlement is present
  — so ad integration later touches one component, not every screen.

## 10. Open questions

- Simultaneous-turn variant later? (Engine's action-log design permits it.)
- Which ad network for web (native is AdMob by default).

## 11. Decisions log

Moved to [/MEMORY.md](../MEMORY.md) (append-only decision log, D-NNN entries; index in
[/MEMORY-INDEX.md](../MEMORY-INDEX.md)). The founding decisions are D-001 through D-008.
