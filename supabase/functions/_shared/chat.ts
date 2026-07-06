// Per-match chat write path (#139, docs/MULTIPLAYER.md §11/§14). The single
// choke point where a client message is validated and persisted. Mirrors the
// authority model of the action pipeline: the author's seat comes from the JWT
// (callerSeat, resolved by the caller), never from the request body, and the
// channel stays listen-only for clients — they only ever SELECT match_chat under
// RLS; every write goes through here on the service role.

import { chatBroadcastPayload, normalizeChatBody, type ChatChannel } from '@aop/shared'
import { AppError } from './http.ts'
import type { Db } from './client.ts'

/** Anti-spam window: at most {@link CHAT_RATE_MAX} messages per seat per match in this many ms. */
const CHAT_RATE_WINDOW_MS = 10_000
const CHAT_RATE_MAX = 5

interface ChatMatchRow {
  status: string
}

async function loadChatMatch(db: Db, matchId: string): Promise<ChatMatchRow> {
  const { data, error } = await db.from('matches').select('status').eq('id', matchId).maybeSingle()
  if (error) throw new AppError('INTERNAL', error.message)
  if (!data) throw new AppError('NOT_FOUND', 'No such match')
  return data as ChatMatchRow
}

/** The seat's current alliance-cluster id (mirrored from the engine by #140), or null. */
async function seatAllianceId(db: Db, matchId: string, seat: number): Promise<number | null> {
  const { data, error } = await db
    .from('match_players')
    .select('alliance_id')
    .eq('match_id', matchId)
    .eq('seat', seat)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', error.message)
  if (!data) throw new AppError('FORBIDDEN', 'You do not hold a seat in this match')
  return data.alliance_id
}

/** Reject once a seat has sent {@link CHAT_RATE_MAX} messages inside the sliding window. */
async function enforceRateLimit(db: Db, matchId: string, seat: number): Promise<void> {
  const since = new Date(Date.now() - CHAT_RATE_WINDOW_MS).toISOString()
  const { count, error } = await db
    .from('match_chat')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', matchId)
    .eq('seat', seat)
    .gte('created_at', since)
  if (error) throw new AppError('INTERNAL', error.message)
  if ((count ?? 0) >= CHAT_RATE_MAX) {
    throw new AppError('RATE_LIMITED', 'You are sending messages too quickly')
  }
}

/**
 * Post-commit Realtime poke (§6 pattern) on `match:{id}`. Best effort, exactly
 * like {@link broadcastTurn}: a dropped poke just means a client waits for its
 * next chat refetch. Carries only the new message's id — never the body or
 * channel (§7 leak-audit), so it is safe to emit to every seat regardless of
 * whether the message was an alliance-private one. The channel is private
 * (#228) — see {@link broadcastTurn}'s doc for the authorization model.
 */
export async function broadcastChat(db: Db, matchId: string, id: number): Promise<void> {
  const status = await db.channel(`match:${matchId}`, { config: { private: true } }).send({
    type: 'broadcast',
    event: 'chat',
    payload: chatBroadcastPayload(id),
  })
  if (status !== 'ok') {
    console.error(`Chat broadcast for match ${matchId} (id ${id}) returned ${status}`)
  }
}

/**
 * Persist one chat message from `seat` (already JWT-derived by the caller).
 * Validates match state, body length, and rate limit, resolves the alliance
 * cluster for an alliance-channel message, inserts, and pokes the match channel.
 * Returns the new row id.
 */
export async function sendChat(
  db: Db,
  matchId: string,
  seat: number,
  channel: ChatChannel,
  rawBody: unknown,
): Promise<number> {
  const match = await loadChatMatch(db, matchId)
  // Chat is per-match from match start (§14): no lobby chat, nothing once over.
  if (match.status !== 'active') throw new AppError('MATCH_STATE', `Match is ${match.status}`)

  const normalized = normalizeChatBody(rawBody)
  if (!normalized.ok) throw new AppError('BAD_REQUEST', normalized.reason)

  await enforceRateLimit(db, matchId, seat)

  let allianceId: number | null = null
  if (channel === 'alliance') {
    allianceId = await seatAllianceId(db, matchId, seat)
    if (allianceId === null) throw new AppError('FORBIDDEN', 'You are not in an alliance')
  }

  const { data, error } = await db
    .from('match_chat')
    .insert({ match_id: matchId, seat, channel, alliance_id: allianceId, body: normalized.body })
    .select('id')
    .single()
  if (error) throw new AppError('INTERNAL', error.message)

  await broadcastChat(db, matchId, data.id)
  return data.id
}
