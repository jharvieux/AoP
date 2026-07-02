/**
 * Seeded PRNG (mulberry32). The full generator state is a single uint32 that
 * lives inside GameState, so replaying an action log reproduces every roll.
 * Never use Math.random() anywhere in the engine.
 */

export type RngState = number

export function seedRng(seed: number): RngState {
  // Mix the seed so small integers (0, 1, 2...) don't produce correlated streams.
  let h = seed >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}

/** Returns [next state, float in [0, 1)]. */
export function nextFloat(state: RngState): [RngState, number] {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [next, value]
}

/** Returns [next state, integer in [min, max] inclusive]. */
export function nextInt(state: RngState, min: number, max: number): [RngState, number] {
  const [next, f] = nextFloat(state)
  return [next, min + Math.floor(f * (max - min + 1))]
}
