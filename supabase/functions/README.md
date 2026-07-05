# Edge Functions

Server-authoritative multiplayer per [`docs/MULTIPLAYER.md`](../../docs/MULTIPLAYER.md) §5.
Each function runs the **same `@aop/engine` reducer the client runs** (§2), against state
reconstructed from the action log, under Deno. The engine is dependency-free and touches no
DOM/Node/Deno API, so it runs here unmodified.

| Function            | Contract (§5)                                                             | Issue |
| ------------------- | ------------------------------------------------------------------------- | ----- |
| `create-match`      | `POST { settings } -> { matchId, inviteCode }`                            | #32   |
| `join-match`        | `POST { inviteCode \| matchId, faction? } -> { matchId, seat }`           | #32   |
| `start-match`       | `POST { matchId } -> { seq: 0 }` (creator only)                           | #32   |
| `submit-action`     | `POST { matchId, expectedSeq, action } -> { seq, view }`                  | #33   |
| `end-turn`          | `POST { matchId } -> { seq, view }`                                       | #33   |
| `get-player-view`   | `POST { matchId } -> { seq, seat, view, turnDeadline }`                   | #34   |
| `sweep-turns`       | `POST -> { swept }` (§8 turn-timer sweep; service-role only)              | #129  |
| `reclaim-seat`      | `POST { matchId } -> { seat }` (returning human from ai_takeover)         | #134  |
| `list-open-matches` | `POST { limit?, before? } -> { matches, nextBefore }` (public lobby list) | #150  |

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

`list-open-matches` (§14, #150) is the public match browser's backend — the only read
path that does **not** require the caller to already hold a seat. Rather than loosen the
`matches` RLS (`matches_select_seated`, which restricts the table to seated players) or add
a column-safe view/grant, it runs as a service-role function and returns a hand-picked safe
projection (`OpenMatchSummary`: match id, map size, max players, current seat count, turn
timer, created_at) of `lobby`-status, non-full, non-private matches — never `seed`,
`invite_code`, or the full `settings`. The `matches` table's access model is untouched. The
filter/sort/page policy is the pure `selectOpenMatches` in `@aop/shared`; the function owns
only the query and the safe projection. Joining still goes through `join-match`; this
function only tells a client which `matchId`s exist to join.

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
> logic these functions call is covered by the workspace Vitest suites instead. Fog/view
> filtering and reconstruction: `packages/engine/test/playerView.test.ts` and the replay
> tests. Server-side AI turns replaying action-for-action (#133): the "AI turn action log"
> tests in `packages/engine/test/ai.test.ts`. The turn-poke leak-audit shape (§7) and the
> §8 missed-turn → `ai_takeover` transition live in `@aop/shared` (`src/multiplayer.ts`)
> and are unit-tested in `apps/web/src/multiplayer/turnSync.test.ts`. The `list-open-matches`
> filter/sort/page policy (§14, #150) is the pure `selectOpenMatches`/`clampOpenMatchLimit`
> in `@aop/shared`, unit-tested in `apps/web/src/multiplayer/openMatches.test.ts`.

`sweep-turns` has no user JWT to derive a caller from, so it's gated differently: the
request's `Authorization` header must be `Bearer <SUPABASE_SERVICE_ROLE_KEY>` (the same
convention pg_cron and other trusted server-side callers use). Scheduling it on a cadence
(pg_cron, per §8) is tracked separately (#130); for now it's invoked manually or by an
external scheduler hitting the deployed URL with that header.
