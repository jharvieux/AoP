import { describe, expect, it, vi } from 'vitest'
import type { PlayerView } from '@aop/engine'
import { submitApproachAndEngage } from './approachAndEngage'
import { MatchActionError } from './matchActionClient'

const MOVE = {
  type: 'moveCaptain',
  playerId: 'seat-0',
  captainId: 'cap-own',
  to: { x: 2, y: 1 },
} as const
const ATTACK = {
  type: 'attackCaptain',
  playerId: 'seat-0',
  captainId: 'cap-own',
  targetCaptainId: 'cap-enemy',
} as const
const VIEW = { viewerId: 'seat-0' } as unknown as PlayerView

describe('submitApproachAndEngage (#414 — sequencing a same-turn approach + attack)', () => {
  it('submits the move, then the follow-up against the seq the move produced', async () => {
    const submit = vi
      .fn()
      .mockResolvedValueOnce({ seq: 5, view: VIEW })
      .mockResolvedValueOnce({ seq: 6, view: VIEW })
    const refetch = vi.fn()
    const buildFollowUp = vi.fn().mockReturnValue(ATTACK)

    const outcome = await submitApproachAndEngage({ submit, refetch, buildFollowUp }, 4, MOVE)

    expect(outcome).toEqual({
      kind: 'ok',
      move: { seq: 5, view: VIEW },
      followUp: { seq: 6, view: VIEW },
    })
    expect(submit).toHaveBeenNthCalledWith(1, 4, MOVE)
    expect(submit).toHaveBeenNthCalledWith(2, 5, ATTACK)
    expect(buildFollowUp).toHaveBeenCalledWith(VIEW)
  })

  it('never submits the follow-up when buildFollowUp rejects the fresh post-move view', async () => {
    const submit = vi.fn().mockResolvedValueOnce({ seq: 5, view: VIEW })
    const refetch = vi.fn()
    const buildFollowUp = vi.fn().mockReturnValue(null)

    const outcome = await submitApproachAndEngage({ submit, refetch, buildFollowUp }, 4, MOVE)

    expect(outcome).toEqual({ kind: 'followUpSkipped', move: { seq: 5, view: VIEW } })
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('reports moveFailed and never calls buildFollowUp when the move itself is rejected', async () => {
    const err = new MatchActionError('Not enough movement', 'INVALID_ACTION')
    const submit = vi.fn().mockRejectedValueOnce(err)
    const refetch = vi.fn()
    const buildFollowUp = vi.fn()

    const outcome = await submitApproachAndEngage({ submit, refetch, buildFollowUp }, 4, MOVE)

    expect(outcome).toEqual({ kind: 'moveFailed', outcome: { kind: 'error', error: err } })
    expect(buildFollowUp).not.toHaveBeenCalled()
  })

  it('reports moveFailed as stale after a conflict survives the retry — the ship never sails', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new MatchActionError('stale', 'SEQ_CONFLICT'))
      .mockRejectedValueOnce(new MatchActionError('stale again', 'SEQ_CONFLICT'))
    const refetch = vi.fn().mockResolvedValueOnce({ seq: 8, view: VIEW })
    const buildFollowUp = vi.fn()

    const outcome = await submitApproachAndEngage({ submit, refetch, buildFollowUp }, 4, MOVE)

    expect(outcome).toEqual({ kind: 'moveFailed', outcome: { kind: 'stale' } })
    expect(buildFollowUp).not.toHaveBeenCalled()
  })

  it('reports followUpFailed when the move lands but the attack is rejected — the ship has still moved', async () => {
    const attackErr = new MatchActionError('Target out of range', 'INVALID_ACTION')
    const submit = vi
      .fn()
      .mockResolvedValueOnce({ seq: 5, view: VIEW })
      .mockRejectedValueOnce(attackErr)
    const refetch = vi.fn()
    const buildFollowUp = vi.fn().mockReturnValue(ATTACK)

    const outcome = await submitApproachAndEngage({ submit, refetch, buildFollowUp }, 4, MOVE)

    expect(outcome).toEqual({
      kind: 'followUpFailed',
      move: { seq: 5, view: VIEW },
      outcome: { kind: 'error', error: attackErr },
    })
  })

  it('retries the follow-up once on its own SEQ_CONFLICT before giving up', async () => {
    const submit = vi
      .fn()
      .mockResolvedValueOnce({ seq: 5, view: VIEW }) // move
      .mockRejectedValueOnce(new MatchActionError('stale', 'SEQ_CONFLICT')) // attack, first try
      .mockResolvedValueOnce({ seq: 9, view: VIEW }) // attack, retried
    const refetch = vi.fn().mockResolvedValueOnce({ seq: 8, view: VIEW })
    const buildFollowUp = vi.fn().mockReturnValue(ATTACK)

    const outcome = await submitApproachAndEngage({ submit, refetch, buildFollowUp }, 4, MOVE)

    expect(outcome).toEqual({
      kind: 'ok',
      move: { seq: 5, view: VIEW },
      followUp: { seq: 9, view: VIEW },
    })
    expect(submit).toHaveBeenNthCalledWith(3, 8, ATTACK)
  })
})
