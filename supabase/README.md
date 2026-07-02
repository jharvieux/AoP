# Supabase

Backs the Phase 3 async multiplayer design in [`docs/MULTIPLAYER.md`](../docs/MULTIPLAYER.md).
This directory is the source of truth for the database schema; `config.toml` is the local
dev stack configuration, `migrations/` is the schema, applied in filename order.

## Local development

Requires Docker running. The `supabase` CLI is a pinned root devDependency, so use the
`pnpm` scripts rather than a separately installed CLI to avoid version drift:

```bash
pnpm supabase:start   # boots the local stack (Postgres, Auth, Realtime, Studio, ...)
pnpm supabase:reset   # re-applies all migrations from scratch (destructive, local only)
pnpm supabase:stop    # tears the stack down
pnpm supabase:types   # regenerates packages/shared/src/database.types.ts from the local db
```

`supabase start` prints local URLs and keys (API, Studio, Postgres connection string,
anon/service-role JWTs) — copy the ones you need into `.env` (see `.env.example` at the
repo root; `.env` itself is gitignored).

Studio (`http://127.0.0.1:54323` by default) is the easiest way to browse tables and try
queries against the local schema.

## Adding a migration

```bash
supabase migration new <description>
```

writes a new empty file under `migrations/` with a timestamp prefix — put schema changes
there, never edit an already-applied migration in place. `pnpm supabase:reset` replays
everything to check the new migration applies cleanly, then run `pnpm supabase:types` to
refresh the generated types. Both migrations and generated types are checked in CI (see
`.github/workflows/supabase.yml`): it boots the local stack from a clean state (proving the
migrations apply in order) and fails if `database.types.ts` doesn't match what the schema
actually generates.

## Environments

Three tiers, each a **separate Supabase project** (separate URL, keys, and data — never
share a project across tiers):

| Tier       | Purpose                                   | `engine_version` pinning              |
| ---------- | ------------------------------------------ | -------------------------------------- |
| Local      | This directory's stack, via Docker         | Whatever's checked out                 |
| Staging    | Pre-release integration testing            | Latest merged to `main`                |
| Production | Real player matches                        | Pinned per match at creation (§10)     |

**Provisioning a new tier is an operator action** (Supabase account/org access and billing
are outside what an agent session has): create the project in the
[Supabase dashboard](https://supabase.com/dashboard), then link this repo to it locally
with `supabase link --project-ref <ref>` and push the schema with `supabase db push`. CI
only ever runs migrations against the ephemeral local stack it boots itself — it never
touches a real (staging/production) project, so linking a project ref is a manual,
per-machine step, not something `supabase/config.toml` encodes.

## Row-level security

Every table has RLS enabled (see `migrations/20260702000001_rls_policies.sql`). Per
`docs/MULTIPLAYER.md` §4, all game-state writes happen in Edge Functions using the
service-role key, which bypasses RLS — so no table has a client-facing INSERT/UPDATE
policy except `profiles` (a user manages their own row). `match_snapshots` has RLS enabled
with zero policies, i.e. it is never client-readable at all: full `GameState` includes
hidden information and `rngState` (§7).
