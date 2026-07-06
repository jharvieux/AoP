// drain-matchmaking (#153, docs/MULTIPLAYER.md §14): POST -> { matchesCreated, playersMatched,
// groupsFailed, matches }. The quick-match queue drain — groups compatible waiters (same
// match_size + map_size, FIFO) into fresh matches, seats them, starts each match, and removes
// them from the queue.
//
// Concurrency-safe against overlapping invocations: each group is claimed by the
// claim_matchmaking_group RPC (SELECT ... FOR UPDATE SKIP LOCKED + delete-in-transaction), so
// two drain runs firing close together lock disjoint rows and no waiter is ever double-matched
// into two matches (see supabase/migrations/20260706000000_matchmaking_queue.sql). The
// orchestration relies solely on that atomic claim — it never re-groups the queue itself.
//
// Service-role gated like sweep-turns (#129/#130): there is no user JWT to derive a seat from,
// so the caller (cron — see 20260706000001_matchmaking_drain_cron.sql — or a manual/CI trigger)
// authenticates as the service role.

import { requireServiceRole, serviceClient } from '../_shared/client.ts'
import { errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { drainMatchmaking } from '../_shared/matchmaking.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    requireServiceRole(req)
    const db = serviceClient()
    const summary = await drainMatchmaking(db)
    // #219: a partial failure (a group whose match creation failed and was
    // re-queued) still returns the summary, but as a 500 — the cron caller is
    // fire-and-forget pg_net, and a non-2xx status is what marks this
    // invocation's row `error` in extensions.maintenance_heartbeats (#224), the
    // only failure signal an operator ever sees for cron-driven functions.
    return jsonResponse(summary, summary.groupsFailed > 0 ? 500 : 200)
  } catch (err) {
    return errorResponse(err)
  }
})
