// Deno tests for `_shared/concurrency.ts`'s bounded map (#570). Run with
//   deno test --import-map supabase/functions/deno.json supabase/functions/_shared/concurrency.test.ts
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { mapWithConcurrency } from './concurrency.ts'

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

Deno.test('mapWithConcurrency: results follow input order regardless of finish order', async () => {
  // Later items resolve sooner (descending delay), so completion order is the
  // reverse of input — the output must still be in input order.
  const out = await mapWithConcurrency([0, 1, 2, 3, 4], 3, async (n) => {
    await new Promise((r) => setTimeout(r, (5 - n) * 5))
    return n * 10
  })
  assertEquals(out, [0, 10, 20, 30, 40])
})

Deno.test('mapWithConcurrency: never exceeds the concurrency width', async () => {
  let inFlight = 0
  let peak = 0
  await mapWithConcurrency(
    Array.from({ length: 12 }, (_, i) => i),
    4,
    async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await tick()
      inFlight--
    },
  )
  assertEquals(peak, 4)
})

Deno.test('mapWithConcurrency: attempts every item even when some reject', async () => {
  const attempted: number[] = []
  await assertRejects(() =>
    mapWithConcurrency([0, 1, 2, 3], 2, async (n) => {
      attempted.push(n)
      await tick()
      if (n === 1 || n === 2) throw new Error(`fail-${n}`)
      return n
    }),
  )
  assertEquals(
    attempted.sort((a, b) => a - b),
    [0, 1, 2, 3],
  )
})

Deno.test('mapWithConcurrency: rethrows the lowest-index rejection deterministically', async () => {
  const err = await assertRejects(() =>
    mapWithConcurrency([0, 1, 2, 3], 4, async (n) => {
      // The higher index fails FASTER, so completion-order would surface fail-3
      // first — but the lowest input index (1) must win.
      await new Promise((r) => setTimeout(r, (4 - n) * 5))
      if (n === 1 || n === 3) throw new Error(`fail-${n}`)
      return n
    }),
  )
  assertEquals((err as Error).message, 'fail-1')
})

Deno.test('mapWithConcurrency: empty input returns empty without invoking fn', async () => {
  let called = false
  const out = await mapWithConcurrency([], 4, async () => {
    called = true
    return 1
  })
  assertEquals(out, [])
  assertEquals(called, false)
})
