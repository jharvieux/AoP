import { describe, expect, it, vi } from 'vitest'
// The pure offline-gating and request-shape logic behind #132's turn-
// notification email (see supabase/functions/_shared/email.ts, which imports
// it via @aop/shared/email). Imported by explicit path for the same reason
// turnPush.test.ts imports @aop/shared/push that way: deliberately not
// re-exported from @aop/shared's barrel.
import {
  OFFLINE_EMAIL_THRESHOLD_MS,
  buildTurnEmailRequest,
  isOfflineForEmail,
  sendEmail,
} from '../../../../packages/shared/src/email'

const NOW = Date.parse('2026-07-06T12:00:00.000Z')

const seenAgo = (ms: number) => new Date(NOW - ms).toISOString()

describe('isOfflineForEmail (#132: the §6 15-minute gate)', () => {
  it('emails a player last seen longer than the threshold ago', () => {
    expect(isOfflineForEmail(seenAgo(OFFLINE_EMAIL_THRESHOLD_MS + 1), NOW)).toBe(true)
  })

  it('emails exactly at the threshold boundary', () => {
    expect(isOfflineForEmail(seenAgo(OFFLINE_EMAIL_THRESHOLD_MS), NOW)).toBe(true)
  })

  it('does not email a recently-seen player (the Realtime poke suffices)', () => {
    expect(isOfflineForEmail(seenAgo(OFFLINE_EMAIL_THRESHOLD_MS - 1), NOW)).toBe(false)
    expect(isOfflineForEmail(seenAgo(0), NOW)).toBe(false)
  })

  it('treats a never-seen player (null) as offline — they need the nudge most', () => {
    expect(isOfflineForEmail(null, NOW)).toBe(true)
  })

  it('fails toward notifying on an unparseable timestamp', () => {
    expect(isOfflineForEmail('garbage', NOW)).toBe(true)
  })
})

describe('buildTurnEmailRequest (#132: exact Resend wire shape)', () => {
  const request = buildTurnEmailRequest(
    {
      to: 'pirate@example.com',
      from: 'Age of Plunder <notify@example.dev>',
      matchId: 'match-123',
      seat: 2,
    },
    'sk-test-key',
  )

  it('POSTs to the Resend emails endpoint with bearer auth', () => {
    expect(request.url).toBe('https://api.resend.com/emails')
    expect(request.headers.Authorization).toBe('Bearer sk-test-key')
    expect(request.headers['Content-Type']).toBe('application/json')
  })

  it('addresses the configured sender and single recipient', () => {
    const body = JSON.parse(request.body) as Record<string, unknown>
    expect(body.from).toBe('Age of Plunder <notify@example.dev>')
    expect(body.to).toEqual(['pirate@example.com'])
  })

  it('carries the match id and no game state (§7: no more than the poke gets)', () => {
    const body = JSON.parse(request.body) as { subject: string; text: string }
    expect(body.subject).toContain('Your turn')
    expect(body.text).toContain('match-123')
    // The whole payload is from/to/subject/text — nothing else rides along.
    expect(Object.keys(JSON.parse(request.body) as object).sort()).toEqual([
      'from',
      'subject',
      'text',
      'to',
    ])
  })
})

describe('sendEmail (never throws — a mail failure must never fail a turn)', () => {
  const request = buildTurnEmailRequest(
    { to: 'a@b.c', from: 'x@y.z', matchId: 'm', seat: 0 },
    'key',
  )

  it('resolves ok on a 2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"id":"e_1"}', { status: 200 }))
    await expect(sendEmail(fetchImpl as typeof fetch, request)).resolves.toEqual({
      ok: true,
      status: 200,
    })
    expect(fetchImpl).toHaveBeenCalledWith(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    })
  })

  it('resolves not-ok (with the response text) on a non-2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }))
    await expect(sendEmail(fetchImpl as typeof fetch, request)).resolves.toEqual({
      ok: false,
      status: 429,
      error: 'rate limited',
    })
  })

  it('resolves not-ok instead of throwing on a network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('connection refused'))
    await expect(sendEmail(fetchImpl as typeof fetch, request)).resolves.toEqual({
      ok: false,
      error: 'connection refused',
    })
  })
})
