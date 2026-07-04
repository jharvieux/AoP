# Edge Functions

Server-authoritative multiplayer per [`docs/MULTIPLAYER.md`](../../docs/MULTIPLAYER.md) §5.
Each function runs the **same `@aop/engine` reducer the client runs** (§2), against state
reconstructed from the action log, under Deno. The engine is dependency-free and touches no
DOM/Node/Deno API, so it runs here unmodified.

| Function          | Contract (§5)                                                   | Issue |
| ----------------- | --------------------------------------------------------------- | ----- |
| `create-match`    | `POST { settings } -> { matchId, inviteCode }`                  | #32   |
| `join-match`      | `POST { inviteCode \| matchId, faction? } -> { matchId, seat }` | #32   |
| `start-match`     | `POST { matchId } -> { seq: 0 }` (creator only)                 | #32   |
| `submit-action`   | `POST { matchId, expectedSeq, action } -> { seq, view }`        | #33   |
| `end-turn`        | `POST { matchId } -> { seq, view }`                             | #33   |
| `get-player-view` | `POST { matchId } -> { seq, seat, view, turnDeadline }`         | #34   |

Shared code lives in `_shared/`: `http.ts` (CORS + the `{ error: { code, message } }`
envelope), `client.ts` (service-role client + JWT→uid), `catalog.ts` (the server-side
`ContentCatalog`/`GameConfig` builder, twin of `apps/web/src/catalog.ts`), and `match.ts`
(state reconstruction, the `submit-action` transaction, settings/faction validation).

## Design invariants

- **Seat identity, not user id, is the engine player id** (`seat-0`, `seat-1`, …; §13).
  This is what lets AI takeover and seat reclaim happen without rewriting the action log.
- **The caller's seat is derived from their JWT, never the request body** (§5). Every
  action's `playerId` is overwritten from it, so a forged `playerId` is inert (§11).
- **Clients never receive a `GameState`.** `get-player-view` (and the view returned by
  `submit-action`) run `playerView(state, seat)` — the fog filter that strips `rngState`,
  the seed, and all hidden entities. This is the anti-cheat boundary (#34).
- **Concurrency** rests on three layers (§11): the `expectedSeq` check, the `(match_id,
seq)` primary key rejecting a duplicate append, and the `action_count` guard on the
  matches UPDATE. A loser on any of them gets `SEQ_CONFLICT` and refetches its view.

## Deploy & run

Requires a provisioned Supabase project (an **operator action** — see
[`../README.md`](../README.md) § Environments). Functions resolve `@aop/*` via the import
map in `deno.json`, which points at the workspace TypeScript sources.

```bash
supabase functions deploy   # deploys every function in this directory
```

Injected at runtime by the platform: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. Optional: `ENGINE_VERSION` (pinned into new matches; defaults
to the value in `_shared/match.ts`).

> Note: local invocation and CI coverage are gated on a running Supabase stack; the pure
> reconstruction + view-filter logic these functions call is covered by the engine's Vitest
> suite (`packages/engine/test/playerView.test.ts` and the replay tests).
