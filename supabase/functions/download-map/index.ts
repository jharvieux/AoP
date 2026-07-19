// download-map (#63 Tier 2): POST { mapId } -> { mapId, name, mapCode, authorId,
// authorName, width, height, playerCount }.
//
// Hands back a published map's Tier-1 code (the client imports it through the same
// decode + engine-validate path as a pasted code) and counts the download. Gated
// only on holding ANY authenticated session, like browse-maps.
//
// Visibility: a published map is downloadable by anyone; a hidden or removed map is
// downloadable ONLY by its author (so moderation or a mistaken remove never destroys
// the author's own work) and reads as NOT_FOUND to everyone else — moderation state
// is not a public signal. The counter increments only for published maps fetched by
// someone other than the author (an author re-downloading their own map is not a
// "download", and the increment_map_downloads RPC independently refuses non-published
// rows).

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
    const { data: row, error } = await db
      .from('community_maps')
      .select('id, name, map_code, status, author_id, width, height, player_count')
      .eq('id', body.mapId)
      .maybeSingle()
    if (error) throw new AppError('INTERNAL', error.message)
    if (!row || (row.status !== 'published' && row.author_id !== userId)) {
      throw new AppError('NOT_FOUND', 'Map not found')
    }

    if (row.status === 'published' && row.author_id !== userId) {
      const { error: rpcError } = await db.rpc('increment_map_downloads', { p_map_id: row.id })
      if (rpcError) throw new AppError('INTERNAL', rpcError.message)
    }

    const { data: author } = await db
      .from('profiles')
      .select('display_name')
      .eq('id', row.author_id)
      .maybeSingle()

    return jsonResponse(req, {
      mapId: row.id,
      name: row.name,
      mapCode: row.map_code,
      authorId: row.author_id,
      authorName: author?.display_name ?? 'Unknown Pirate',
      width: row.width,
      height: row.height,
      playerCount: row.player_count,
    })
  } catch (err) {
    return errorResponse(req, err)
  }
})
