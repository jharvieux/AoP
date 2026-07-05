// report-map (#63 Tier 2): POST { mapId, reason? } -> { status, reportCount }.
//
// Files an abuse report against a published map (post-moderation, operator
// decision). Any authenticated session may report — including guests — but the
// auto-hide threshold counts DISTINCT REGISTERED reporters only (the
// `file_map_report` RPC joins profiles.is_guest = false), so free-to-mint anonymous
// sessions can never hide a map by themselves; their reports are still recorded for
// the human reviewer. At REPORT_AUTO_HIDE_THRESHOLD (3, @aop/shared) registered
// reporters the map flips to 'hidden' pending manual review — see the
// community_maps migration for the full moderation design.
//
// One report per user per map, ever (the reports table's primary key); repeat
// reports are accepted and simply change nothing. Authors cannot report their own
// maps (no self-hide loops, no padding your own report row for confusion).

import { REPORT_AUTO_HIDE_THRESHOLD, normalizeReportReason } from '@aop/shared'
import { requireUserId, serviceClient } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as { mapId?: unknown; reason?: unknown }
    if (typeof body.mapId !== 'string') throw new AppError('BAD_REQUEST', 'mapId must be a string')
    const reason = normalizeReportReason(body.reason)

    const db = serviceClient()
    const { data: row, error } = await db
      .from('community_maps')
      .select('id, status, author_id')
      .eq('id', body.mapId)
      .maybeSingle()
    if (error) throw new AppError('INTERNAL', error.message)
    // A removed map is gone from the library; reporting it is meaningless. Hidden
    // maps stay reportable (the report joins the review pile).
    if (!row || row.status === 'removed') throw new AppError('NOT_FOUND', 'Map not found')
    if (row.author_id === userId) {
      throw new AppError('BAD_REQUEST', 'You cannot report your own map')
    }

    const { data: result, error: rpcError } = await db.rpc('file_map_report', {
      p_map_id: row.id,
      p_reporter: userId,
      p_reason: reason ?? '',
      p_auto_hide_threshold: REPORT_AUTO_HIDE_THRESHOLD,
    })
    if (rpcError) throw new AppError('INTERNAL', rpcError.message)
    const outcome = result?.[0]
    if (!outcome) throw new AppError('INTERNAL', 'Report was not recorded')

    return jsonResponse({ status: outcome.status, reportCount: outcome.report_count })
  } catch (err) {
    return errorResponse(err)
  }
})
