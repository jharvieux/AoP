// Deno tests for `_shared/match.ts`'s pure/DB-mockable helpers (parseSettings,
// buildStartMatchConfig, findExpiredTurns, isExpectedSweepRace, sanitizeAction,
// assertExpectedSeq, assertClientSubmittable). Run with
//   deno test --import-map supabase/functions/deno.json supabase/functions/_shared/match.test.ts
// These edge functions are not part of the pnpm/vitest CI gate (they run on
// Deno, not Node), so this file is exercised by `deno test`, not `pnpm test`.
import { createGame, type Action } from '@aop/engine'
import { assertEquals, assertNotEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1'
import {
  assertClientSubmittable,
  assertExpectedSeq,
  buildStartMatchConfig,
  finalizeRpcArgs,
  findExpiredTurns,
  isExpectedSweepRace,
  parseSettings,
  sanitizeAction,
  type MatchSettings,
  type StartMatchSeat,
} from './match.ts'
import { AppError } from './http.ts'
import type { Db } from './client.ts'

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
