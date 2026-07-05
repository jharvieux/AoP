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
