// publish-map (#63 Tier 2): POST { mapCode, name? } -> { mapId }.
//
// Publishes an authored map to the community library. Registered accounts only
// (operator decision): a guest/anonymous session is rejected outright, so every
// published map ties back to a real identity.
//
// This is an untrusted-input boundary, so nothing from the client is believed:
//  - **Server-side re-validation**: the map code is decoded (@aop/shared's codec,
//    which itself rejects decode bombs and structural garbage) and the decoded map
//    is re-run through the engine's `validateMapDefinition` against the same
//    @aop/content limits the editor uses. The Tier-1 client already validates
//    before export, but a client can always be modified — an invalid map never
//    reaches the table.
//  - **Size cap**: MAP_CODE_MAX_BYTES (256 KiB since #507, @aop/shared) — ~1.4x the
//    largest legal map's worst-case encoding; the table's octet_length check backs it up.
//  - **Rate limit**: PUBLISH_MAX_PER_WINDOW (5) per PUBLISH_WINDOW_MS (1 h) per
//    author, counted over all rows including removed ones (soft delete makes
//    remove-and-republish count against the window).
//
// The map goes live immediately (post-moderation, status 'published') — see the
// community_maps migration for the report/auto-hide side.

import type { EncounterPlacement, MapDefinition, ResourceNodePlacement, Tile } from '@aop/engine'
import { validateMapDefinition } from '@aop/engine'
import { MAP_VALIDATION_LIMITS } from '@aop/content'
import {
  PUBLISH_WINDOW_MS,
  decodeMapCodePayload,
  mapCodeExceedsSizeLimit,
  normalizeMapName,
  publishRateLimited,
} from '@aop/shared'
import { requireUserId, serviceClient } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as { mapCode?: unknown; name?: unknown }

    if (typeof body.mapCode !== 'string') {
      throw new AppError('BAD_REQUEST', 'mapCode must be a string')
    }
    if (mapCodeExceedsSizeLimit(body.mapCode)) {
      throw new AppError('BAD_REQUEST', 'Map code exceeds the maximum size')
    }

    const db = serviceClient()

    // Registered accounts only — a guest session cannot publish.
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('is_guest')
      .eq('id', userId)
      .maybeSingle()
    if (profileError) throw new AppError('INTERNAL', profileError.message)
    if (!profile || profile.is_guest) {
      throw new AppError(
        'FORBIDDEN',
        'Publishing to the community library requires a registered account',
      )
    }

    // Rate limit: publishes by this author inside the rolling window, counting
    // removed rows too (soft delete — see the migration).
    const windowStart = new Date(Date.now() - PUBLISH_WINDOW_MS).toISOString()
    const { count, error: countError } = await db
      .from('community_maps')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', userId)
      .gte('created_at', windowStart)
    if (countError) throw new AppError('INTERNAL', countError.message)
    if (publishRateLimited(count ?? 0)) {
      throw new AppError('RATE_LIMITED', 'Publish limit reached — try again later')
    }

    // Decode (structural validation) then re-validate with the engine (semantic
    // validation) — never trust the client's own validation pass.
    let mapDefinition: MapDefinition
    let payloadName: string
    try {
      const payload = decodeMapCodePayload(body.mapCode)
      payloadName = payload.name
      mapDefinition = {
        width: payload.width,
        height: payload.height,
        tiles: payload.tiles as Tile[],
        startPositions: payload.startPositions,
        // Entity kinds ride the wire as strings; validateMapDefinition rejects
        // unrecognized ones below, which is what makes these casts safe.
        encounters: payload.encounters as EncounterPlacement[],
        resourceNodes: payload.resourceMarkers as ResourceNodePlacement[],
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid map code'
      throw new AppError('INVALID_ACTION', message)
    }

    const validation = validateMapDefinition(mapDefinition, MAP_VALIDATION_LIMITS)
    if (!validation.valid) {
      throw new AppError(
        'INVALID_ACTION',
        `Map failed validation: ${validation.errors.map((e) => e.message).join('; ')}`,
      )
    }

    const name = normalizeMapName(body.name ?? payloadName)
    if (name === null) {
      throw new AppError('BAD_REQUEST', 'Map name must be 1-60 characters')
    }

    const { data: inserted, error: insertError } = await db
      .from('community_maps')
      .insert({
        author_id: userId,
        name,
        map_code: body.mapCode,
        width: mapDefinition.width,
        height: mapDefinition.height,
        player_count: mapDefinition.startPositions.length,
      })
      .select('id')
      .single()
    if (insertError || !inserted) {
      throw new AppError('INTERNAL', insertError?.message ?? 'Insert failed')
    }

    return jsonResponse(req, { mapId: inserted.id })
  } catch (err) {
    return errorResponse(req, err)
  }
})
