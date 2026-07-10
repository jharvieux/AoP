import type {
  BattleReport,
  BoardActivationView,
  BoardCommand,
  PlayerView,
  TacticContext,
  TacticId,
} from '@aop/engine'
import { isSeqConflict } from '@aop/shared'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { MatchActionError } from './matchActionClient'

/**
 * The per-seat outcome of a battle-session endpoint, mirroring the server's
 * `BattleSessionOutcome` (`supabase/functions/_shared/battleSession.ts`, #408). It carries
 * only the engine's documented symmetric views — a `TacticContext` naval round to pick, a
 * `BoardActivationView` melee activation to command, or the resolution — never `rngState` or
 * the counterpart seat's recorded orders (docs/design/multiplayer-tactical-probe.md §7/§10.6).
 * `recorded` is the defender-seat acknowledgement (its picks count at resolution).
 */
export type BattleSessionOutcome =
  | { kind: 'awaitingTactic'; ctx: TacticContext }
  | { kind: 'awaitingCommand'; view: BoardActivationView }
  | { kind: 'recorded'; tacticOrders: number; boardCommands: number }
  | { kind: 'resolved'; seq: number; view: PlayerView; battleReport: BattleReport }

/** One order a `battle-round` carries: a naval tactic or a boarding melee command. */
export type BattleOrder = { tactic: TacticId } | { boardCommand: BoardCommand }

/** The `battle-auto` resolution — the attacker's own refreshed view + combat report (#285). */
export interface BattleAutoResult {
  seq: number
  view: PlayerView
  battleReport: BattleReport
}

/**
 * Client for the four `battle-*` Edge Functions (#408) — the transport for multiplayer
 * interactive combat. Plain `fetch`, the same shape as {@link
 * import('./matchActionClient').MatchActionClient}: the server holds the in-progress order
 * prefix and re-runs the pure engine probe each round, so the client never needs (or gets)
 * `rngState`. Reuses `MatchActionError` so a stale session surfaces the same `isStale`
 * (`SEQ_CONFLICT`) refetch signal every other write path uses.
 */
export class BattleSessionClient {
  private readonly url: string
  private readonly anonKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
    this.url = config.url.replace(/\/$/, '')
    this.anonKey = config.anonKey
    this.fetchImpl = fetchImpl
  }

  private async post<T>(session: AuthSession, fn: string, body: unknown): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.url}/functions/v1/${fn}`, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch {
      throw new MatchActionError('Could not reach the server. Check your connection.')
    }
    const json = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string }
    }
    if (!res.ok) {
      const code = isSeqConflict(json) ? 'SEQ_CONFLICT' : json.error?.code
      throw new MatchActionError(json.error?.message ?? `Request failed (${res.status}).`, code)
    }
    return json as unknown as T
  }

  /** Open (binding) an interactive battle for an attack the caller is making this turn. */
  open(
    session: AuthSession,
    params: { matchId: string; expectedSeq: number; captainId: string; targetCaptainId: string },
  ): Promise<{ seq: number; outcome: BattleSessionOutcome }> {
    return this.post(session, 'battle-open', params)
  }

  /** Record one order under a per-side length CAS; returns the next per-seat outcome. */
  round(
    session: AuthSession,
    params: { matchId: string; expectedOrders: number; order: BattleOrder },
  ): Promise<{ outcome: BattleSessionOutcome }> {
    return this.post(session, 'battle-round', params)
  }

  /** Attacker escape hatch: force-resolve from the orders recorded so far. */
  auto(session: AuthSession, params: { matchId: string }): Promise<BattleAutoResult> {
    return this.post(session, 'battle-auto', params)
  }

  /** Read the caller-side current outcome (resume-on-reconnect, defender pickup). */
  context(
    session: AuthSession,
    params: { matchId: string },
  ): Promise<{ outcome: BattleSessionOutcome }> {
    return this.post(session, 'battle-context', params)
  }
}
