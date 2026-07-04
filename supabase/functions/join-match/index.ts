// join-match (docs/MULTIPLAYER.md §5): POST { inviteCode | matchId, faction? } ->
// { matchId, seat }. Seat + faction assignment with conflict rejection, in lobby only.

import { serviceClient, requireUserId, ensureProfile } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { assertFaction, firstFreeFaction, type MatchSettings } from '../_shared/match.ts'
import type { FactionId } from '@aop/shared'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as {
      inviteCode?: string
      matchId?: string
      faction?: unknown
      displayName?: string
    }
    if (!body.inviteCode && !body.matchId) {
      throw new AppError('BAD_REQUEST', 'Provide inviteCode or matchId')
    }
    const db = serviceClient()
    await ensureProfile(db, userId, body.displayName?.trim() || 'Captain')

    const query = db.from('matches').select('id, status, settings')
    const { data: match, error } = await (
      body.matchId ? query.eq('id', body.matchId) : query.eq('invite_code', body.inviteCode!)
    ).maybeSingle()
    if (error) throw new AppError('INTERNAL', error.message)
    if (!match) throw new AppError('NOT_FOUND', 'No such match')
    if (match.status !== 'lobby')
      throw new AppError('MATCH_STATE', 'Match is no longer open to join')
    const settings = match.settings as unknown as MatchSettings

    const { data: seats, error: seatErr } = await db
      .from('match_players')
      .select('seat, user_id, faction')
      .eq('match_id', match.id)
      .order('seat', { ascending: true })
    if (seatErr) throw new AppError('INTERNAL', seatErr.message)
    const rows = seats ?? []

    const mine = rows.find((r) => r.user_id === userId)
    if (mine) return jsonResponse({ matchId: match.id, seat: mine.seat })

    const usedSeats = new Set(rows.map((r) => r.seat))
    let seat = -1
    for (let i = 0; i < settings.maxPlayers; i++) {
      if (!usedSeats.has(i)) {
        seat = i
        break
      }
    }
    if (seat === -1) throw new AppError('MATCH_STATE', 'Match is full')

    const takenFactions = rows.map((r) => r.faction as FactionId)
    let faction: FactionId
    if (body.faction === undefined) {
      faction = firstFreeFaction(takenFactions)
    } else {
      faction = assertFaction(body.faction)
      if (takenFactions.includes(faction)) {
        throw new AppError('INVALID_ACTION', `Faction ${faction} is already taken`)
      }
    }

    const insert = await db
      .from('match_players')
      .insert({ match_id: match.id, seat, user_id: userId, faction, status: 'joined' })
    if (insert.error) {
      // A racing joiner grabbed the seat or faction between our read and write.
      if (insert.error.code === '23505') throw new AppError('MATCH_STATE', 'Seat just taken, retry')
      throw new AppError('INTERNAL', insert.error.message)
    }
    return jsonResponse({ matchId: match.id, seat })
  } catch (err) {
    return errorResponse(err)
  }
})
