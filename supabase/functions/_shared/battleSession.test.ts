// Deno tests for the binding-battle-session transport (#408,
// docs/design/multiplayer-tactical-probe.md §2/§3/§10). Run with
//   deno test --import-map supabase/functions/deno.json supabase/functions/_shared/battleSession.test.ts
// Like `_shared/match.test.ts`, these run on Deno (the CI `edge-functions` job), not the
// pnpm/vitest gate. They drive the real openBattleSession/appendBattleOrder/auto-resolve
// helpers against an in-memory fake `Db`, so the session's read/probe/append/resolve path is
// exercised end to end without a live Postgres. The engine-level probe-parity contract these
// build on (server probe outcome == reducer-applied report) is proven at the engine layer in
// packages/engine/test/defenderOrders.test.ts (#420); here we prove the SESSION layer honors
// it, plus the CAS, leak, BATTLE_PENDING, and forced-resolution guarantees §8 PR-3 mandates.

import {
  applyActionWithOutcome,
  createGame,
  type AttackCaptainAction,
  type GameState,
  type TacticId,
} from '@aop/engine'
import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { buildMatchConfig, type SeatConfig } from './catalog.ts'
import { AppError } from './http.ts'
import type { Db } from './client.ts'
import {
  appendBattleOrder,
  assertNoBattlePending,
  autoResolveBattleSession,
  battleContext,
  type BattleSessionOutcome,
  findExpiredBattleSessions,
  openBattleSession,
} from './battleSession.ts'

const SEATS: SeatConfig[] = [
  { seat: 0, faction: 'pirates', isAI: false, displayName: 'Attacker' },
  { seat: 1, faction: 'british', isAI: false, displayName: 'Defender' },
]

