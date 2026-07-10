import type { BoardCommand, TacticId } from '@aop/engine'
import type { BattleAutoResult, BattleOrder, BattleSessionOutcome } from './battleSessionClient'

/**
 * Transport the flow drives, already bound to a session + matchId (the same DI shape
 * `submitApproachAndEngage` uses — #414). Keeping the flow auth-agnostic lets it be
 * unit-tested against a mocked server, exactly like `approachAndEngage.test.ts`.
 */
export interface BattleFlowDeps {
  open(params: {
    expectedSeq: number
    captainId: string
    targetCaptainId: string
  }): Promise<{ seq: number; outcome: BattleSessionOutcome }>
  round(params: {
    expectedOrders: number
    order: BattleOrder
  }): Promise<{ outcome: BattleSessionOutcome }>
  auto(): Promise<BattleAutoResult>
  context(): Promise<{ outcome: BattleSessionOutcome }>
}

/**
 * Drives a multiplayer interactive battle (Tactical naval + boarding melee) from the
 * attacker seat, round by round, over the #408 battle-session endpoints — the transport
 * half of #409. It holds NO `GameState` and never predicts an outcome (the server withholds
 * `rngState`, the anti-cheat boundary): every pick is one round trip that returns the engine's
 * own next decision context (`awaitingTactic`/`awaitingCommand`) or the resolution. The two
 * sheets (`TacticalRoundSheet`/`BoardingCommandSheet`) render straight from that context, the
 * same engine views single-player's probe feeds them — transport wiring, not redesign.
 *
 * The only bookkeeping is the per-side `expectedOrders` CAS token: the count of tactics /
 * commands this seat has already recorded. Tracked here so a rapid double-tap collides on the
 * server (`ORDERS_CONFLICT`) instead of silently reordering — the server-side fix for the
 * #293 client race (docs/design/multiplayer-tactical-probe.md §3).
 *
 * The live two-seat simultaneity UX (a blind interactive DEFENDER, `awaitingCounterpart`) is
 * #422; this driver is the attacker's flow, plus resume-on-reconnect and the auto-fight button.
 */
export class BattleSessionFlow {
  private tacticsRecorded = 0
  private commandsRecorded = 0
  /** The latest outcome to render, or `null` before {@link open}/{@link resume}. */
  outcome: BattleSessionOutcome | null = null

  constructor(private readonly deps: BattleFlowDeps) {}

  /** Whether the battle has resolved (nothing left to render). */
  get resolved(): boolean {
    return this.outcome?.kind === 'resolved'
  }

  private adopt(outcome: BattleSessionOutcome): BattleSessionOutcome {
    // Reconnecting into a naval round tells us exactly how many tactics were recorded
    // (`ctx.round` is 1-based), so the next CAS token is correct without any local memory.
    if (outcome.kind === 'awaitingTactic') this.tacticsRecorded = outcome.ctx.round - 1
    this.outcome = outcome
    return outcome
  }

  /** Open the binding session for this attack; returns the round-1 context to render. */
  async open(
    expectedSeq: number,
    captainId: string,
    targetCaptainId: string,
  ): Promise<BattleSessionOutcome> {
    const { outcome } = await this.deps.open({ expectedSeq, captainId, targetCaptainId })
    return this.adopt(outcome)
  }

  /** Reconnect: fetch the current caller-side context without recording anything. */
  async resume(): Promise<BattleSessionOutcome> {
    const { outcome } = await this.deps.context()
    return this.adopt(outcome)
  }

  /** Record the naval tactic picked for the current round; returns the next context. */
  async chooseTactic(tactic: TacticId): Promise<BattleSessionOutcome> {
    const { outcome } = await this.deps.round({
      expectedOrders: this.tacticsRecorded,
      order: { tactic },
    })
    this.tacticsRecorded += 1
    this.outcome = outcome
    return outcome
  }

  /** Record the melee command for the current activation; returns the next context. */
  async command(boardCommand: BoardCommand): Promise<BattleSessionOutcome> {
    const { outcome } = await this.deps.round({
      expectedOrders: this.commandsRecorded,
      order: { boardCommand },
    })
    this.commandsRecorded += 1
    this.outcome = outcome
    return outcome
  }

  /** Auto-fight: force-resolve from the orders recorded so far (the escape hatch). */
  async autoResolve(): Promise<BattleAutoResult> {
    const result = await this.deps.auto()
    this.outcome = { kind: 'resolved', ...result }
    return result
  }
}
