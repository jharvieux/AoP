import { describe, expect, it, vi } from 'vitest'
import type { PlayerView } from '@aop/engine'
import { MatchActionError } from './matchActionClient'
import { submitActionWithRetry } from './submitWithRetry'

const ACTION = { type: 'endTurn', playerId: 'seat-0' } as const
const VIEW = { viewerId: 'seat-0' } as unknown as PlayerView

describe('submitActionWithRetry (#285 optimistic retry on conflict)', () => {
  it('resolves ok on a plain success — no refetch, no retry', async () => {
    const submit = vi.fn().mockResolvedValueOnce({ seq: 5, view: VIEW })
    const refetch = vi.fn()

    const outcome = await submitActionWithRetry({ submit, refetch }, 4, ACTION)

    expect(outcome).toEqual({ kind: 'ok', result: { seq: 5, view: VIEW } })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith(4, ACTION)
    expect(refetch).not.toHaveBeenCalled()
  })

  it('refetches and retries once against the fresh seq on SEQ_CONFLICT, then succeeds', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new MatchActionError('stale', 'SEQ_CONFLICT'))
      .mockResolvedValueOnce({ seq: 9, view: VIEW })
    const refetch = vi.fn().mockResolvedValueOnce({ seq: 8, view: VIEW })

    const outcome = await submitActionWithRetry({ submit, refetch }, 4, ACTION)

    expect(outcome).toEqual({ kind: 'ok', result: { seq: 9, view: VIEW } })
    expect(submit).toHaveBeenNthCalledWith(1, 4, ACTION)
    expect(submit).toHaveBeenNthCalledWith(2, 8, ACTION)
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('treats NOT_YOUR_TURN the same as SEQ_CONFLICT', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new MatchActionError('not your turn', 'NOT_YOUR_TURN'))
      .mockResolvedValueOnce({ seq: 9, view: VIEW })
    const refetch = vi.fn().mockResolvedValueOnce({ seq: 8, view: VIEW })

    const outcome = await submitActionWithRetry({ submit, refetch }, 4, ACTION)
    expect(outcome.kind).toBe('ok')
  })

  it('gives up as stale — never a third attempt — after a second conflict', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new MatchActionError('stale', 'SEQ_CONFLICT'))
      .mockRejectedValueOnce(new MatchActionError('stale again', 'SEQ_CONFLICT'))
    const refetch = vi.fn().mockResolvedValueOnce({ seq: 8, view: VIEW })

    const outcome = await submitActionWithRetry({ submit, refetch }, 4, ACTION)

    expect(outcome).toEqual({ kind: 'stale' })
    expect(submit).toHaveBeenCalledTimes(2)
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('resolves stale without a retry attempt when refetch comes back empty (seat/match gone)', async () => {
    const submit = vi.fn().mockRejectedValueOnce(new MatchActionError('stale', 'SEQ_CONFLICT'))
    const refetch = vi.fn().mockResolvedValueOnce(null)

    const outcome = await submitActionWithRetry({ submit, refetch }, 4, ACTION)

    expect(outcome).toEqual({ kind: 'stale' })
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('never retries a non-stale rejection (e.g. INVALID_ACTION)', async () => {
    const err = new MatchActionError('Not enough movement', 'INVALID_ACTION')
    const submit = vi.fn().mockRejectedValueOnce(err)
    const refetch = vi.fn()

    const outcome = await submitActionWithRetry({ submit, refetch }, 4, ACTION)

    expect(outcome).toEqual({ kind: 'error', error: err })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(refetch).not.toHaveBeenCalled()
  })

  it('surfaces a retry that fails with a real error (not another conflict) as error', async () => {
    const retryErr = new MatchActionError('Not enough movement', 'INVALID_ACTION')
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new MatchActionError('stale', 'SEQ_CONFLICT'))
      .mockRejectedValueOnce(retryErr)
    const refetch = vi.fn().mockResolvedValueOnce({ seq: 8, view: VIEW })

    const outcome = await submitActionWithRetry({ submit, refetch }, 4, ACTION)

    expect(outcome).toEqual({ kind: 'error', error: retryErr })
  })
})