const SETTINGS = {
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

/** A real 2-seat multiplayer GameState (seat-0 attacker, seat-1 defender) with the two
 * captains moved onto adjacent tiles so an `attackCaptain` is in range. Same fixture shape
 * the engine tests use, but with the server's own `buildMatchConfig` (so player ids are
 * `seat-N` and combat stats come from @aop/content, exactly like a real match). */
function adjacentGame(): GameState {
  const state = createGame(buildMatchConfig(7, 'small', SEATS))
  const attacker = state.captains.find((c) => c.ownerId === 'seat-0')!
  const defender = state.captains.find((c) => c.ownerId === 'seat-1')!
  const dx = attacker.position.x < state.map.width - 1 ? 1 : -1
  const pos = { x: attacker.position.x + dx, y: attacker.position.y }
  return {
    ...state,
    captains: state.captains.map((c) => (c.id === defender.id ? { ...c, position: pos } : c)),
  }
}

function attackIds(state: GameState) {
  return {
    captainId: state.captains.find((c) => c.ownerId === 'seat-0')!.id,
    targetCaptainId: state.captains.find((c) => c.ownerId === 'seat-1')!.id,
  }
}

type Row = Record<string, unknown>

const SESSION_DEFAULTS: Row = {
  attacker_tactic_orders: [],
  defender_tactic_orders: [],
  attacker_board_commands: [],
  defender_board_commands: [],
  defender_interactive: false,
  round_deadline: null,
}

/** In-memory fake `Db`: a chainable PostgREST-ish builder over a table map, supporting the
 * select/insert/update/delete + `append_match_action` RPC the session path touches. Mirrors
 * real-DB semantics for the columns these tests read: `match_battle_sessions` inserts get the
 * `not null default '[]'` jsonb defaults, so the probe never sees an undefined order list. */
function fakeDb(tables: Record<string, Row[]>): Db {
  function builder(table: string) {
    const preds: Array<(r: Row) => boolean> = []
    let single = false
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let patch: Row | undefined
    let toInsert: Row | undefined
    let ordering: { col: string; asc: boolean } | null = null
    let limitN: number | null = null
    // deno-lint-ignore no-explicit-any
    const api: any = {
      select: () => api,
      insert: (r: Row) => {
        mode = 'insert'
        toInsert = r
        return api
      },
      update: (p: Row) => {
        mode = 'update'
        patch = p
        return api
      },
      delete: () => {
        mode = 'delete'
        return api
      },
      eq: (c: string, v: unknown) => {
        preds.push((r) => r[c] === v)
        return api
      },
      lt: (c: string, v: unknown) => {
        preds.push((r) => (r[c] as string) < (v as string))
        return api
      },
      lte: (c: string, v: unknown) => {
        preds.push((r) => (r[c] as number) <= (v as number))
        return api
      },
      gt: (c: string, v: unknown) => {
        preds.push((r) => (r[c] as number) > (v as number))
        return api
      },
      order: (c: string, o?: { ascending?: boolean }) => {
        ordering = { col: c, asc: o?.ascending !== false }
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
      then(onf: (v: { data: unknown; error: null }) => unknown) {
        const rows = (tables[table] ??= [])
        const matches = (r: Row) => preds.every((p) => p(r))
        if (mode === 'insert') {
          const row =
            table === 'match_battle_sessions'
              ? { ...SESSION_DEFAULTS, ...toInsert }
              : { ...toInsert }
          rows.push(row)
          return Promise.resolve({ data: null, error: null }).then(onf)
        }
        if (mode === 'update') {
          tables[table] = rows.map((r) => (matches(r) ? { ...r, ...patch } : r))
          return Promise.resolve({ data: null, error: null }).then(onf)
        }
        if (mode === 'delete') {
          tables[table] = rows.filter((r) => !matches(r))
          return Promise.resolve({ data: null, error: null }).then(onf)
        }
        let result = rows.filter(matches)
        if (ordering) {
          const { col, asc } = ordering
          const d = asc ? 1 : -1
          result = [...result].sort((a, b) => (a[col]! > b[col]! ? d : a[col]! < b[col]! ? -d : 0))
        }
        if (limitN !== null) result = result.slice(0, limitN)
        const data = single ? (result[0] ?? null) : result
        return Promise.resolve({ data, error: null }).then(onf)
      },
    }
    return api
  }
  const db = {
    from: (t: string) => builder(t),
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === 'append_battle_order') {
        // Mirrors the migration's atomic conditional UPDATE: the append lands ONLY when the
        // target column's current length equals p_expected, else OC409 (→ ORDERS_CONFLICT).
        // This is what makes a stale same-seat double-submit fail-loud instead of lost-update.
        const row = (tables.match_battle_sessions ?? []).find((r) => r.match_id === args.p_match_id)
        const col = args.p_column as string
        const arr = row ? (row[col] as unknown[]) : undefined
        if (!row || !arr || arr.length !== (args.p_expected as number)) {
          return Promise.resolve({ data: null, error: { code: 'OC409', message: 'stale' } })
        }
        // Replace (not mutate in place) so the row owns a fresh array — the real UPDATE writes
        // a new jsonb value, and in-place push would corrupt shared default arrays across tests.
        row[col] = [...arr, args.p_element]
        if (args.p_set_interactive) row.defender_interactive = true
        return Promise.resolve({ data: (row[col] as unknown[]).length, error: null })
      }
      if (fn !== 'append_match_action') throw new Error(`fakeDb: unhandled rpc ${fn}`)
      const seq = (args.p_prior_count as number) + 1
      ;(tables.match_actions ??= []).push({
        match_id: args.p_match_id,
        seq,
        action: args.p_action,
      })
      const m = (tables.matches ?? []).find((x) => x.id === args.p_match_id)
      if (m) m.action_count = seq
      return Promise.resolve({ data: seq, error: null })
    },
    channel: () => ({ send: () => Promise.resolve('ok') }),
  }
  return db as unknown as Db
}

/** Seed a fresh fake DB from a base GameState at snapshot 0, action_count 0. */
function seedTables(state: GameState): Record<string, Row[]> {
  return {
    matches: [
      {
        id: 'm1',
        status: 'active',
        seed: 7,
        settings: SETTINGS,
        action_count: 0,
        turn_deadline: null,
      },
    ],
    match_snapshots: [{ match_id: 'm1', seq: 0, state }],
    match_actions: [],
    match_players: [
      { match_id: 'm1', seat: 0, user_id: 'u0', status: 'active', alliance_id: null },
      { match_id: 'm1', seat: 1, user_id: 'u1', status: 'active', alliance_id: null },
    ],
    match_battle_sessions: [],
  }
}

/** Drive the attacker seat through the session round by round, always picking the first
 * available tactic, until it resolves. Returns the resolved outcome and the picks recorded. */
async function driveAttacker(
  db: Db,
  first: BattleSessionOutcome,
): Promise<{ resolved: Extract<BattleSessionOutcome, { kind: 'resolved' }>; picks: TacticId[] }> {
  const picks: TacticId[] = []
  let outcome = first
  let guard = 0
  while (outcome.kind === 'awaitingTactic') {
    if (++guard > 200) throw new Error('battle did not resolve')
    const pick = outcome.ctx.available.includes('broadside')
      ? 'broadside'
      : outcome.ctx.available[0]!
    outcome = await appendBattleOrder(db, 'm1', 0, picks.length, { tactic: pick })
    picks.push(pick)
  }
  if (outcome.kind !== 'resolved') throw new Error(`battle ended in ${outcome.kind}, not resolved`)
  return { resolved: outcome, picks }
}

