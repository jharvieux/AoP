# Deploying a release

There are three independently-hosted tiers — Supabase (database + edge functions) and
Vercel (the web client). They must ship from the **same commit**: a client bundle built
against a newer `@aop/engine`/`@aop/shared` than what's deployed to the functions (or vice
versa) is the desync scenario `docs/MULTIPLAYER.md` worries about (#249).

Until a production Supabase project and Vercel project both exist and their secrets are
configured, do this manually in the order below. Once secrets are set (see below), the
scaffolded `.github/workflows/deploy.yml` (`workflow_dispatch`, run from the Actions tab)
does all four steps from one checkout.

## Prerequisites (operator actions — one-time)

1. **Supabase production project**: create it in the
   [dashboard](https://supabase.com/dashboard) (`supabase/README.md` § Environments — a
   separate project from local/staging, never shared). Note the project ref.
2. **Vercel project**: link `apps/web` to a Vercel project (`vercel link` from that
   directory, or via the Vercel dashboard's Git integration — either way, disable the
   Git integration's auto-deploy on push if you want `deploy.yml` to be the only path to
   production, to avoid two deploy mechanisms racing).
3. **Stripe** (if monetization is live): a Price id and a webhook endpoint pointed at the
   deployed `stripe-webhook` function URL (`supabase/functions/README.md` § Monetization).

## Required secrets (GitHub → Settings → Environments → `production`)

Scoping these to a `production` **environment** (rather than repo-level secrets) is
deliberate — `deploy.yml` sets `environment: production`, so a required-reviewers rule
added there gates every production deploy on a human approval without any workflow change.

| Secret                  | Where it comes from                                                             |
| ----------------------- | ------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard → Account → Access Tokens (personal or a dedicated CI token) |
| `SUPABASE_PROJECT_REF`  | Supabase dashboard → Project Settings → General → Reference ID                  |
| `SUPABASE_DB_PASSWORD`  | Set when the project was created; resettable under Project Settings → Database  |
| `SUPABASE_URL`          | Project Settings → API → Project URL (used by the smoke test, not the CLI)      |
| `SUPABASE_ANON_KEY`     | Project Settings → API → anon/public key (smoke test only)                      |
| `VERCEL_TOKEN`          | Vercel → Account Settings → Tokens                                              |
| `VERCEL_ORG_ID`         | `apps/web/.vercel/project.json` after a local `vercel link`                     |
| `VERCEL_PROJECT_ID`     | Same file as above                                                              |

Edge-function-scoped secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_REMOVE_ADS_PRICE_ID`, `CHECKOUT_ALLOWED_ORIGINS`, `CRON_SECRET`, and `SENTRY_DSN`
— see below) are **not** in this table — they're configured directly on the Supabase
project (dashboard → Edge Functions → Secrets, or `supabase secrets set`), not passed
through the deploy workflow, same as `SUPABASE_SERVICE_ROLE_KEY` which the platform
injects into every function at runtime automatically.

## Error reporting + synthetic monitor (#252) — operator setup

Both are dormant until configured; nothing fails or nags in their absence.

- **Sentry** (one free-tier project per tier, or one shared project):
  - Web client: set `VITE_SENTRY_DSN` as a Vercel project env var (it's a build-time
    Vite var). Without it the SDK chunk is never even downloaded by players.
  - Edge functions: `supabase secrets set SENTRY_DSN=<dsn>`. Every unexpected throw
    that reaches the shared `errorResponse` envelope is captured.
- **Synthetic monitor** (`.github/workflows/synthetic-monitor.yml`, every 15 min):
  needs `SUPABASE_URL` + `SUPABASE_ANON_KEY` as **repo-level** secrets — the
  environment-scoped copies above are invisible to it, deliberately, so a
  required-reviewers rule on `production` can't wedge a scheduled run. Optionally add
  `SUPABASE_DB_URL` (full Postgres connection string, Project Settings → Database →
  Connection string) to also alert on failing maintenance crons via
  `extensions.maintenance_heartbeats` (#224). A failing run emails repo watchers —
  that is the alert channel.

## Manual deploy order (until `deploy.yml` is enabled, or as a fallback if it fails partway)

Run every command from the repo root unless noted, against the commit you intend to
release (check it out or `git checkout <sha>` first — don't deploy an uncommitted tree).

```bash
# 1. Database — apply any migrations added since the last deploy.
supabase link --project-ref <project-ref>
supabase db push

# 2. Edge functions — redeploy every function so the server always matches the
#    @aop/engine version the client below is about to ship.
supabase functions deploy

# 3. Web client — build and promote to production.
cd apps/web
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
cd ../..

# 4. Smoke test — confirm the function stack is actually reachable post-deploy.
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST "$SUPABASE_URL/functions/v1/list-open-matches" \
  -H "apikey: $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' -d '{}'
# Expect 403 (no Authorization header) with a { error: { code, message } } JSON body —
# that's the function deployed and enforcing its auth boundary, not a crash. Confirming
# the full authenticated 200 happy path needs a real user JWT; there's no persistent
# smoke-test account provisioned (see note below).
```

If step 1 or 2 fails, stop — do not deploy the web client against a database/function
state you haven't confirmed. If step 3 fails after 1–2 succeeded, the server is already
on the new contract; redeploying the client is the priority, not a rollback of 1–2.

## Smoke test scope (why it's not a literal end-to-end 200)

`list-open-matches` requires a real authenticated user JWT (`requireUserId` in
`supabase/functions/_shared/client.ts` calls `auth.getUser()` on the bearer token) — the
anon key alone can't get past that. Reaching a genuine `200` envelope means either:

- provisioning a **persistent smoke-test account** and storing its credentials as a
  secret (creates a real, permanent row in the production `auth.users`/`profiles` tables
  purely for CI to log in as — an operator call, not made here), or
- minting a short-lived JWT at deploy time via the Admin API using the service-role key.

Both are reasonable follow-ups but out of scope for standing this pipeline up; the current
smoke test proves the function is deployed, reachable, and its auth boundary is executing
correctly, which already catches the "forgot to deploy" and "function throws on cold
start" failure modes #249 was filed for.

## Rollback

- **Web**: `vercel rollback` (instant — repoints the alias to the previous deployment, no
  rebuild; see `vercel:deployments-cicd` skill).
- **Edge functions**: redeploy the previous commit's `supabase/functions` tree
  (`git checkout <previous-sha> -- supabase/functions && supabase functions deploy`).
- **Database**: migrations are forward-only by convention here (`supabase/README.md` has
  no down-migration workflow) — a bad migration needs a new forward migration that undoes
  it, not a rollback.
