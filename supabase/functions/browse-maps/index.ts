// browse-maps (#63 Tier 2): POST { search?, limit?, before? } ->
// { maps: CommunityMapSummary[], nextBefore: string | null }.
//
// The community library's list/search read path. Gated only on holding ANY
// authenticated session — guest/anonymous sessions may browse (consumption stays
// guest-friendly, matching Tier 1); only publishing requires a registered account.
//
// Access-control choice, mirroring list-open-matches (#150): a service-role Edge
// Function returning a hand-picked safe projection, rather than a client SELECT
// policy on `community_maps`. Only published rows are ever considered, and the
// projection (CommunityMapSummary) carries no `map_code` (that's download-map,
// which counts the download), no report count, and no moderation status. The
// filter/sort/page policy is the pure `selectCommunityMaps` in @aop/shared; this
// function owns only the query and the projection.

import {
  COMMUNITY_MAP_PAGE_MAX,
  clampCommunityMapLimit,
  decodeCommunityMapCursor,
  encodeCommunityMapCursor,
  escapeIlikePattern,
  selectCommunityMaps,
  type CommunityMapSummary,
} from '@aop/shared'
import { requireUserId, serviceClient } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { displayNames } from '../_shared/match.ts'

// Over-fetch factor: the only post-SQL drop is same-timestamp cursor ties, so a
// small multiple keeps pages full without pulling the whole table.
const RAW_FETCH_LIMIT = COMMUNITY_MAP_PAGE_MAX * 2

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    await requireUserId(req) // any authenticated session, guests included

    const body = (await req.json().catch(() => ({}))) as {
      search?: unknown
      limit?: unknown
      before?: unknown
    }
    const search = typeof body.search === 'string' ? body.search.trim() : ''
    const limit = body.limit === undefined ? undefined : Number(body.limit)
    const before = decodeCommunityMapCursor(body.before)

    const db = serviceClient()

    let query = db
      .from('community_maps')
      .select('id, name, author_id, width, height, player_count, download_count, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(RAW_FETCH_LIMIT)
    if (search !== '') query = query.ilike('name', `%${escapeIlikePattern(search)}%`)
    // Coarse pre-filter only (same-second ties resolved by the pure keyset filter).
    if (before) query = query.lte('created_at', before.createdAt)
    const { data: rows, error } = await query
    if (error) throw new AppError('INTERNAL', error.message)

    const candidates = rows ?? []
    const names = await displayNames(
      db,
      candidates.map((r) => r.author_id),
    )
    const summaries: CommunityMapSummary[] = candidates.map((r) => ({
      mapId: r.id,
      name: r.name,
      authorId: r.author_id,
      authorName: names.get(r.author_id) ?? 'Unknown Pirate',
      width: r.width,
      height: r.height,
      playerCount: r.player_count,
      downloadCount: r.download_count,
      createdAt: r.created_at,
    }))

    const maps = selectCommunityMaps(summaries, { search, limit, before })
    const last = maps[maps.length - 1]
    const nextBefore =
      last && maps.length === clampCommunityMapLimit(limit)
        ? encodeCommunityMapCursor({ createdAt: last.createdAt, mapId: last.mapId })
        : null

    return jsonResponse(req, { maps, nextBefore })
  } catch (err) {
    return errorResponse(req, err)
  }
})