/** Recursively assert no object key named `banned` appears anywhere in `value`. */
function assertNoKey(value: unknown, banned: string, path = '$'): void {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoKey(v, banned, `${path}[${i}]`))
    return
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === banned) throw new Error(`leaked key '${banned}' at ${path}.${k}`)
    assertNoKey(v, banned, `${path}.${k}`)
  }
}

/** Assert no LIVE `rngState` (actual RNG bytes) rides anywhere in `value`. A `PlayerView`
 * deliberately carries `rngState: null` — a phantom field that makes the view structurally
 * distinct from a `GameState` (playerView.ts) — so `null` is fine; a non-null value is the
 * leak the anti-cheat boundary forbids (§2.3, MULTIPLAYER.md §7). */
function assertNoLiveRng(value: unknown, path = '$'): void {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoLiveRng(v, `${path}[${i}]`))
    return
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === 'rngState' && v !== null) throw new Error(`live rngState leaked at ${path}.${k}`)
    assertNoLiveRng(v, `${path}.${k}`)
  }
}

Deno.test('openBattleSession: round 1 awaits a tactic and writes the session row', async () => {
  const state = adjacentGame()
  const tables = seedTables(state)
  const db = fakeDb(tables)

  const { seq, outcome } = await openBattleSession(db, 'm1', 0, {
    expectedSeq: 0,
    ...attackIds(state),
  })

  assertEquals(seq, 0)
  assertEquals(outcome.kind, 'awaitingTactic')
  assertEquals(tables.match_battle_sessions.length, 1)
  assertEquals(tables.match_battle_sessions[0]!.attacker_seat, 0)
  assertEquals(tables.match_battle_sessions[0]!.defender_seat, 1)
  // The attack has NOT been appended yet — commitment is the session row, not the log.
  assertEquals(tables.match_actions.length, 0)
})

Deno.test(
  'openBattleSession: an illegal attack (out of range) is rejected, no session written',
  async () => {
    const state = createGame(buildMatchConfig(7, 'small', SEATS)) // captains at their far start tiles
    const tables = seedTables(state)
    const db = fakeDb(tables)

    const err = await assertRejects(
      () => openBattleSession(db, 'm1', 0, { expectedSeq: 0, ...attackIds(state) }),
      AppError,
    )
    assertEquals(err.code, 'INVALID_ACTION')
    assertEquals(tables.match_battle_sessions.length, 0)
  },
)

Deno.test(
  'session resolves to the SAME battle report the reducer produces for the same prefix',
  async () => {
    const state = adjacentGame()
    const db = fakeDb(seedTables(state))

    const { outcome } = await openBattleSession(db, 'm1', 0, {
      expectedSeq: 0,
      ...attackIds(state),
    })
    const { resolved, picks } = await driveAttacker(db, outcome)

    const action: AttackCaptainAction = {
      type: 'attackCaptain',
      playerId: 'seat-0',
      ...attackIds(state),
      attackerOrders: picks,
    }
    const direct = applyActionWithOutcome(adjacentGame(), action)
    assertEquals(JSON.stringify(resolved.battleReport), JSON.stringify(direct.battleReport))
    // Resolution appended exactly one attackCaptain and cleared the session.
    assertEquals(resolved.seq, 1)
  },
)

Deno.test(
  'two-seat: a defender-recorded tactic is carried into resolution (server-authored defenderOrders)',
  async () => {
    const state = adjacentGame()
    const tables = seedTables(state)
    const db = fakeDb(tables)

    await openBattleSession(db, 'm1', 0, { expectedSeq: 0, ...attackIds(state) })
    // The defender seat records one pick BEFORE the attacker drives the fight.
    const rec = await appendBattleOrder(db, 'm1', 1, 0, { tactic: 'broadside' })
    assertEquals(rec, { kind: 'recorded', tacticOrders: 1, boardCommands: 0 })
    const row = tables.match_battle_sessions[0]!
    assertEquals(row.defender_interactive, true)
    assertEquals(row.defender_tactic_orders, ['broadside'])

    const ctx = await battleContext(db, 'm1', 0)
    const { resolved, picks } = await driveAttacker(db, ctx)

    // The session's resolved report is byte-identical to the reducer applying the one logged
    // action WITH the defender's recorded pick as server-authored `defenderOrders` — proof the
    // defender seat's picks flow into the single `attackCaptain` the session resolves to. (That
    // the defender's picks CHANGE a fight is proven at the engine layer in defenderOrders.test.)
    const direct = applyActionWithOutcome(adjacentGame(), {
      type: 'attackCaptain',
      playerId: 'seat-0',
      ...attackIds(state),
      attackerOrders: picks,
      defenderOrders: ['broadside'],
    })
    assertEquals(JSON.stringify(resolved.battleReport), JSON.stringify(direct.battleReport))
  },
)

