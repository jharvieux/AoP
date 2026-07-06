// expire-lobbies (#230): POST -> { expired: string[] }. Lobby-TTL janitor: flips any
// match still in 'lobby' after LOBBY_TTL_MS (48h, @aop/shared) to 'abandoned' — the
// status the initial schema's check constraint already allows but nothing previously
// ever set. Companion to create-match's open-lobby cap: the cap bounds how many lobbies
// one creator can have open at once, this sweep bounds how long any lobby stays open,
// so a stale lobby (creator never returns, nobody joins) eventually frees the slot and
// stops cluttering the public match browser (list-open-matches only lists 'lobby' rows).
//
// Idempotent and safe to run concurrently with itself or with join-match/start-match:
// the UPDATE is scoped to status = 'lobby' AND created_at older than the cutoff, so a
// match a player joins or starts in the same window simply no longer matches the WHERE
// clause by the time this runs (or the human path's own status flip already moved it
// off 'lobby' first — either way, no lost update).
//
// Cron-invoked via pg_cron + pg_net (20260705000000_cron_schedules.sql's
// invoke_maintenance_function), same service-role-gated shape as sweep-turns/#130.

import { requireServiceRole, serviceClient } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { LOBBY_TTL_MS } from '@aop/shared'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    requireServiceRole(req)
    const db = serviceClient()

    const cutoff = new Date(Date.now() - LOBBY_TTL_MS).toISOString()
    const { data, error } = await db
      .from('matches')
      .update({ status: 'abandoned' })
      .eq('status', 'lobby')
      .lt('created_at', cutoff)
      .select('id')
    if (error) throw new AppError('INTERNAL', error.message)

    return jsonResponse({ expired: (data ?? []).map((row) => row.id) })
  } catch (err) {
    return errorResponse(err)
  }
})
