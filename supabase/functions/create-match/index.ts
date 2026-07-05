// create-match (docs/MULTIPLAYER.md §5): POST { settings } -> { matchId, inviteCode }.
// Server generates the seed (never client-chosen — §11 chosen-seed advantage) and
// pins engine_version. Creator takes seat 0 in `lobby`; AI seats are filled up front.

import { serviceClient, requireUserId, ensureProfile } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { assertFaction, firstFreeFaction, parseSettings } from '../_shared/match.ts'
import { ENGINE_VERSION, type FactionId } from '@aop/shared'

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % 2 ** 31
}

function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as {
      settings?: unknown
      displayName?: string
      faction?: unknown
    }
    const settings = parseSettings(body.settings)
    const db = serviceClient()
    await ensureProfile(db, userId, body.displayName?.trim() || 'Captain')

    const creatorFaction: FactionId =
      body.faction === undefined ? firstFreeFaction([]) : assertFaction(body.faction)

    const code = inviteCode()
    const insertMatch = await db
      .from('matches')
      .insert({
        status: 'lobby',
        settings: settings as unknown as Record<string, unknown>,
        seed: randomSeed(),
        engine_version: ENGINE_VERSION,
        invite_code: code,
        created_by: userId,
      })
      .select('id')
      .single()
    if (insertMatch.error || !insertMatch.data) {
      throw new AppError('INTERNAL', insertMatch.error?.message ?? 'Could not create match')
    }
    const matchId = insertMatch.data.id

    const seatRows: {
      match_id: string
      seat: number
      user_id: string | null
      faction: FactionId
      status: string
    }[] = [
      { match_id: matchId, seat: 0, user_id: userId, faction: creatorFaction, status: 'joined' },
    ]

    const taken: FactionId[] = [creatorFaction]
    for (let seat = 1; seat <= settings.aiSeats; seat++) {
      const faction = firstFreeFaction(taken)
      taken.push(faction)
      seatRows.push({ match_id: matchId, seat, user_id: null, faction, status: 'joined' })
    }
    const insertSeats = await db.from('match_players').insert(seatRows)
    if (insertSeats.error) throw new AppError('INTERNAL', insertSeats.error.message)

    return jsonResponse({ matchId, inviteCode: code })
  } catch (err) {
    return errorResponse(err)
  }
})