Deno.test('appendBattleOrder: a stale per-side expectedOrders is ORDERS_CONFLICT', async () => {
  const state = adjacentGame()
  const db = fakeDb(seedTables(state))
  await openBattleSession(db, 'm1', 0, { expectedSeq: 0, ...attackIds(state) })

  const err = await assertRejects(
    () => appendBattleOrder(db, 'm1', 0, 5, { tactic: 'broadside' }), // list is length 0, not 5
    AppError,
  )
  assertEquals(err.code, 'ORDERS_CONFLICT')
})

Deno.test(
  'appendBattleOrder: concurrent same-seat double-submit — the stale second write is rejected, not lost (#293)',
  async () => {
    const state = adjacentGame()
    const tables = seedTables(state)
    const db = fakeDb(tables)
    await openBattleSession(db, 'm1', 0, { expectedSeq: 0, ...attackIds(state) })

    // A double-tap / retry: BOTH calls carry the SAME expectedOrders=0, the length each read
    // before either wrote. The first append lands; because the length CAS lives in the RPC's
    // WHERE clause (not a check-then-act read in JS), the second re-evaluates against the
    // committed new length (1 != 0) and gets a deterministic ORDERS_CONFLICT — it can never
    // silently overwrite the first's just-appended order (the #293 lost-update).
    const first = await appendBattleOrder(db, 'm1', 1, 0, { tactic: 'ram' })
    assertEquals(first.kind, 'recorded')
    const err = await assertRejects(
      () => appendBattleOrder(db, 'm1', 1, 0, { tactic: 'broadside' }),
      AppError,
    )
    assertEquals(err.code, 'ORDERS_CONFLICT')
    // The first write survived intact: exactly one order recorded, no reorder, no drop.
    assertEquals(tables.match_battle_sessions[0]!.defender_tactic_orders, ['ram'])
  },
)

Deno.test('appendBattleOrder: a non-participant seat is NOT_A_PARTICIPANT', async () => {
  const state = adjacentGame()
  const db = fakeDb(seedTables(state))
  await openBattleSession(db, 'm1', 0, { expectedSeq: 0, ...attackIds(state) })

  const err = await assertRejects(
    () => appendBattleOrder(db, 'm1', 2, 0, { tactic: 'broadside' }),
    AppError,
  )
  assertEquals(err.code, 'NOT_A_PARTICIPANT')
})

Deno.test(
  'appendBattleOrder: a defender board command records to its own list and flips interactive',
  async () => {
    const state = adjacentGame()
    const tables = seedTables(state)
    const db = fakeDb(tables)
    await openBattleSession(db, 'm1', 0, { expectedSeq: 0, ...attackIds(state) })

    const out = await appendBattleOrder(db, 'm1', 1, 0, { boardCommand: { stackId: 0 } })
    assertEquals(out, { kind: 'recorded', tacticOrders: 0, boardCommands: 1 })
    const row = tables.match_battle_sessions[0]!
    assertEquals(row.defender_interactive, true)
    assertEquals((row.defender_board_commands as unknown[]).length, 1)
    assertEquals((row.attacker_board_commands as unknown[]).length, 0)
  },
)

Deno.test(
  'autoResolveBattleSession: forced resolution from a partial prefix == reducer with that prefix (cyclic wrap)',
  async () => {
    const state = adjacentGame()
    const db = fakeDb(seedTables(state))

    const { outcome } = await openBattleSession(db, 'm1', 0, {
      expectedSeq: 0,
      ...attackIds(state),
    })
    assertEquals(outcome.kind, 'awaitingTactic')
    // Record exactly ONE round, then bail out via the auto-fight button.
    await appendBattleOrder(db, 'm1', 0, 0, { tactic: 'ram' })
    const resolved = await autoResolveBattleSession(db, 'm1', 0)

    const direct = applyActionWithOutcome(adjacentGame(), {
      type: 'attackCaptain',
      playerId: 'seat-0',
      ...attackIds(state),
      attackerOrders: ['ram'], // tacticPlanDriver cyclically wraps this single pick — D-028
    })
    assertEquals(JSON.stringify(resolved.battleReport), JSON.stringify(direct.battleReport))
  },
)

