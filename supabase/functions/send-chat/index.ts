// send-chat (#139, docs/MULTIPLAYER.md §11/§14): POST { matchId, channel, body } ->
// { id }. The chat write path. The caller's seat is derived from their JWT
// (never trusted from the body), matching submit-action's forged-action
// mitigation (§11); clients only ever read match_chat under RLS, so the channel
// stays listen-only for them.

import { isChatChannel } from '@aop/shared'
import { serviceClient, requireUserId } from '../_shared/client.ts'
import { AppError, errorResponse, guardMethod, jsonResponse } from '../_shared/http.ts'
import { sendChat } from '../_shared/chat.ts'
import { callerSeat } from '../_shared/match.ts'

Deno.serve(async (req) => {
  const preflight = guardMethod(req)
  if (preflight) return preflight
  try {
    const userId = await requireUserId(req)
    const body = (await req.json().catch(() => ({}))) as {
      matchId?: string
      channel?: unknown
      body?: unknown
    }
    if (!body.matchId) throw new AppError('BAD_REQUEST', 'matchId is required')
    if (!isChatChannel(body.channel))
      throw new AppError('BAD_REQUEST', "channel must be 'all' or 'alliance'")

    const db = serviceClient()
    const seat = await callerSeat(db, body.matchId, userId)
    const id = await sendChat(db, body.matchId, seat, body.channel, body.body)
    return jsonResponse({ id })
  } catch (err) {
    return errorResponse(err)
  }
})
