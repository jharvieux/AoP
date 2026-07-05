// Deno tests for the untrusted-input parser `parseSettings`. Run with
//   deno test --import-map supabase/functions/deno.json supabase/functions/_shared/match.test.ts
// These edge functions are not part of the pnpm/vitest CI gate (they run on
// Deno, not Node), so this file is exercised by `deno test`, not `pnpm test`.
import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import { parseSettings } from './match.ts'
import { AppError } from './http.ts'

/** A minimal valid body; individual tests spread their overrides on top. */
const base = { mapSize: 'small', maxPlayers: 4 }

Deno.test(
  'parseSettings: defaults the betrayal knobs to the GAME_SETUP values when omitted',
  () => {
    const settings = parseSettings(base)
    assertEquals(settings.betrayalReputationPenalty, 40)
    assertEquals(settings.betrayalTruceRounds, 2)
  },
)

Deno.test('parseSettings: carries valid in-range betrayal knobs through unchanged', () => {
  const settings = parseSettings({
    ...base,
    betrayalReputationPenalty: 75,
    betrayalTruceRounds: 0,
  })
  assertEquals(settings.betrayalReputationPenalty, 75)
  assertEquals(settings.betrayalTruceRounds, 0)
})

Deno.test('parseSettings: accepts the inclusive bounds (0 and 100 / 0 and 10)', () => {
  assertEquals(
    parseSettings({ ...base, betrayalReputationPenalty: 0 }).betrayalReputationPenalty,
    0,
  )
  assertEquals(
    parseSettings({ ...base, betrayalReputationPenalty: 100 }).betrayalReputationPenalty,
    100,
  )
  assertEquals(parseSettings({ ...base, betrayalTruceRounds: 0 }).betrayalTruceRounds, 0)
  assertEquals(parseSettings({ ...base, betrayalTruceRounds: 10 }).betrayalTruceRounds, 10)
})

Deno.test('parseSettings: rejects out-of-range or non-integer betrayal knobs', () => {
  const bad = [
    { betrayalReputationPenalty: -1 },
    { betrayalReputationPenalty: 101 },
    { betrayalReputationPenalty: 10.5 },
    { betrayalTruceRounds: -1 },
    { betrayalTruceRounds: 11 },
    { betrayalTruceRounds: 1.5 },
  ]
  for (const override of bad) {
    assertThrows(
      () => parseSettings({ ...base, ...override }),
      AppError,
      undefined,
      `expected ${JSON.stringify(override)} to be rejected`,
    )
  }
})
