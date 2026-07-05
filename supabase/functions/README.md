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

Maintenance (not player-facing — gated by a shared secret, never a user JWT):

| Function            | Contract                                                                      | Issue |
| ------------------- | ----------------------------------------------------------------------------- | ----- |
| `compact-snapshots` | `POST { matchId?, roundsPerSnapshot? } -> { matchesProcessed, totalDeleted }` | #37   |

`compact-snapshots` (§10) trims each active match's `match_snapshots` history to the keep-set
— snapshot 0, the two newest, and one per N rounds — leaving the action log intact so
`reconstructState` output is byte-identical before and after. It reads each snapshot's round
from `state->'round'` (no schema column), and serializes against `submit-action` with a
per-match seq guard (deletes are scoped to `seq <= action_count` read at the start, so a
concurrently-written newer snapshot is never touched). Requires `Authorization: Bearer
<CRON_SECRET>`; fails closed if `CRON_SECRET` is unset. Cron scheduling is out of scope (#37).

Shared code lives in `_shared/`: `http.ts` (CORS + the `{ error: { code, message } }`
envelope), `client.ts` (service-role client + JWT→uid), `catalog.ts` (the server-side
`ContentCatalog`/`GameConfig` builder, twin of `apps/web/src/catalog.ts`), `match.ts`
(state reconstruction, the `submit-action` transaction, settings/faction validation), and
`compaction.ts` (the snapshot keep-set I/O; the pure policy lives in `@aop/shared`).

## Monetization (docs/ARCHITECTURE.md §9)

Unrelated to the multiplayer engine pipeline above — these back the web remove-ads
purchase. `_shared/stripe.ts` is a dependency-free Stripe REST client (no `stripe` npm
package), the same "just `fetch`" convention as `apps/web/src/auth/supabaseAuth.ts`.

| Function                  | Contract                                             | Notes                                                |
| ------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `create-checkout-session` | `POST { successUrl, cancelUrl } -> { url }`          | Authenticated. Returns a Stripe-hosted Checkout URL. |
| `stripe-webhook`          | `POST` (called by Stripe, `Stripe-Signature` header) | Grants `remove_ads` on `checkout.session.completed`. |

Additional env vars beyond the ones listed under Deploy & run below: `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` (from the Stripe dashboard's webhook endpoint config),
`STRIPE_REMOVE_ADS_PRICE_ID` (the Price id for the one-time "remove ads" product), and
`CHECKOUT_ALLOWED_ORIGINS` — a **required**, comma-separated allowlist of the web app's own
origin(s) (e.g. `https://ageofplunder.app,http://localhost:5173`). `create-checkout-session`
rejects any `successUrl`/`cancelUrl` outside these origins (open-redirect guard, #105) and
fails closed if the var is unset. See `.env.example` at the repo root. Native IAP
(App/Play Store) is not implemented here yet;
it needs real store credentials to verify receipts against, which is an operator action —
see the client-side hook in `apps/web/src/monetization/iap.ts`.

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
