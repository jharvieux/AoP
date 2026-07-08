# Local Supabase on colima (macOS)

`pnpm exec supabase start` fails on this stack when run under colima with the default
`virtiofs` mount type. Two separate issues, both fixed in the repo config:

## 1. `vector` container fails to start

```
failed to start docker container "supabase_vector_aop": Error response from daemon:
error while creating mount source path '/Users/.../.colima/default/docker.sock':
mkdir .../docker.sock: operation not supported
```

The `vector` container (Supabase's local log-shipping/analytics backend) bind-mounts the
host Docker socket so it can tail other containers' logs. colima's virtiofs mount type
can't materialize a socket special file as a mount source this way — a colima limitation,
not a Docker or Supabase bug.

**Fix (already applied)**: `[analytics] enabled = false` in `supabase/config.toml`.
Nothing in `supabase/functions`, `apps/web`, or `packages/` reads from this service —
it's Studio-only log viewing. Disabling it is safe for both local dev and CI (CI runs on
real Ubuntu/Docker, so it never hit this issue, but doesn't need the service either).

## 2. `start` still exits 1 after fixing `vector`

Even with `vector` disabled, `supabase start` can still exit 1 with `Error status 404` and
dump the `rest`/`edge_runtime` container logs, even though those containers are visibly
healthy in their own logs (serving requests, connected to Postgres). This is the CLI's
own health-check prober failing to reach a port through colima's networking layer in time
— not an actual service failure. Confirmed by re-running with the containers already up:
they report `(healthy)` in `docker ps` moments later.

**Workaround**: `pnpm exec supabase start --ignore-health-check`. This still applies every
migration and waits for the containers to come up; it just doesn't hard-fail the command
over the flaky prober. Verified the resulting stack is fully functional — every container
reaches `(healthy)`, and `pnpm exec supabase gen types typescript --local` against it
produces output byte-identical to what's already committed in
`packages/shared/src/database.types.ts`.

## Recommended local workflow

```bash
pnpm exec supabase start --ignore-health-check
pnpm exec supabase gen types typescript --local | npx prettier --config .prettierrc \
  --stdin-filepath database.types.ts > packages/shared/src/database.types.ts
pnpm exec supabase stop
```

If a future session's `supabase start` (even with the flag) still fails outright — not
just the health-check timeout — this is a good place to add findings.

## 3. `supabase functions deploy` fails at VFS-build step (#341)

After vendoring `@aop/*` workspace dependencies (#339/#340), local `supabase functions deploy`
still fails for every function with an opaque `Effect.tryPromise` error during the bundler's
VFS-build step:

```
DEBUG Building vfs with root '/Users/.../AoP/supabase'
{"_tag":"Error","error":{"code":"UnknownError","message":"An error occurred in Effect.tryPromise"}}
```

The Supabase CLI's internal Effect-based error handling swallows the real cause. This is
**a third distinct colima/virtiofs incompatibility** (after #1 and #2 above), this time in
the Docker-based function bundler rather than in `supabase start` itself. The bundler
container starts cleanly, joins the network, and exits — but the bundler-to-VFS interaction
fails silently.

### Workaround: deploy via GitHub Actions

Local `supabase functions deploy` is blocked on colima indefinitely until either:
1. Supabase CLI reports the real error (not Effect-swallowed), allowing a targeted fix.
2. A colima-specific VFS workaround is discovered (unlikely; virtiofs is a colima
   architectural choice).

**Recommended path**: deploy via `.github/workflows/deploy.yml` on GitHub Actions' native
Linux runner instead. Set up the `production` environment secrets per
`docs/runbooks/deploy.md` and trigger the workflow from main once deployment is ready.
This avoids the colima issue entirely and keeps local dev on Docker free from deploy
machinery.
