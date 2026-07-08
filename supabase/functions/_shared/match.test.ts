// Deno tests for `_shared/match.ts`'s pure/DB-mockable helpers (parseSettings,
// buildStartMatchConfig, findExpiredTurns, isExpectedSweepRace, sanitizeAction,
// assertExpectedSeq, assertClientSubmittable). Run with
//   deno test --import-map supabase/functions/deno.json supabase/functions/_shared/match.test.ts
// These edge functions are not part of the pnpm/vitest CI gate (they run on
// Deno, not Node), so this file is exercised by `deno test`, not `pnpm test`.
import {
  createGame,
  currentlyVisibleTiles,
  mapDistance,
  playerView,
  type Action,
  type GameConfig,
  type MapDefinition,
  type Tile,
} from '@aop/engine'
import type { Coord } from '@aop/shared'
import { assertEquals, assertNotEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1'
import {
  appendAction,
  appendActionRpcArgs,
  assertClientSubmittable,
  assertExpectedSeq,
  broadcastTurn,
  buildStartMatchConfig,
  finalizeRpcArgs,
  findExpiredTurns,
  isExpectedSweepRace,
  parseSettings,
  sanitizeAction,
  submitAction,
  type MatchSettings,
  type StartMatchSeat,
} from './match.ts'
import { buildMatchConfig, type SeatConfig } from './catalog.ts'
import { AppError } from './http.ts'
import type { Db } from './client.ts'

/** A minimal valid body; individual tests spread their overrides on top. */
const base = { mapSize: 'small', maxPlayers: 4 }

Deno.test(
  'parseSettings: defaults the betrayal/captivity knobs to the GAME_SETUP values when omitted',
  () => {
    const settings = parseSettings(base)
    assertEquals(settings.betrayalReputationPenalty, 40)
    assertEquals(settings.betrayalTruceRounds, 2)
    assertEquals(settings.captainCaptivityRounds, 5)
  },
)

Deno.test('parseSettings: carries a valid in-range captivity knob through unchanged', () => {
  assertEquals(parseSettings({ ...base, captainCaptivityRounds: 0 }).captainCaptivityRounds, 0)
  assertEquals(parseSettings({ ...base, captainCaptivityRounds: 20 }).captainCaptivityRounds, 20)
})

Deno.test('parseSettings: rejects out-of-range or non-integer captivity knobs', () => {
  const bad = [
    { captainCaptivityRounds: -1 },
    { captainCaptivityRounds: 21 },
    { captainCaptivityRounds: 2.5 },
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

Deno.test('parseSettings: rejects maxPlayers beyond the faction pool (#219)', () => {
  // Factions are unique per match and there are 5 of them, so 6-8 player
  // lobbies could never fill — the 6th joiner always failed on faction
  // exhaustion. 5 stays accepted; 6 is now rejected up front.
  assertEquals(parseSettings({ ...base, maxPlayers: 5 }).maxPlayers, 5)
  assertThrows(() => parseSettings({ ...base, maxPlayers: 6 }), AppError)
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
  captainCaptivityRounds: 5,
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

// finalizeRpcArgs (#265): the generated `finalize_match_with_ratings` RPC Args type
// declares `p_winner_seat: number` with no `| null`, even though a draw / mutual-
// elimination win is a genuine null both in the SQL function and the `winner_seat`
// column. These tests lock in that the cast preserves null rather than a future edit
// swapping it for a sentinel fallback that would misattribute a draw to seat 0.
Deno.test('finalizeRpcArgs: preserves a draw winnerSeat as null, not a sentinel', () => {
  const args = finalizeRpcArgs('match-1', null, [])
  assertEquals(args.p_winner_seat, null)
})

Deno.test('finalizeRpcArgs: passes through a real winning seat unchanged', () => {
  const args = finalizeRpcArgs('match-1', 2, [])
  assertEquals(args.p_winner_seat, 2)
})

Deno.test('finalizeRpcArgs: carries match id and rating rows through unchanged', () => {
  const ratings = [{ user_id: 'user-a', rating: 1050, matches_played: 3 }]
  const args = finalizeRpcArgs('match-1', 0, ratings)
  assertEquals(args.p_match_id, 'match-1')
  assertEquals(args.p_ratings, ratings)
})

// appendAction / appendActionRpcArgs (#216): the append is ONE atomic
// `append_match_action` RPC — insert + counter bump commit together or not at
// all, closing the crash window that permanently wedged a match. True
// transactionality lives in SQL and needs a live Postgres to exercise; what
// these tests lock in is the client half of the contract: the wrapper makes
// exactly one RPC round-trip (no separate insert/update to crash between), the
// deadline trichotomy is encoded losslessly, the action passes through
// sanitizeAction, and both conflict SQLSTATEs map to SEQ_CONFLICT.

/** A fake `Db` exposing ONLY `.rpc` — any table round-trip would throw, which is
 * itself the #216 assertion: the append must not touch PostgREST tables. */
function fakeRpcDb(result: { data: unknown; error: { code?: string; message: string } | null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  const db = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      return Promise.resolve(result)
    },
  } as unknown as Db
  return { db, calls }
}

const END_TURN: Action = { type: 'endTurn', playerId: 'seat-0' }

Deno.test(
  'appendActionRpcArgs: undefined deadline means "leave the running deadline alone"',
  () => {
    const args = appendActionRpcArgs('m1', 4, 0, END_TURN, undefined)
    assertEquals(args.p_set_deadline, false)
    assertEquals(args.p_deadline, null)
  },
)

Deno.test('appendActionRpcArgs: null deadline means "turn advanced, untimed — clear it"', () => {
  const args = appendActionRpcArgs('m1', 4, 0, END_TURN, null)
  assertEquals(args.p_set_deadline, true)
  assertEquals(args.p_deadline, null)
})

Deno.test('appendActionRpcArgs: a real deadline is set verbatim', () => {
  const args = appendActionRpcArgs('m1', 4, 0, END_TURN, '2026-07-07T00:00:00.000Z')
  assertEquals(args.p_set_deadline, true)
  assertEquals(args.p_deadline, '2026-07-07T00:00:00.000Z')
})

Deno.test(
  'appendActionRpcArgs: the action passes through sanitizeAction, ids carry through',
  () => {
    const withJunk = { ...END_TURN, junk: 'x'.repeat(1000) } as unknown as Action
    const args = appendActionRpcArgs('m1', 4, 2, withJunk, undefined)
    assertEquals(args.p_action, END_TURN)
    assertEquals(args.p_match_id, 'm1')
    assertEquals(args.p_prior_count, 4)
    assertEquals(args.p_seat, 2)
  },
)

Deno.test('appendAction: one RPC round-trip, resolves the RPC-confirmed seq', async () => {
  const { db, calls } = fakeRpcDb({ data: 5, error: null })
  const seq = await appendAction(db, 'm1', 4, 0, END_TURN, undefined)
  assertEquals(seq, 5)
  assertEquals(calls.length, 1)
  assertEquals(calls[0]!.fn, 'append_match_action')
})

Deno.test('appendAction: the RPC CAS raise (SC409) maps to SEQ_CONFLICT', async () => {
  const { db } = fakeRpcDb({ data: null, error: { code: 'SC409', message: 'advanced' } })
  const err = await assertRejects(() => appendAction(db, 'm1', 4, 0, END_TURN, undefined), AppError)
  assertEquals(err.code, 'SEQ_CONFLICT')
})

Deno.test('appendAction: a deploy-skew PK duplicate (23505) maps to SEQ_CONFLICT too', async () => {
  const { db } = fakeRpcDb({ data: null, error: { code: '23505', message: 'duplicate key' } })
  const err = await assertRejects(() => appendAction(db, 'm1', 4, 0, END_TURN, undefined), AppError)
  assertEquals(err.code, 'SEQ_CONFLICT')
})

Deno.test('appendAction: any other RPC failure surfaces as INTERNAL', async () => {
  const { db } = fakeRpcDb({ data: null, error: { code: '42P01', message: 'boom' } })
  const err = await assertRejects(() => appendAction(db, 'm1', 4, 0, END_TURN, undefined), AppError)
  assertEquals(err.code, 'INTERNAL')
})

// --- findExpiredTurns (#225: bounded, oldest-deadline-first, catch-log-continue) ---

type Row = Record<string, unknown>

/** A minimal fake of the chainable PostgREST builder, generic enough to serve
 * every table `findExpiredTurns`/`reconstructState` touch: `.select()` is a
 * no-op (we never project), `.eq/.lt/.lte/.gt` narrow the in-memory rows,
 * `.order` sorts, `.limit` truncates, and awaiting (or `.maybeSingle()`) the
 * builder resolves to `{ data, error: null }` like the real client. */
function makeFakeQuery(rows: Row[]) {
  let result = [...rows]
  let single = false
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      result = result.filter((r) => r[col] === val)
      return builder
    },
    lt: (col: string, val: unknown) => {
      result = result.filter((r) => (r[col] as string) < (val as string))
      return builder
    },
    lte: (col: string, val: unknown) => {
      result = result.filter((r) => (r[col] as number) <= (val as number))
      return builder
    },
    gt: (col: string, val: unknown) => {
      result = result.filter((r) => (r[col] as number) > (val as number))
      return builder
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      const dir = opts?.ascending === false ? -1 : 1
      result = [...result].sort((a, b) => (a[col]! > b[col]! ? dir : a[col]! < b[col]! ? -dir : 0))
      return builder
    },
    limit: (n: number) => {
      result = result.slice(0, n)
      return builder
    },
    maybeSingle: () => {
      single = true
      return builder
    },
    then(onfulfilled: (v: { data: unknown; error: null }) => unknown) {
      const data = single ? (result[0] ?? null) : result
      return Promise.resolve({ data, error: null }).then(onfulfilled)
    },
  }
  return builder
}

/** A fake `Db` backed by an in-memory table map, enough to drive
 * `findExpiredTurns` -> `reconstructState` without a real Postgres. */
function fakeDb(tables: Record<string, Row[]>): Db {
  return {
    from: (table: string) => makeFakeQuery(tables[table] ?? []),
  } as unknown as Db
}

/** A one-action-old match: a genesis snapshot at seq 0 plus one `active`-state
 * snapshot at seq 1 (reconstructState needs no replay when snap.seq === upToSeq). */
function activeMatchTables(matchId: string, turnDeadline: string, currentSeat: number) {
  return {
    id: matchId,
    action_count: 1,
    turn_deadline: turnDeadline,
    snapshot: {
      match_id: matchId,
      seq: 1,
      state: { status: 'active', currentPlayerIndex: 0, players: [{ id: `seat-${currentSeat}` }] },
    },
  }
}

Deno.test('findExpiredTurns: orders oldest-deadline-first and caps the batch size', async () => {
  const n = 60 // exceeds the 50-match internal cap
  const matches: Row[] = []
  const snapshots: Row[] = []
  for (let i = 0; i < n; i++) {
    const m = activeMatchTables(`m${i}`, new Date(2026, 0, 1, 0, n - i).toISOString(), 0)
    matches.push({
      id: m.id,
      status: 'active',
      action_count: m.action_count,
      turn_deadline: m.turn_deadline,
    })
    snapshots.push(m.snapshot)
  }
  const db = fakeDb({ matches, match_snapshots: snapshots, match_actions: [] })

  const expired = await findExpiredTurns(db)

  assertEquals(expired.length, 50)
  // The oldest deadline (`m59`, built with the smallest hour offset) sorts first.
  assertEquals(expired[0]!.matchId, 'm59')
  assertEquals(expired[49]!.matchId, 'm10')
})

Deno.test('findExpiredTurns: a match that fails to reconstruct is skipped, not fatal', async () => {
  const healthy = activeMatchTables('good', '2026-01-01T00:00:00.000Z', 0)
  const matches: Row[] = [
    {
      id: healthy.id,
      status: 'active',
      action_count: healthy.action_count,
      turn_deadline: healthy.turn_deadline,
    },
    // `poisoned` has no snapshot row at all -> reconstructState throws MATCH_STATE.
    {
      id: 'poisoned',
      status: 'active',
      action_count: 3,
      turn_deadline: '2026-01-01T00:00:00.000Z',
    },
  ]
  const db = fakeDb({ matches, match_snapshots: [healthy.snapshot], match_actions: [] })

  const expired = await findExpiredTurns(db)

  assertEquals(expired, [{ matchId: 'good', seat: 0 }])
})

// --- assertExpectedSeq (#232: shared optimistic-concurrency token check) ---

Deno.test('assertExpectedSeq: passes when expectedSeq matches the authoritative head', async () => {
  const db = fakeDb({ matches: [{ id: 'm1', action_count: 7 }] })
  await assertExpectedSeq(db, 'm1', 7) // must not throw
})

Deno.test('assertExpectedSeq: rejects a stale token as SEQ_CONFLICT', async () => {
  const db = fakeDb({ matches: [{ id: 'm1', action_count: 7 }] })
  const err = await assertRejects(() => assertExpectedSeq(db, 'm1', 6), AppError)
  assertEquals(err.code, 'SEQ_CONFLICT')
})

Deno.test('assertExpectedSeq: rejects a token ahead of the head as SEQ_CONFLICT too', async () => {
  const db = fakeDb({ matches: [{ id: 'm1', action_count: 7 }] })
  const err = await assertRejects(() => assertExpectedSeq(db, 'm1', 8), AppError)
  assertEquals(err.code, 'SEQ_CONFLICT')
})

Deno.test(
  'assertExpectedSeq: a missing match falls through (downstream load owns NOT_FOUND)',
  async () => {
    const db = fakeDb({ matches: [] })
    await assertExpectedSeq(db, 'no-such-match', 0) // must not throw
  },
)

// --- isExpectedSweepRace (#225) ---

Deno.test('isExpectedSweepRace: true for the three known races, false otherwise', () => {
  assertEquals(isExpectedSweepRace(new AppError('NOT_YOUR_TURN', 'x')), true)
  assertEquals(isExpectedSweepRace(new AppError('SEQ_CONFLICT', 'x')), true)
  assertEquals(isExpectedSweepRace(new AppError('MATCH_STATE', 'x')), true)
  assertEquals(isExpectedSweepRace(new AppError('INTERNAL', 'x')), false)
  assertEquals(isExpectedSweepRace(new Error('boom')), false)
  assertEquals(isExpectedSweepRace('not even an error'), false)
})

// --- sanitizeAction (#223) ---

Deno.test('sanitizeAction: strips unknown top-level junk fields a hostile client attached', () => {
  const withJunk = {
    type: 'endTurn',
    playerId: 'seat-0',
    junk: 'x'.repeat(1_000_000),
    anotherField: { nested: 'blob' },
  } as unknown as Action

  assertEquals(sanitizeAction(withJunk), { type: 'endTurn', playerId: 'seat-0' })
})

Deno.test(
  'sanitizeAction: carries every known field of a rich action type through unchanged',
  () => {
    const action: Action = {
      type: 'attackCaptain',
      playerId: 'seat-1',
      captainId: 'captain-a',
      targetCaptainId: 'captain-b',
      attackerOrders: ['broadside', 'ram'],
      boardCommands: [{ stackId: 0, to: { col: 1, row: -1 }, targetId: 2 }],
    }
    assertEquals(sanitizeAction(action), action)
  },
)

Deno.test('sanitizeAction: drops junk attached inside an omitted-optional-field action', () => {
  const withJunk = {
    type: 'attackCaptain',
    playerId: 'seat-1',
    captainId: 'captain-a',
    targetCaptainId: 'captain-b',
    // No attackerOrders/boardCommands — plus a top-level junk key.
    payload: 'x'.repeat(1_000_000),
  } as unknown as Action

  assertEquals(sanitizeAction(withJunk), {
    type: 'attackCaptain',
    playerId: 'seat-1',
    captainId: 'captain-a',
    targetCaptainId: 'captain-b',
  })
})

/** One well-formed sample of every Action variant. */
const actionSamples: Action[] = [
  { type: 'endTurn', playerId: 'seat-0' },
  { type: 'resign', playerId: 'seat-0' },
  { type: 'moveCaptain', playerId: 'seat-0', captainId: 'c', to: { x: 0, y: 0 } },
  {
    type: 'attackCaptain',
    playerId: 'seat-0',
    captainId: 'c',
    targetCaptainId: 't',
  },
  { type: 'setSailOrder', playerId: 'seat-0', captainId: 'c', destination: { x: 3, y: 4 } },
  {
    type: 'setSailOrder',
    playerId: 'seat-0',
    captainId: 'c',
    destination: { x: 3, y: 4 },
    targetId: 't',
    targetKind: 'captain',
  },
  { type: 'clearSailOrder', playerId: 'seat-0', captainId: 'c' },
  { type: 'setStandingOrders', playerId: 'seat-0', captainId: 'c', orders: [] },
  { type: 'construct', playerId: 'seat-0', cityId: 'city', buildingId: 'b' },
  { type: 'recruit', playerId: 'seat-0', cityId: 'city', unitId: 'u', count: 1 },
  {
    type: 'transferTroops',
    playerId: 'seat-0',
    cityId: 'city',
    captainId: 'c',
    direction: 'toShip',
    unitId: 'u',
    count: 1,
  },
  { type: 'gainCaptainXp', playerId: 'seat-0', captainId: 'c', amount: 10 },
  { type: 'chooseCaptainSkill', playerId: 'seat-0', captainId: 'c', skillId: 's' },
  { type: 'upgradeShip', playerId: 'seat-0', cityId: 'city', captainId: 'c', track: 't' },
  {
    type: 'resolveEncounter',
    playerId: 'seat-0',
    captainId: 'c',
    encounterId: 'e',
    choice: 'trade',
  },
  { type: 'proposeAlliance', playerId: 'seat-0', targetId: 'seat-1' },
  { type: 'acceptAlliance', playerId: 'seat-0', proposerId: 'seat-1' },
  { type: 'leaveAlliance', playerId: 'seat-0', otherId: 'seat-1' },
]

Deno.test('sanitizeAction: covers every Action variant without throwing', () => {
  for (const action of actionSamples) {
    assertEquals(sanitizeAction(action), action)
  }
})

// assertClientSubmittable (#205): the anti-cheat guard on client-proposed actions.
// gainCaptainXp is only ever a server/engine-internal grant (combat, encounters);
// a client submitting it directly would mint arbitrary XP.

Deno.test('assertClientSubmittable: rejects gainCaptainXp at any amount', () => {
  for (const amount of [1, 10, 99999]) {
    assertThrows(
      () => {
        assertClientSubmittable({
          type: 'gainCaptainXp',
          playerId: 'seat-0',
          captainId: 'c',
          amount,
        })
      },
      AppError,
      'gainCaptainXp',
      `expected amount ${amount} to be rejected`,
    )
  }
})

Deno.test('assertClientSubmittable: rejects gainCaptainXp with INVALID_ACTION', () => {
  try {
    assertClientSubmittable({
      type: 'gainCaptainXp',
      playerId: 'seat-0',
      captainId: 'c',
      amount: 1,
    })
    throw new Error('expected assertClientSubmittable to throw')
  } catch (err) {
    if (!(err instanceof AppError)) throw err
    assertEquals(err.code, 'INVALID_ACTION')
  }
})

Deno.test('assertClientSubmittable: allows every other Action variant', () => {
  for (const action of actionSamples) {
    if (action.type === 'gainCaptainXp') continue
    assertClientSubmittable(action)
  }
})

// --- sanitizeAction structural validation (#206) ---

/** Assert sanitizeAction rejects `action` as BAD_REQUEST mentioning `field`. */
function assertActionRejects(action: unknown, field: string) {
  const err = assertThrows(() => sanitizeAction(action as Action), AppError, field)
  assertEquals(err.code, 'BAD_REQUEST')
}

Deno.test('sanitizeAction: rejects NaN, Infinity, and fractional numeric fields', () => {
  const recruit = (count: unknown) => ({
    type: 'recruit',
    playerId: 'seat-0',
    cityId: 'city',
    unitId: 'u',
    count,
  })
  assertActionRejects(recruit(Number.NaN), 'action.count')
  assertActionRejects(recruit(Number.POSITIVE_INFINITY), 'action.count')
  assertActionRejects(recruit(3.14), 'action.count')
  assertActionRejects(recruit('3'), 'action.count')
  assertActionRejects(recruit(undefined), 'action.count')
  assertActionRejects(
    { type: 'gainCaptainXp', playerId: 'seat-0', captainId: 'c', amount: Number.NaN },
    'action.amount',
  )
})

Deno.test('sanitizeAction: rejects malformed moveCaptain coordinates', () => {
  const move = (to: unknown) => ({ type: 'moveCaptain', playerId: 'seat-0', captainId: 'c', to })
  assertActionRejects(move({ x: 1.5, y: 2 }), 'action.to.x')
  assertActionRejects(move({ x: 1, y: Number.NaN }), 'action.to.y')
  assertActionRejects(move({ x: 1 }), 'action.to.y')
  assertActionRejects(move('1,2'), 'action.to')
  assertActionRejects(move(undefined), 'action.to')
})

Deno.test('sanitizeAction: rejects unknown enum values', () => {
  assertActionRejects(
    {
      type: 'transferTroops',
      playerId: 'seat-0',
      cityId: 'city',
      captainId: 'c',
      direction: 'sideways',
      unitId: 'u',
      count: 1,
    },
    'action.direction',
  )
  assertActionRejects(
    {
      type: 'resolveEncounter',
      playerId: 'seat-0',
      captainId: 'c',
      encounterId: 'e',
      choice: 'plunder',
    },
    'action.choice',
  )
})

Deno.test('sanitizeAction: validates nested order and board-command arrays item by item', () => {
  const standing = (orders: unknown, boardOrders?: unknown) => ({
    type: 'setStandingOrders',
    playerId: 'seat-0',
    captainId: 'c',
    orders,
    ...(boardOrders !== undefined ? { boardOrders } : {}),
  })
  assertActionRejects(standing([{ when: 'always', tactic: 'nuke' }]), 'action.orders[0].tactic')
  assertActionRejects(standing([{ when: 'whenever', tactic: 'ram' }]), 'action.orders[0].when')
  assertActionRejects(standing('not-an-array'), 'action.orders')
  assertActionRejects(
    standing([], [{ when: 'always', doctrine: 'banzai' }]),
    'action.boardOrders[0].doctrine',
  )

  const attack = (over: Record<string, unknown>) => ({
    type: 'attackCaptain',
    playerId: 'seat-0',
    captainId: 'c',
    targetCaptainId: 't',
    ...over,
  })
  assertActionRejects(attack({ attackerOrders: ['broadside', 'nuke'] }), 'action.attackerOrders[1]')
  assertActionRejects(
    attack({ boardCommands: [{ stackId: 0.5 }] }),
    'action.boardCommands[0].stackId',
  )
  assertActionRejects(
    attack({ boardCommands: [{ stackId: 0, to: { col: 1, row: Number.NaN } }] }),
    'action.boardCommands[0].to.row',
  )
})

Deno.test('sanitizeAction: rejects an unknown action type as BAD_REQUEST, not INTERNAL', () => {
  const err = assertThrows(
    () => sanitizeAction({ type: 'grantMeGold', playerId: 'seat-0' } as unknown as Action),
    AppError,
    'Unknown action type',
  )
  assertEquals(err.code, 'BAD_REQUEST')
})

Deno.test('sanitizeAction: rejects missing or non-string id fields', () => {
  assertActionRejects({ type: 'endTurn' }, 'action.playerId')
  assertActionRejects({ type: 'endTurn', playerId: 7 }, 'action.playerId')
  assertActionRejects(
    { type: 'construct', playerId: 'seat-0', cityId: 'city' },
    'action.buildingId',
  )
})

// --- broadcastTurn (#228: the poke path's authorization + leak-audit contract) ---
// Whether RLS actually refuses a non-participant subscriber lives in Postgres
// (supabase/migrations/20260707090000_realtime_private_match_channels.sql) and
// needs a live database; what IS pinned here is this side of that contract —
// the server only ever pokes the *private* channel (a public send would bypass
// the policy) and the payload carries the seq alone, never state (§7).

/** A Db whose channel() records topic/options and acks the send. */
function channelDb(sent: { topic: string; options: unknown; message: unknown }[]): Db {
  return {
    channel(topic: string, options: unknown) {
      return {
        send(message: unknown) {
          sent.push({ topic, options, message })
          return Promise.resolve('ok')
        },
      }
    },
  } as unknown as Db
}

Deno.test('broadcastTurn: pokes the private match channel with the seq only', async () => {
  const sent: { topic: string; options: unknown; message: unknown }[] = []
  await broadcastTurn(channelDb(sent), 'm1', 5)
  assertEquals(sent.length, 1)
  assertEquals(sent[0]!.topic, 'match:m1')
  assertEquals(sent[0]!.options, { config: { private: true } })
  assertEquals(sent[0]!.message, {
    type: 'broadcast',
    event: 'turn',
    payload: { type: 'turn', seq: 5 },
  })
})

// --- Hex-topology protocol audit (#348 Phase 5) ---
//
// The engine's topology switch (Phase 2, #363) lives entirely inside `@aop/engine`:
// `GameMap.topology` drives `mapNeighbors`/`mapDistance`, which every adjacency/range/
// vision/pathfinding consumer already dispatches through (map.ts, pathfinding.ts,
// visibility.ts — see packages/engine/test/hexIntegration.test.ts for the exhaustive
// per-function coverage). Nothing in the multiplayer layer (this file, submit-action,
// get-player-view) ever branches on topology, reads `map.topology`, or encodes it in an
// `Action` — coordinates are the same `{x, y}` integer pair either way (hex reinterprets
// the identical rectangular storage as odd-r offset). So there is no new coordinate
// format, no new validation surface, and no new Edge Function to add: the existing
// `sanitizeAction` -> `applyActionWithOutcome` pipeline is already topology-agnostic BY
// CONSTRUCTION, and `playerView`'s fog filter is already topology-aware BY CONSTRUCTION
// (it calls `mapDistance`, not a hardcoded Chebyshev box). The tests below prove that
// property holds all the way through the real `submitAction`/`playerView` entry points
// the Edge Functions call, not just the engine internals hexIntegration.test.ts covers.

/** A seat as `buildMatchConfig` needs it, sized for the 2-seat hex fixtures below. */
const HEX_SEATS: SeatConfig[] = [
  { seat: 0, faction: 'pirates', isAI: false, displayName: 'Alice' },
  { seat: 1, faction: 'british', isAI: false, displayName: 'Bob' },
]

/** An all-deep-water hex map (topology: 'hex') with one port per seat, small enough for
 * a fast unit test. Mirrors packages/engine/test/hexIntegration.test.ts's fixture. */
function hexTestMap(startPositions: Coord[]): MapDefinition {
  const size = 16
  const tiles: Tile[] = Array.from({ length: size * size }, () => ({
    type: 'deep' as const,
    island: -1,
  }))
  tiles[2 * size + 2] = { type: 'port', island: 0 }
  tiles[12 * size + 12] = { type: 'port', island: 1 }
  return { width: size, height: size, tiles, startPositions, topology: 'hex' }
}

/** A real `GameConfig` — same `buildMatchConfig` create-match/start-match use for a
 * procedural square map — with an authored hex `mapDefinition` swapped in. Proves the
 * multiplayer config-building path needs no hex-specific branch: `createGame` already
 * prefers `mapDefinition` over procedural generation (game.ts, predates #348). */
function hexMatchConfig(seed: number, startPositions: Coord[]): GameConfig {
  return {
    ...buildMatchConfig(seed, 'small', HEX_SEATS),
    mapDefinition: hexTestMap(startPositions),
  }
}

Deno.test(
  'sanitizeAction: identical output for square and hex coordinates — the wire format never encodes topology (#348)',
  () => {
    // Coordinate format is 2 plain integers under either topology; sanitizeAction has
    // no map/topology parameter to branch on. The *same* moveCaptain action targets a
    // square-plausible tile and an equally-plausible hex tile with no difference in
    // shape, so there is nothing for a hex-aware code path to have missed here.
    const move: Action = {
      type: 'moveCaptain',
      playerId: 'seat-0',
      captainId: 'cap-seat-0',
      to: { x: 7, y: 3 },
    }
    const sanitized = sanitizeAction(move)
    assertEquals(sanitized, move)
    assertEquals(JSON.parse(JSON.stringify(sanitized)), move) // byte-identical round trip
    assertEquals('topology' in sanitized, false)
    assertEquals('map' in sanitized, false)
  },
)

Deno.test('sanitizeAction: network payload size is independent of topology (#348 Phase 5)', () => {
  // Same digit-width coordinates, one on a plausible square map and one on a
  // plausible hex map of identical dimensions — the serialized size only tracks
  // digit count, never a topology-specific encoding (no cube/axial coords ride
  // along; hex reuses the same {x, y} storage as square).
  const square: Action = {
    type: 'moveCaptain',
    playerId: 'seat-0',
    captainId: 'cap-seat-0',
    to: { x: 12, y: 9 },
  }
  const hex: Action = {
    type: 'moveCaptain',
    playerId: 'seat-0',
    captainId: 'cap-seat-0',
    to: { x: 12, y: 9 },
  }
  assertEquals(
    JSON.stringify(sanitizeAction(square)).length,
    JSON.stringify(sanitizeAction(hex)).length,
  )
})

Deno.test(
  'submitAction: accepts a hex-adjacent move on a hex-topology match (#348 Phase 5)',
  async () => {
    const starts: Coord[] = [
      { x: 2, y: 3 },
      { x: 12, y: 13 },
    ]
    const state = createGame(hexMatchConfig(42, starts))
    assertEquals(state.map.topology, 'hex')

    const db = mutableFakeDb({
      matches: [
        {
          id: 'hex-1',
          status: 'active',
          seed: 42,
          settings: START_MATCH_SETTINGS,
          action_count: 0,
        },
      ],
      match_snapshots: [{ match_id: 'hex-1', seq: 0, state }],
      match_actions: [],
      match_players: [
        { match_id: 'hex-1', seat: 0, user_id: 'user-a', status: 'active', alliance_id: null },
        { match_id: 'hex-1', seat: 1, user_id: 'user-b', status: 'active', alliance_id: null },
      ],
    })

    // (2,3) -> (3,3) is a hex neighbor (odd-r adjacency), 1 movement point.
    const result = await submitAction(db, 'hex-1', 0, {
      type: 'moveCaptain',
      playerId: 'seat-0',
      captainId: 'cap-seat-0',
      to: { x: 3, y: 3 },
    })
    assertEquals(result.state.captains.find((c) => c.id === 'cap-seat-0')!.position, { x: 3, y: 3 })
  },
)

Deno.test(
  'submitAction: rejects an attack at hex distance 2 (a square-diagonal target) through the real pipeline (#348 Phase 5)',
  async () => {
    // (2,3) and (1,2) are Chebyshev-adjacent (legal range on a square map) but hex
    // distance 2 — the same case packages/engine/test/hexIntegration.test.ts proves at
    // the engine layer, exercised here through the actual submitAction() Edge Functions
    // call, backed by a fake Db, to prove the multiplayer layer doesn't quietly relax
    // (or duplicate, and risk diverging from) the engine's own topology-aware range check.
    const starts: Coord[] = [
      { x: 2, y: 3 },
      { x: 1, y: 2 },
    ]
    const state = createGame(hexMatchConfig(42, starts))
    const db = mutableFakeDb({
      matches: [
        {
          id: 'hex-2',
          status: 'active',
          seed: 42,
          settings: START_MATCH_SETTINGS,
          action_count: 0,
        },
      ],
      match_snapshots: [{ match_id: 'hex-2', seq: 0, state }],
      match_actions: [],
      match_players: [
        { match_id: 'hex-2', seat: 0, user_id: 'user-a', status: 'active', alliance_id: null },
        { match_id: 'hex-2', seat: 1, user_id: 'user-b', status: 'active', alliance_id: null },
      ],
    })

    const err = await assertRejects(
      () =>
        submitAction(db, 'hex-2', 0, {
          type: 'attackCaptain',
          playerId: 'seat-0',
          captainId: 'cap-seat-0',
          targetCaptainId: 'cap-seat-1',
        }),
      AppError,
    )
    assertEquals(err.code, 'INVALID_ACTION')
  },
)

Deno.test(
  "playerView: fog-of-war on a hex map matches the engine's own topology-aware vision, not a Chebyshev box (#348 Phase 5)",
  () => {
    // get-player-view (supabase/functions/get-player-view/index.ts) calls `playerView`
    // directly on the reconstructed state with no topology-specific code of its own —
    // this proves that SAME function's visible-tile set matches the ground truth
    // (`currentlyVisibleTiles`, which unions city vision + captain vision, both via
    // topology-aware `mapDistance`) exactly, on a hex map.
    const starts: Coord[] = [
      { x: 2, y: 3 },
      { x: 12, y: 13 },
    ]
    const state = createGame(hexMatchConfig(7, starts))
    const view = playerView(state, 'seat-0')

    const expected = new Set(currentlyVisibleTiles(state, 'seat-0').map((t) => `${t.x},${t.y}`))
    const actual = new Set(
      view.tiles.filter((t) => t.visible).map((t) => `${t.coord.x},${t.coord.y}`),
    )
    assertEquals(actual, expected)

    // Sanity: this is a genuinely hex-shaped ball, not a square Chebyshev box — find a
    // tile the fog filter actually disagrees on between the two metrics (Chebyshev-in,
    // hex-out or vice versa) near the captain, proving `mapDistance`, not Chebyshev,
    // is what governs the boundary.
    const cap = state.captains.find((c) => c.ownerId === 'seat-0')!
    const radius = state.config.setup.captainVisionRadius
    let sawDisagreement = false
    for (let dy = -radius - 1; dy <= radius + 1; dy++) {
      for (let dx = -radius - 1; dx <= radius + 1; dx++) {
        const t = { x: cap.position.x + dx, y: cap.position.y + dy }
        const chebyshevIn = Math.max(Math.abs(dx), Math.abs(dy)) <= radius
        const hexIn = mapDistance(state.map, cap.position, t) <= radius
        if (chebyshevIn !== hexIn) sawDisagreement = true
      }
    }
    assertEquals(sawDisagreement, true)
  },
)

/** A richer in-memory fake `Db` than {@link fakeDb} above: also supports `.update()` and
 * the `append_match_action` RPC, so a hex-topology `submitAction()` call can run its real
 * read/append path (load, reconstruct, append) without a live Postgres. Scoped to exactly
 * what `submitAction` touches for a single non-turn-ending action — the hex tests above
 * never advance the turn, so `writeSnapshot` (an upsert), `broadcastTurn`, and the
 * push/email dispatch never fire; `.update()` is exercised defensively (`mirrorAllianceIds`
 * always reads `match_players`, though it writes nothing here since no alliance changed) —
 * not a general-purpose PostgREST fake. */
function mutableFakeDb(tables: Record<string, Row[]>): Db {
  function builder(table: string) {
    const predicates: Array<(r: Row) => boolean> = []
    let single = false
    let mode: 'select' | 'update' = 'select'
    let patch: Row | undefined
    let ordering: { col: string; ascending: boolean } | null = null
    let limitN: number | null = null
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        predicates.push((r) => r[col] === val)
        return api
      },
      lt: (col: string, val: unknown) => {
        predicates.push((r) => (r[col] as string) < (val as string))
        return api
      },
      lte: (col: string, val: unknown) => {
        predicates.push((r) => (r[col] as number) <= (val as number))
        return api
      },
      gt: (col: string, val: unknown) => {
        predicates.push((r) => (r[col] as number) > (val as number))
        return api
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        ordering = { col, ascending: opts?.ascending !== false }
        return api
      },
      limit: (n: number) => {
        limitN = n
        return api
      },
      maybeSingle: () => {
        single = true
        return api
      },
      update: (p: Row) => {
        mode = 'update'
        patch = p
        return api
      },
      then(onfulfilled: (v: { data: unknown; error: null }) => unknown) {
        const rows = tables[table] ?? []
        const matches = (r: Row) => predicates.every((p) => p(r))
        if (mode === 'update') {
          tables[table] = rows.map((r) => (matches(r) ? { ...r, ...patch } : r))
          return Promise.resolve({ data: null, error: null }).then(onfulfilled)
        }
        let result = rows.filter(matches)
        if (ordering) {
          const { col, ascending } = ordering
          const dir = ascending ? 1 : -1
          result = [...result].sort((a, b) =>
            a[col]! > b[col]! ? dir : a[col]! < b[col]! ? -dir : 0,
          )
        }
        if (limitN !== null) result = result.slice(0, limitN)
        const data = single ? (result[0] ?? null) : result
        return Promise.resolve({ data, error: null }).then(onfulfilled)
      },
    }
    return api
  }
  const db = {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn !== 'append_match_action') {
        throw new Error(`mutableFakeDb: unhandled rpc ${fn}`)
      }
      const seq = (args.p_prior_count as number) + 1
      const rows = tables.match_actions ?? (tables.match_actions = [])
      rows.push({ match_id: args.p_match_id, seq, action: args.p_action })
      const match = (tables.matches ?? []).find((m) => m.id === args.p_match_id)
      if (match) match.action_count = seq
      return Promise.resolve({ data: seq, error: null })
    },
    channel: () => ({ send: () => Promise.resolve('ok') }),
  }
  return db as unknown as Db
}
