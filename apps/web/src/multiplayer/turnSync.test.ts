import { describe, expect, it, vi } from 'vitest'
import {
  canReclaimSeat,
  nextMissedTurnStatus,
  reclaimSeatUpdate,
  turnBroadcastPayload,
} from '@aop/shared'
import { subscribeTurnSync, type TurnPokeTransport } from './turnSync'

/** A fake Realtime transport: captures the channel + handler so a test can push pokes. */
function fakeTransport() {
  let handler: ((payload: unknown) => void) | undefined
  let subscribedChannel: string | undefined
  const unsubscribe = vi.fn()
  const transport: TurnPokeTransport = {
    subscribe(channel, onPoke) {
      subscribedChannel = channel
      handler = onPoke
      return unsubscribe
    },
  }
  return {
    transport,
    unsubscribe,
    push: (payload: unknown) => handler?.(payload),
    get channel() {
      return subscribedChannel
    },
  }
}

describe('turnBroadcastPayload (§7 leak-audit: sequence number only, never state)', () => {
  it('produces exactly { type, seq } and nothing else', () => {
    const payload = turnBroadcastPayload(42)
    expect(payload).toEqual({ type: 'turn', seq: 42 })
    expect(Object.keys(payload).sort()).toEqual(['seq', 'type'])
  })

  it('carries no game-state field for any seq', () => {
    for (const seq of [0, 1, 7, 9999]) {
      const payload = turnBroadcastPayload(seq) as unknown as Record<string, unknown>
      expect(payload.state).toBeUndefined()
      expect(Object.keys(payload)).not.toContain('state')
    }
  })
})

describe('subscribeTurnSync (#131 client turn-advance refetch)', () => {
  it('subscribes to the match channel and refetches on a valid turn poke', () => {
    const t = fakeTransport()
    const onTurn = vi.fn()
    subscribeTurnSync({ matchId: 'm1', transport: t.transport, onTurn })

    expect(t.channel).toBe('match:m1')
    t.push(turnBroadcastPayload(3))
    expect(onTurn).toHaveBeenCalledExactlyOnceWith(3)
  })

  it('ignores malformed or non-turn payloads', () => {
    const t = fakeTransport()
    const onTurn = vi.fn()
    subscribeTurnSync({ matchId: 'm1', transport: t.transport, onTurn })

    t.push(null)
    t.push({ type: 'chat', seq: 1 })
    t.push({ type: 'turn' }) // missing seq
    t.push({ type: 'turn', seq: 'nope' })
    expect(onTurn).not.toHaveBeenCalled()
  })

  it('never forwards state smuggled onto a poke — only the numeric seq reaches the caller', () => {
    const t = fakeTransport()
    const received: unknown[] = []
    subscribeTurnSync({
      matchId: 'm1',
      transport: t.transport,
      onTurn: (seq) => {
        received.push(seq)
      },
    })

    t.push({ type: 'turn', seq: 5, state: { secret: 'fog-of-war' } })
    expect(received).toEqual([5])
    expect(received[0]).toBe(5)
    expect(typeof received[0]).toBe('number')
  })

  it('refetches only on strictly increasing seq (duplicate/late pokes are harmless)', () => {
    const t = fakeTransport()
    const onTurn = vi.fn()
    subscribeTurnSync({ matchId: 'm1', transport: t.transport, onTurn })

    t.push(turnBroadcastPayload(1))
    t.push(turnBroadcastPayload(1)) // duplicate
    t.push(turnBroadcastPayload(0)) // late/out-of-order
    t.push(turnBroadcastPayload(2))
    expect(onTurn.mock.calls).toEqual([[1], [2]])
  })

  it('returns the transport unsubscribe handle', () => {
    const t = fakeTransport()
    const stop = subscribeTurnSync({ matchId: 'm1', transport: t.transport, onTurn: vi.fn() })
    stop()
    expect(t.unsubscribe).toHaveBeenCalledOnce()
  })
})

describe('nextMissedTurnStatus (§8 ACTIVE → SKIPPED → AI_TAKEOVER)', () => {
  it('increments missed turns without takeover below the threshold', () => {
    expect(nextMissedTurnStatus(0, 3)).toEqual({ missedTurns: 1, aiTakeover: false })
    expect(nextMissedTurnStatus(1, 3)).toEqual({ missedTurns: 2, aiTakeover: false })
  })

  it('flips to ai_takeover once the missed count reaches the threshold', () => {
    expect(nextMissedTurnStatus(2, 3)).toEqual({ missedTurns: 3, aiTakeover: true })
    expect(nextMissedTurnStatus(5, 3)).toEqual({ missedTurns: 6, aiTakeover: true })
  })

  it('takes over immediately when the threshold is 1', () => {
    expect(nextMissedTurnStatus(0, 1)).toEqual({ missedTurns: 1, aiTakeover: true })
  })
})

describe('seat reclaim (#134, §8: a returning human flips back to active)', () => {
  it('resets the seat: status flips to active and missed_turns zeroes', () => {
    const update = reclaimSeatUpdate()
    expect(update.status).toBe('active')
    expect(update.missed_turns).toBe(0)
  })

  it('allows reclaim from every non-terminal status, and never from a terminal one', () => {
    for (const status of ['active', 'skipped', 'ai_takeover']) {
      expect(canReclaimSeat(status)).toBe(true)
    }
    for (const status of ['eliminated', 'resigned']) {
      expect(canReclaimSeat(status)).toBe(false)
    }
  })

  it('treats a missing seat status as reclaimable (guarded elsewhere, never terminal)', () => {
    expect(canReclaimSeat(null)).toBe(true)
    expect(canReclaimSeat(undefined)).toBe(true)
  })
})
