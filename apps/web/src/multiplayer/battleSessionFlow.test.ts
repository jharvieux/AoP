import { describe, expect, it, vi } from 'vitest'
import type { TacticContext } from '@aop/engine'
import { BattleSessionFlow, type BattleFlowDeps } from './battleSessionFlow'
import type { BattleSessionOutcome } from './battleSessionClient'

/** A TacticContext stub — only `round` and `available` matter to the flow's bookkeeping. */
function ctx(round: number): TacticContext {
  return {
    round,
    ownStrength: 10,
    enemyStrength: 10,
    ownHp: 40,
    enemyHp: 40,
    ownSpeed: 5,
    enemySpeed: 5,
    enemyLastTactic: null,
    available: ['broadside', 'ram', 'evade'],
  }
}

const awaitingTactic = (round: number): BattleSessionOutcome => ({
  kind: 'awaitingTactic',
  ctx: ctx(round),
})
const resolved: BattleSessionOutcome = {
  kind: 'resolved',
  seq: 12,
  view: { viewerId: 'seat-0' } as never,
  battleReport: { winnerId: 'seat-0', rounds: [], escapedId: null } as never,
}

describe('BattleSessionFlow (#409 attacker interactive-combat driver)', () => {
  it('records each tactic under a monotone per-side expectedOrders CAS token (0, 1, 2, …)', async () => {
    // Server script: open -> round 1; each round advances until round 3 resolves.
    const queue: BattleSessionOutcome[] = [awaitingTactic(2), awaitingTactic(3), resolved]
    const deps: BattleFlowDeps = {
      open: vi.fn(async () => ({ seq: 4, outcome: awaitingTactic(1) })),
      round: vi.fn(async () => ({ outcome: queue.shift()! })),
      auto: vi.fn(),
      context: vi.fn(),
    }
    const flow = new BattleSessionFlow(deps)

    const first = await flow.open(4, 'cap-a', 'cap-b')
    expect(first.kind).toBe('awaitingTactic')

    await flow.chooseTactic('broadside')
    await flow.chooseTactic('ram')
    const last = await flow.chooseTactic('evade')

    expect(last).toEqual(resolved)
    expect(flow.resolved).toBe(true)
    // The three rounds carried expectedOrders 0, 1, 2 — the count already recorded each time.
    const calls = (deps.round as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.map((c) => c[0].expectedOrders)).toEqual([0, 1, 2])
    expect(calls.map((c) => c[0].order)).toEqual([
      { tactic: 'broadside' },
      { tactic: 'ram' },
      { tactic: 'evade' },
    ])
  })

  it('tracks board commands on their own CAS counter, independent of the naval tactics', async () => {
    const deps: BattleFlowDeps = {
      open: vi.fn(async () => ({ seq: 4, outcome: awaitingTactic(1) })),
      round: vi
        .fn()
        .mockResolvedValueOnce({ outcome: { kind: 'awaitingCommand', view: {} as never } })
        .mockResolvedValueOnce({ outcome: { kind: 'awaitingCommand', view: {} as never } })
        .mockResolvedValueOnce({ outcome: resolved }),
      auto: vi.fn(),
      context: vi.fn(),
    }
    const flow = new BattleSessionFlow(deps)
    await flow.open(4, 'cap-a', 'cap-b')

    await flow.chooseTactic('board') // one naval tactic, then boarding lands
    await flow.command({ stackId: 0 })
    await flow.command({ stackId: 1 })

    const calls = (deps.round as ReturnType<typeof vi.fn>).mock.calls
    // tactic used token 0; the two commands used their OWN counter 0, 1 (not 1, 2).
    expect(calls.map((c) => c[0].expectedOrders)).toEqual([0, 0, 1])
    expect(calls[1]![0].order).toEqual({ boardCommand: { stackId: 0 } })
  })

  it('autoResolve force-resolves and marks the flow resolved', async () => {
    const auto = {
      seq: 20,
      view: { viewerId: 'seat-0' } as never,
      battleReport: resolved.kind === 'resolved' ? resolved.battleReport : ({} as never),
    }
    const deps: BattleFlowDeps = {
      open: vi.fn(async () => ({ seq: 4, outcome: awaitingTactic(1) })),
      round: vi.fn(),
      auto: vi.fn(async () => auto),
      context: vi.fn(),
    }
    const flow = new BattleSessionFlow(deps)
    await flow.open(4, 'cap-a', 'cap-b')

    const result = await flow.autoResolve()
    expect(result).toEqual(auto)
    expect(flow.outcome).toEqual({ kind: 'resolved', ...auto })
    expect(flow.resolved).toBe(true)
  })

  it('resume derives the tactic CAS token from the reconnected round context', async () => {
    // Reconnect straight into round 4 — three tactics already recorded server-side.
    const deps: BattleFlowDeps = {
      open: vi.fn(),
      round: vi.fn(async () => ({ outcome: resolved })),
      auto: vi.fn(),
      context: vi.fn(async () => ({ outcome: awaitingTactic(4) })),
    }
    const flow = new BattleSessionFlow(deps)

    const out = await flow.resume()
    expect(out.kind).toBe('awaitingTactic')

    await flow.chooseTactic('broadside')
    // The next tactic must claim token 3 (round 4 = three already in), not 0.
    expect((deps.round as ReturnType<typeof vi.fn>).mock.calls[0]![0].expectedOrders).toBe(3)
  })
})
