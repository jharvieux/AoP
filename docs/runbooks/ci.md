# CI on pull requests — behavior and failure modes

How `ci.yml` (the required `ci` check), `codeql.yml`, and `supabase.yml` actually behave
on PRs into the protected `main` branch, and the failure modes that have bitten real
sweeps. Companion to `docs/runbooks/deploy.md` (releases) and the branch policy at the top
of `CLAUDE.md`.

## The merge gate

- `main` requires the `ci` check, **strict** ("Require branches to be up to date"): a PR
  whose branch is behind `main` cannot merge until it is updated, even with a green `ci`.
- All changes land via squash-merge of a PR — including docs, MEMORY, and workflow YAML.

## Failure mode 1: CI silently never starts on a conflicting PR (#203)

**Symptom**: a PR sits with **zero checks reported at all** for many minutes.
`gh pr checks <n>` returns nothing — not pending, not failed, just nothing — forever.
This is indistinguishable from "CI just hasn't been scheduled yet".

**Cause**: GitHub does not run `pull_request`-triggered workflows when it cannot compute a
merge preview of the PR (unresolved conflicts with the base branch). It also posts no
failing or errored check to say so — the workflows are silently skipped. This typically
happens mid-sweep: an earlier PR in the same batch squash-merges into `main`, and a later
PR whose diff overlaps goes `CONFLICTING`/`DIRTY` without any visible signal on the PR's
checks tab. It happened twice in one session (PRs #200 and #202).

**Detection** — the checks API will never tell you; ask the merge-state API instead:

```bash
gh pr view <n> --json mergeable,mergeStateStatus
```

| `mergeStateStatus` | Meaning                                            | What to do                     |
| ------------------ | -------------------------------------------------- | ------------------------------ |
| `CLEAN`            | Up to date, checks green                           | Merge                          |
| `BLOCKED`          | Checks pending or required review missing          | Keep waiting                   |
| `BEHIND`           | Strict check: branch is behind `main`              | Update branch, CI reruns       |
| `DIRTY`            | **Conflicts — CI will never start**                | Rebase onto `main` immediately |
| `UNKNOWN`          | GitHub is still computing; re-query after a moment | Re-query                       |

**Rule for anything that polls `gh pr checks` while waiting to merge** (sweep supervisors
included): if a PR has posted **zero checks after ~2 minutes**, stop treating it as
"queued" — query `mergeable`/`mergeStateStatus`, and on `DIRTY`/`CONFLICTING` rebase onto
`main` and push before resuming the poll. Never wait on a `DIRTY` PR; it will wait
forever.

**Recovery**:

```bash
git fetch origin main
git rebase origin/main        # resolve conflicts, rerun pnpm verify
git push --force-with-lease   # your own feature branch only — never a shared branch
```

A fresh push restarts the `pull_request` workflows normally.

## Failure mode 2: strict up-to-date check after a parallel batch merges

With the strict setting, **every** merge into `main` makes every other open PR `BEHIND`,
even with no textual conflict. A green PR that was mergeable a minute ago now refuses to
merge until its branch is updated (which reruns CI from scratch). Consequence for
parallel sweep batches: merges are effectively serialized — after each squash-merge,
update the next PR's branch and wait for its rerun. Budget for this; do not fire N merges
and expect N−1 of them to land.

## Failure mode 3: deploys are `workflow_dispatch`, not merge-triggered

`deploy.yml` runs only from the Actions tab (or `gh workflow run deploy.yml`) — merging a
PR never deploys anything. A green `ci` on `main` means the commit is _deployable_, not
_deployed_. See `docs/runbooks/deploy.md` for the release procedure and the same-commit
rule across the Supabase/Vercel tiers.

## Quick reference: waiting on a sweep PR

```bash
gh pr checks <n> --watch                      # normal path
gh pr view <n> --json mergeable,mergeStateStatus   # ALWAYS run this if checks stay empty
```
