// Deno tests for the untrusted-input parser `parseSettings` and the shared
// match-start config builder. Run with
//   deno test --import-map supabase/functions/deno.json supabase/functions/_shared/match.test.ts
// These edge functions are not part of the pnpm/vitest CI gate (they run on
// Deno, not Node), so this file is exercised by `deno test`, not `pnpm test`.
import { createGame } from '@aop/engine'
import { assertEquals, assertNotEquals, assertThrows } from 'jsr:@std/assert@1'
import {
  buildStartMatchConfig,
  parseSettings,
  type MatchSettings,
  type StartMatchSeat,
} from './match.ts'
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

// buildStartMatchConfig (#231): the pure half of the shared start-match sequence.
// start-match and the quick-match drain each read seats from a different DB row
// shape, then normalize to `StartMatchSeat` before calling this — these tests
// prove that normalization is all that matters: equivalent seat data produces a
// byte-identical GameState no matter which caller built it.

const START_MATCH_SETTINGS: MatchSettings = {
  mapSize: 'small',
  maxPlayers: 2,
  turnTimerSeconds: 86_400,
  private: false,
  aiSeats: 0,
  missedTurnThreshold: 3,
  betrayalReputationPenalty: 40,
  betrayalTruceRounds: 2,
}

Deno.test(
  'buildStartMatchConfig: identical seat data produces a byte-identical GameState regardless of caller',
  () => {
    const names = new Map([
      ['user-a', 'Alice'],
      ['user-b', 'Bob'],
    ])
    // start-match's seats come from `match_players` rows read back after
    // create-match + join-match; quick-match's come from `assignQuickMatchSeats`.
    // Both are normalized to this same shape before reaching the shared builder.
    const seatsFromStartMatch: StartMatchSeat[] = [
      { seat: 0, userId: 'user-a', faction: 'pirates' },
      { seat: 1, userId: 'user-b', faction: 'british' },
    ]
    const seatsFromQuickMatch: StartMatchSeat[] = [
      { seat: 0, userId: 'user-a', faction: 'pirates' },
      { seat: 1, userId: 'user-b', faction: 'british' },
    ]

    const a = createGame(buildStartMatchConfig(7, START_MATCH_SETTINGS, seatsFromStartMatch, names))
    const b = createGame(buildStartMatchConfig(7, START_MATCH_SETTINGS, seatsFromQuickMatch, names))
    assertEquals(JSON.stringify(a), JSON.stringify(b))
  },
)

Deno.test(
  'buildStartMatchConfig: a null userId seat is AI-flagged with a seat-numbered name',
  () => {
    const seats: StartMatchSeat[] = [
      { seat: 0, userId: 'user-a', faction: 'pirates' },
      { seat: 1, userId: null, faction: 'british' },
    ]
    const config = buildStartMatchConfig(1, START_MATCH_SETTINGS, seats, new Map())
    assertEquals(config.players[1]!.isAI, true)
    assertEquals(config.players[1]!.name, 'AI 1')
    assertEquals(config.players[0]!.isAI, false)
  },
)

Deno.test(
  'buildStartMatchConfig: a human seat missing from the name map falls back to "Seat N"',
  () => {
    const seats: StartMatchSeat[] = [{ seat: 0, userId: 'user-missing', faction: 'pirates' }]
    const config = buildStartMatchConfig(1, START_MATCH_SETTINGS, seats, new Map())
    assertEquals(config.players[0]!.name, 'Seat 0')
  },
)

Deno.test(
  'buildStartMatchConfig: the seed actually reaches the engine — different seeds diverge',
  () => {
    const seats: StartMatchSeat[] = [
      { seat: 0, userId: 'user-a', faction: 'pirates' },
      { seat: 1, userId: 'user-b', faction: 'british' },
    ]
    const names = new Map([
      ['user-a', 'Alice'],
      ['user-b', 'Bob'],
    ])
    const a = createGame(buildStartMatchConfig(1, START_MATCH_SETTINGS, seats, names))
    const b = createGame(buildStartMatchConfig(2, START_MATCH_SETTINGS, seats, names))
    assertNotEquals(JSON.stringify(a), JSON.stringify(b))
  },
)
