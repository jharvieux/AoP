// designate-spectator (docs/MULTIPLAYER.md §12, #148): POST { matchId, userId, seat } ->
// { matchId, userId, seat }. The one write path that grants a user spectator access to a
// match. Access is EXPLICIT and closed by default: only the match creator may designate a
// spectator, and the grant pins exactly one seat whose fog-locked view that spectator will
// receive from get-player-view. There is no public/anonymous spectating — the grantee is a
// named, authenticated user. Granting the seat here (server-side, from a trusted caller)
// rather than letting the spectator pick a seat at view time is what keeps a spectator from
// ever watching a second seat, let alone raw state (§11 map-hack / god-mode).

import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const grantorId = await requireUserId(req)
    const { matchId, userId, seat } = (await req.json().catch(() => ({}))) as {
      matchId?: string
      userId?: string
      seat?: unknown
    }
    if (!matchId) throw new AppError('BAD_REQUEST', 'matchId is required')
    if (!userId) throw new AppError('BAD_REQUEST', 'userId (the spectator) is required')
    if (!Number.isInteger(seat)) throw new AppError('BAD_REQUEST', 'seat must be an integer')
    const viewingSeat = seat as number

    const db = serviceClient()

    const { data: match, error: matchErr } = await db
      .from('matches')
      .select('id, status, created_by')
      .eq('id', matchId)
      .maybeSingle()
    if (matchErr) throw new AppError('INTERNAL', matchErr.message)
    if (!match) throw new AppError('NOT_FOUND', 'No such match')
    // Only the match creator may grant spectator access (the "explicitly granted" gate).
    if (match.created_by !== grantorId) {
      throw new AppError('FORBIDDEN', 'Only the match creator may designate spectators')
    }
    // A lobby has no state to spectate; an active or finished match does (§12).
    if (match.status !== 'active' && match.status !== 'finished') {
      throw new AppError('MATCH_STATE', `Match is ${match.status}; nothing to spectate`)
    }

    const { data: seats, error: seatErr } = await db
      .from('match_players')
      .select('seat, user_id')
      .eq('match_id', matchId)
    if (seatErr) throw new AppError('INTERNAL', seatErr.message)
    const rows = seats ?? []

    // The pinned seat must be a real seat in this match.
    if (!rows.some((r) => r.seat === viewingSeat)) {
      throw new AppError('BAD_REQUEST', `Seat ${viewingSeat} does not exist in this match`)
    }
    // A seated player already receives their OWN seat's view from get-player-view, and seat
    // precedence would ignore any spectator grant anyway (a player must never widen their fog
    // by self-granting a spectate seat). Reject the pointless/ambiguous grant outright.
    if (rows.some((r) => r.user_id === userId)) {
      throw new AppError('MATCH_STATE', 'That user already holds a seat in this match')
    }

    const upsert = await db.from('match_spectators').upsert(
      {
        match_id: matchId,
        user_id: userId,
        viewing_seat: viewingSeat,
        granted_by: grantorId,
      },
      { onConflict: 'match_id,user_id' },
    )
    if (upsert.error) {
      // 23503 = FK violation: the grantee has no profile row (not a known user).
      if (upsert.error.code === '23503') throw new AppError('NOT_FOUND', 'No such user')
      throw new AppError('INTERNAL', upsert.error.message)
    }

    return jsonResponse({ matchId, userId, seat: viewingSeat })
  } catch (err) {
    return errorResponse(err)
  }
})
