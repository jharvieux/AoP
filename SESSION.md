# SESSION.md — resume state

Transient whole-file-overwrite resume state. Update at session end.
_Last updated: 2026-07-19 (issue sweep: 23 issues closed across 14 squash-merged PRs)._

## Just completed

Full /issue-sweep (D-048). 14 PRs merged in a strict merge train, every one audited by
pre-pr-reviewer before merge (two WARNINGs fixed in-PR, one BLOCKER — stale generated
types — fixed by hand-deriving the generator's output, byte-verified by CI):

- **Security/supply-chain**: qs CVE patch + pnpm/Dependabot hardening (#558); CI
  `${{ github.base_ref }}` injection fix + 18 action refs SHA-pinned (#562); CORS env-var
  allowlist replacing wildcard on all 26 edge functions (#563); art-tool SSRF guard, part
  of (#569); service-worker SKIP_WAITING origin guard (#576).
- **Database**: definer-fn revoke + search_path pins + RLS initplan wrap (12 policies) +
  permissive-SELECT consolidation (#567); GDPR chat erasure on account deletion via
  BEFORE DELETE trigger on profiles (#577); 90-day push-token purge routine (#579).
- **Saves**: RULES_VERSION load gate with friendly failure (#557); snapshot saves — old
  saves survive engine version bumps, save schema v2→3 (#564, operator ruling Option A).
- **Perf**: edge-function N+1 batching (#571); bounded-concurrency sweep/compaction +
  client lookup maps + bit-identical engine AI refactor, ENGINE_VERSION bump (#578).
- **Quality/docs**: 26 weak test suites strengthened for the high-value set (#560);
  catalog de-triplicated into @aop/content + dead-export cleanup + deepEqual (#569);
  data-classification inventory docs/DATA-CLASSIFICATION.md (#568); retention policies
  documented (#579).

Close-set reconciled mechanically: all 23 expected issues verified CLOSED; split
remainders #559/#565/#566 verified OPEN and cross-linked.

## In flight

Nothing. Sweep ledger deleted; no open auto-triaged PRs; all executor worktrees removed.

## Next step

Optional follow-up sweep over the remaining tails: #559 (render-only test suites), #565
(Watch Replay after cross-version snapshot resume — real feature), #566 (58
unused-exported types). #535 (live-defender lockstep server side) still needs a human
two-client session.

## Blocked on user (production actions, in order)

1. `supabase secrets set ALLOWED_ORIGINS=https://age-of-plunder.vercel.app` on the
   production project (BEFORE deploying edge functions — #563's allowlist default covers
   it, but the secret makes it explicit).
2. Run `deploy.yml` (Actions tab) — edge functions changed substantially (#563/#571/#578)
   and ENGINE_VERSION bumped (#578): version-skew risk until deployed. Migrations
   (#567/#577/#579) ride the same deploy.
3. `select cron.schedule('purge-stale-push-tokens-daily','30 4 * * *',$$select
public.purge_stale_push_tokens()$$);` on production (#580).
4. Local env: colima Docker disk is FULL — `supabase start` cannot run until space is
   freed (blocked two executors this sweep; both fell back to CI validation).

## Open questions

None pending — all sweep rulings were collected and recorded in D-048.
