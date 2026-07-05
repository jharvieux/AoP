// reclaim-seat (docs/MULTIPLAYER.md §8, #134): POST { matchId } -> { seat }. A returning
// human flips their own seat from ai_takeover back to active and zeroes missed_turns —
// always allowed (§8: "the mechanism protects the other seven players, it doesn't punish
// the returner"). This has to be its own endpoint: the AI auto-play loop (#133) ends an
// ai_takeover seat's turn inside the *prior* player's submit-action transaction, so the
// returning human never gets a natural submit-action window to act their way back in.

import { canReclaimSeat, reclaimSeatUpdate } from '@aop/shared'
import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { callerSeat } from '../_shared/match.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const { matchId } = (await req.json().catch(() => ({}))) as { matchId?: string }
    if (!matchId) throw new AppError('BAD_REQUEST', 'matchId is required')

    const db = serviceClient()
    const seat = await callerSeat(db, matchId, userId)

    const { data: row, error: seatErr } = await db
      .from('match_players')
      .select('status')
      .eq('match_id', matchId)
      .eq('seat', seat)
      .maybeSingle()
    if (seatErr) throw new AppError('INTERNAL', seatErr.message)
    if (!canReclaimSeat(row?.status)) {
      throw new AppError('MATCH_STATE', `Seat is ${row?.status}; cannot reclaim`)
    }

    const { error } = await db
      .from('match_players')
      .update({ ...reclaimSeatUpdate(), last_seen_at: new Date().toISOString() })
      .eq('match_id', matchId)
      .eq('seat', seat)
    if (error) throw new AppError('INTERNAL', error.message)

    return jsonResponse({ seat })
  } catch (err) {
    return errorResponse(err)
  }
})