Deno.test('autoResolveBattleSession: only the attacker may force-resolve', async () => {
  const state = adjacentGame()
  const db = fakeDb(seedTables(state))
  await openBattleSession(db, 'm1', 0, { expectedSeq: 0, ...attackIds(state) })

  const err = await assertRejects(() => autoResolveBattleSession(db, 'm1', 1), AppError)
  assertEquals(err.code, 'NOT_A_PARTICIPANT')
})

Deno.test(
  'leak audit: no rngState or standing-orders bytes in any session response (§7/§10.6)',
  async () => {
    const state = adjacentGame()
    const db = fakeDb(seedTables(state))

    const { outcome } = await openBattleSession(db, 'm1', 0, {
      expectedSeq: 0,
      ...attackIds(state),
    })
    const { resolved } = await driveAttacker(db, outcome)

    for (const response of [outcome, resolved]) {
      // No LIVE rngState anywhere — the only `rngState` allowed is the view's phantom `null`.
      assertNoLiveRng(response)
      // The defender's standing orders / doctrine are consumed server-side and never
      // serialized to the attacker (§2.3): no order-list keys ride in the outcome.
      assertNoKey(response, 'standingOrders')
      assertNoKey(response, 'boardOrders')
      assertNoKey(response, 'defenderOrders')
    }
    // The resolved view carries the phantom null, never real RNG bytes.
    assertEquals((resolved.view as unknown as { rngState: unknown }).rngState, null)
  },
)

Deno.test(
  'leak audit: a defender-facing response carries no attacker order bytes or attacker PlayerView (§10.6)',
  async () => {
    const state = adjacentGame()
    const tables = seedTables(state)
    const db = fakeDb(tables)
    await openBattleSession(db, 'm1', 0, { expectedSeq: 0, ...attackIds(state) })

    // The attacker records a distinctive naval plan; then the DEFENDER polls context and
    // records its own pick. Neither the poll nor the ack may carry the attacker's recorded
    // orders or a PlayerView — the defender read path must be numeric-only and NEVER resolve.
    await appendBattleOrder(db, 'm1', 0, 0, { tactic: 'ram' })
    const ctx = await battleContext(db, 'm1', 1)
    const rec = await appendBattleOrder(db, 'm1', 1, 0, { tactic: 'broadside' })

    for (const response of [ctx, rec]) {
      // No attacker recorded-order list bytes (raw columns or the action's server-authored keys).
      assertNoKey(response, 'attacker_tactic_orders')
      assertNoKey(response, 'attacker_board_commands')
      assertNoKey(response, 'attackerOrders')
      assertNoKey(response, 'defenderOrders')
      // No PlayerView — the attacker's whole visible board/resources. The defender read path
      // never resolves, so no `players`/`viewerId` view shape can ride here.
      assertNoKey(response, 'players')
      assertNoKey(response, 'viewerId')
      assertNoLiveRng(response)
      // The attacker's actual naval pick ('ram') appears nowhere in the serialized bytes.
      if (JSON.stringify(response).includes('ram')) {
        throw new Error(`attacker order value leaked into a defender-facing ${response.kind}`)
      }
    }
    // Both defender-facing responses are the numeric-only `recorded` ack.
    assertEquals(ctx.kind, 'recorded')
    assertEquals(rec.kind, 'recorded')
  },
)

Deno.test(
  'assertNoBattlePending: blocks the attacker seat, lets the defender seat through (§2.2)',
  async () => {
    const state = adjacentGame()
    const db = fakeDb(seedTables(state))
    await openBattleSession(db, 'm1', 0, { expectedSeq: 0, ...attackIds(state) })

    const err = await assertRejects(() => assertNoBattlePending(db, 'm1', 0), AppError)
    assertEquals(err.code, 'BATTLE_PENDING')
    // The defender's own actions advance no match state, so they are not guarded.
    await assertNoBattlePending(db, 'm1', 1)
  },
)

Deno.test(
  'findExpiredBattleSessions: returns sessions past their whole-battle deadline',
  async () => {
    const state = adjacentGame()
    const tables = seedTables(state)
    tables.match_battle_sessions.push({
      ...SESSION_DEFAULTS,
      match_id: 'm1',
      attacker_seat: 0,
      defender_seat: 1,
      base_seq: 0,
      ...attackIds(state),
      deadline: '2000-01-01T00:00:00.000Z', // long past
    })
    const expired = await findExpiredBattleSessions(fakeDb(tables))
    assertEquals(expired, ['m1'])
  },
)
