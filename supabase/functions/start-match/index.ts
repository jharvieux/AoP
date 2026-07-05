// start-match (docs/MULTIPLAYER.md §5): POST { matchId } -> { seq: 0 }. Creator only.
// Runs createGame from the stored seed/settings, writes the seq-0 snapshot, flips the
// match to `active`, and arms the first turn deadline.

import { createGame } from '@aop/engine'
import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { buildMatchConfig, type SeatConfig } from '../_shared/catalog.ts'
import type { MatchSettings } from '../_shared/match.ts'
import type { FactionId } from '@aop/shared'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const { matchId } = (await req.json().catch(() => ({}))) as { matchId?: string }
    if (!matchId) throw new AppError('BAD_REQUEST', 'matchId is required')

    const db = serviceClient()
    const { data: match, error } = await db
      .from('matches')
      .select('id, status, seed, settings, created_by')
      .eq('id', matchId)
      .maybeSingle()
    if (error) throw new AppError('INTERNAL', error.message)
    if (!match) throw new AppError('NOT_FOUND', 'No such match')
    if (match.created_by !== userId) throw new AppError('FORBIDDEN', 'Only the creator can start')
    if (match.status !== 'lobby') throw new AppError('MATCH_STATE', `Match is ${match.status}`)
    const settings = match.settings as unknown as MatchSettings

    const { data: seats, error: seatErr } = await db
      .from('match_players')
      .select('seat, user_id, faction')
      .eq('match_id', matchId)
      .order('seat', { ascending: true })
    if (seatErr) throw new AppError('INTERNAL', seatErr.message)
    if (!seats || seats.length < 2)
      throw new AppError('MATCH_STATE', 'Need at least 2 seats to start')

    // Seats must be a dense 0..N-1 block so seat index == engine player index.
    seats.forEach((s, i) => {
      if (s.seat !== i) throw new AppError('MATCH_STATE', 'Seats must be contiguous before start')
    })

    const humanIds = seats.map((s) => s.user_id).filter((id): id is string => id !== null)
    const names = new Map<string, string>()
    if (humanIds.length > 0) {
      const { data: profiles } = await db
        .from('profiles')
        .select('id, display_name')
        .in('id', humanIds)
      for (const p of profiles ?? []) names.set(p.id, p.display_name)
    }

    const seatConfigs: SeatConfig[] = seats.map((s) => ({
      seat: s.seat,
      faction: s.faction as FactionId,
      isAI: s.user_id === null,
      displayName: s.user_id ? (names.get(s.user_id) ?? `Seat ${s.seat}`) : `AI ${s.seat}`,
    }))

    const config = buildMatchConfig(Number(match.seed), settings.mapSize, seatConfigs, {
      betrayalReputationPenalty: settings.betrayalReputationPenalty,
      betrayalTruceRounds: settings.betrayalTruceRounds,
    })
    const state = createGame(config)

    const snap = await db
      .from('match_snapshots')
      .insert({ match_id: matchId, seq: 0, state: state as unknown as Record<string, unknown> })
    if (snap.error) throw new AppError('INTERNAL', snap.error.message)

    const deadline = settings.turnTimerSeconds
      ? new Date(Date.now() + settings.turnTimerSeconds * 1000).toISOString()
      : null
    const activate = await db
      .from('matches')
      .update({
        status: 'active',
        action_count: 0,
        turn_deadline: deadline,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId)
      .eq('status', 'lobby')
      .select('id')
    if (activate.error) throw new AppError('INTERNAL', activate.error.message)
    if (!activate.data || activate.data.length === 0) {
      throw new AppError('MATCH_STATE', 'Match was already started')
    }

    return jsonResponse({ seq: 0 })
  } catch (err) {
    return errorResponse(err)
  }
})
