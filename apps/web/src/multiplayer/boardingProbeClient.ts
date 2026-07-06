import type { BoardCommand, BoardingProbeOutcome, TacticId } from '@aop/engine'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'

/** A `probe-boarding` failure, matching the server's `{ error: { code, message } }` envelope. */
export class BoardingProbeError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'BoardingProbeError'
  }
}

/**
 * Client for the `probe-boarding` Edge Function (#285) — the multiplayer
 * analog of single-player's local `probeBoardingBattle` call
 * (`apps/web/src/boardingPlanner.ts`). A multiplayer client has no
 * `GameState`/`rngState` to simulate a boarding melee against (§7), so this
 * re-simulates the not-yet-committed attack server-side, one recorded
 * command at a time, exactly like the single-player probe loop drives
 * `BoardingCommandSheet`. Plain `fetch`, matching every other multiplayer
 * client module (see `matchActionClient.ts`); this call is read-only — it
 * never advances the match, so it needs no `expectedSeq` token.
 */
export class BoardingProbeClient {
  private readonly url: string
  private readonly anonKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
    this.url = config.url.replace(/\/$/, '')
    this.anonKey = config.anonKey
    this.fetchImpl = fetchImpl
  }

  async probe(
    session: AuthSession,
    params: {
      matchId: string
      captainId: string
      targetCaptainId: string
      attackerOrders?: TacticId[]
      commands: BoardCommand[]
    },
  ): Promise<BoardingProbeOutcome> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.url}/functions/v1/probe-boarding`, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      })
    } catch {
      throw new BoardingProbeError('Could not reach the server. Check your connection.')
    }

    const json = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string }
    }
    if (!res.ok) {
      throw new BoardingProbeError(
        json.error?.message ?? `Request failed (${res.status}).`,
        json.error?.code,
      )
    }
    return json as unknown as BoardingProbeOutcome
  }
}
