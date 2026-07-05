// remove-map (#63 Tier 2): POST { mapId } -> { removed: true }.
//
// The author takes their own map out of the library. Soft delete (status
// 'removed', never a row DELETE): the row keeps counting against the author's
// publish rate limit (remove-and-republish is not a spam bypass), stays available
// to the author via download-map (their work is never destroyed), and remains
// auditable alongside its reports. Only the author can remove their map — the
// UPDATE is scoped to (id, author_id), so anyone else's attempt reads as
// NOT_FOUND. Moderator action (hiding/restoring) is the report path and manual
// SQL, not this function.

import { requireUserId, serviceClient } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as { mapId?: unknown }
    if (typeof body.mapId !== 'string') throw new AppError('BAD_REQUEST', 'mapId must be a string')

    const db = serviceClient()
    // Idempotent: removing an already-removed map succeeds again — the scoping to
    // author_id is the entire authorization check.
    const { data, error } = await db
      .from('community_maps')
      .update({ status: 'removed' })
      .eq('id', body.mapId)
      .eq('author_id', userId)
      .select('id')
    if (error) throw new AppError('INTERNAL', error.message)
    if (!data || data.length === 0) throw new AppError('NOT_FOUND', 'Map not found')

    return jsonResponse({ removed: true })
  } catch (err) {
    return errorResponse(err)
  }
})
