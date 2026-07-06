/**
 * Offline turn-notification email (#132, docs/MULTIPLAYER.md §6): the pure
 * offline-gating and request-construction logic behind emailing the new
 * current player when it becomes their turn and they haven't been seen for
 * 15+ minutes. Sibling of `push.ts` (#158) with the same split: everything
 * here is Web-standard-only and pure, so it runs unchanged under Deno (the
 * Edge Functions, via the `@aop/shared/email` entry in
 * `supabase/functions/deno.json`) and under Node/Vitest
 * (`apps/web/src/multiplayer/turnEmail.test.ts`). The I/O — reading
 * `match_players.last_seen_at`, resolving the recipient's address from
 * `auth.users`, reading `RESEND_API_KEY`, the actual `fetch` — lives in the
 * Deno-only wrapper `supabase/functions/_shared/email.ts`.
 *
 * Deliberately NOT re-exported from `@aop/shared`'s barrel, same as `push.ts`
 * and `stripe.ts`: only the Edge Functions and their tests reach for this
 * module, via its explicit path.
 *
 * The transport is Resend's plain REST API (`POST /emails`) driven by
 * `fetch` — deliberately no `resend` npm package: new runtime dependencies
 * are an explicit-permission item (CLAUDE.md), and the whole surface used
 * here is one JSON POST.
 */

/** §6: a player unseen for this long counts as offline and gets the email. */
export const OFFLINE_EMAIL_THRESHOLD_MS = 15 * 60 * 1000

/**
 * Whether `lastSeenAt` (ISO timestamp from `match_players.last_seen_at`, or
 * null) means the player should be emailed rather than trusted to catch the
 * Realtime poke. Null and unparseable both count as offline — a player who
 * has never been seen is exactly who needs the nudge, and a malformed
 * timestamp must fail toward notifying, not toward silence.
 */
export function isOfflineForEmail(
  lastSeenAt: string | null,
  nowMs: number,
  thresholdMs: number = OFFLINE_EMAIL_THRESHOLD_MS,
): boolean {
  if (!lastSeenAt) return true
  const seenMs = Date.parse(lastSeenAt)
  if (Number.isNaN(seenMs)) return true
  return nowMs - seenMs >= thresholdMs
}

export interface TurnEmailParams {
  /** Recipient address, resolved server-side from `auth.users` — contact data never rides a player view. */
  to: string
  /** Verified sender, e.g. `Age of Plunder <notifications@yourdomain.dev>`. */
  from: string
  matchId: string
  /** The seat number now on the clock (the recipient's own seat). */
  seat: number
}

export interface EmailRequest {
  url: string
  headers: Record<string, string>
  body: string
}

/**
 * Shape the Resend `POST /emails` request for one "your turn" email. Pure so
 * the exact wire shape is unit-testable; the body carries the match id and
 * nothing about the game state (§7 leak-audit: an email is even less trusted
 * than a Realtime poke, so it gets no more information than one).
 */
export function buildTurnEmailRequest(params: TurnEmailParams, apiKey: string): EmailRequest {
  return {
    url: 'https://api.resend.com/emails',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: 'Your turn in Age of Plunder',
      text:
        `It is your move in match ${params.matchId}.\n\n` +
        `Open Age of Plunder to take your turn before the timer runs out ` +
        `and your turn is skipped.\n`,
    }),
  }
}

export interface EmailSendResult {
  ok: boolean
  status?: number
  error?: string
}

/**
 * Send one pre-built email request. Never throws — a network error or a
 * non-2xx response resolves to `{ ok: false }` so the caller
 * (`dispatchTurnEmail` in the Deno wrapper) can log and move on: a mail
 * failure must never fail the turn that triggered it.
 */
export async function sendEmail(
  fetchImpl: typeof fetch,
  request: EmailRequest,
): Promise<EmailSendResult> {
  try {
    const res = await fetchImpl(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: text.slice(0, 500) }
    }
    return { ok: true, status: res.status }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
