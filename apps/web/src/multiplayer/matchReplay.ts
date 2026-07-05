import type { Action, GameConfig } from '@aop/engine'
import { ENGINE_VERSION, type FactionId, type MapSize } from '@aop/shared'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { buildMatchConfig, type SeatConfig } from './matchConfig'

/**
 * The `@aop/engine` version this client bundle was built against, re-exported
 * from `@aop/shared`'s `ENGINE_VERSION` — the single source of truth also
 * pinned into `matches.engine_version` by `supabase/functions/create-match`,
 * so the server and client constants can never silently drift apart on a
 * future engine version bump. See the version guard in `loadMatchReplay`
 * below and docs/MULTIPLAYER.md §10.
 */
export const CLIENT_ENGINE_VERSION = ENGINE_VERSION

/**
 * Thrown when a match was played on a different `@aop/engine` version than
 * this client bundle. Replaying a mismatched version can silently diverge —
 * MULTIPLAYER.md §10 forbids it outright — so callers must show this message
 * instead of attempting the replay.
 */
export class ReplayVersionMismatchError extends Error {
  constructor(
    readonly matchVersion: string,
    readonly clientVersion: string,
  ) {
    super(
      `This match was played on engine v${matchVersion}, but this app is running ` +
        `v${clientVersion}. Replays are only valid on the exact engine version that ` +
        'produced them, so this one cannot be shown here.',
    )
    this.name = 'ReplayVersionMismatchError'
  }
}

export interface MatchReplayData {
  config: GameConfig
  actions: Action[]
}

interface MatchRow {
  id: string
  status: string
  settings: { mapSize: MapSize }
  engine_version: string
}

interface SeatRow {
  seat: number
  user_id: string | null
  faction: FactionId
}

interface ActionRow {
  seq: number
  action: Action
}

interface ProfileRow {
  id: string
  display_name: string
}

/**
 * Loads a finished match's config + full action log for the #146 replay
 * viewer. Every read goes through PostgREST with the caller's own access
 * token, so the existing RLS policies
 * (supabase/migrations/20260702000001_rls_policies.sql) enforce the
 * participant-only rules unchanged: `matches` and `match_players` are
 * seated-only, so a non-participant's `matches` read comes back empty before
 * `match_actions` (readable to anyone once finished) is ever reached. The one
 * exception is `matches.seed`, which #135 removed from the client-selectable
 * columns (RLS is row- not column-level, so a seated player could otherwise read
 * it mid-match and predict RNG); it now comes through the `match_seed`
 * security-definer RPC, gated on `status = 'finished'` plus seat membership.
 */
export class MatchReplayClient {
  private readonly url: string
  private readonly anonKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: SupabaseConfig, fetchImpl: typeof fetch = fetch) {
    this.url = config.url.replace(/\/$/, '')
    this.anonKey = config.anonKey
    this.fetchImpl = fetchImpl
  }

  async loadMatchReplay(session: AuthSession, matchId: string): Promise<MatchReplayData> {
    const match = await this.fetchOne<MatchRow>(
      session,
      `/rest/v1/matches?id=eq.${encodeURIComponent(matchId)}` +
        '&select=id,status,settings,engine_version',
    )
    if (!match) {
      throw new Error('No such match, or you do not hold a seat in it.')
    }
    if (match.status !== 'finished') {
      throw new Error('Replays are only available once a match has finished.')
    }
    if (match.engine_version !== CLIENT_ENGINE_VERSION) {
      throw new ReplayVersionMismatchError(match.engine_version, CLIENT_ENGINE_VERSION)
    }

    // `seed` is not a directly selectable column for client roles (#135): it is
    // exposed only through the `match_seed` security-definer RPC, which returns
    // it solely for a finished match the caller is seated in. The match row above
    // already proved both, so this call succeeds for exactly the replays we load.
    const seed = await this.fetchSeed(session, matchId)

    const seats = await this.fetchMany<SeatRow>(
      session,
      `/rest/v1/match_players?match_id=eq.${encodeURIComponent(matchId)}` +
        '&select=seat,user_id,faction&order=seat.asc',
    )
    if (seats.length === 0) {
      throw new Error('This match has no seats on record.')
    }

    const humanIds = seats.map((s) => s.user_id).filter((id): id is string => id !== null)
    const names = new Map<string, string>()
    if (humanIds.length > 0) {
      const inList = humanIds.map((id) => encodeURIComponent(id)).join(',')
      const profiles = await this.fetchMany<ProfileRow>(
        session,
        `/rest/v1/profiles?id=in.(${inList})&select=id,display_name`,
      )
      for (const p of profiles) names.set(p.id, p.display_name)
    }

    const seatConfigs: SeatConfig[] = seats.map((s) => ({
      seat: s.seat,
      faction: s.faction,
      isAI: s.user_id === null,
      displayName: s.user_id ? (names.get(s.user_id) ?? `Seat ${s.seat}`) : `AI ${s.seat}`,
    }))

    const config = buildMatchConfig(seed, match.settings.mapSize, seatConfigs)

    const actionRows = await this.fetchMany<ActionRow>(
      session,
      `/rest/v1/match_actions?match_id=eq.${encodeURIComponent(matchId)}` +
        '&select=seq,action&order=seq.asc',
    )

    return { config, actions: actionRows.map((r) => r.action) }
  }

  private headers(session: AuthSession): Record<string, string> {
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${session.accessToken}`,
    }
  }

  /** Fetch the match seed via the `match_seed` security-definer RPC (#135). */
  private async fetchSeed(session: AuthSession, matchId: string): Promise<number> {
    const res = await this.fetchImpl(`${this.url}/rest/v1/rpc/match_seed`, {
      method: 'POST',
      headers: { ...this.headers(session), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_match_id: matchId }),
    })
    if (!res.ok) throw new Error(`Could not load replay data (${res.status}).`)
    const value = (await res.json().catch(() => null)) as unknown
    const seed = Number(value)
    if (value === null || !Number.isFinite(seed)) {
      throw new Error('No such match, or you do not hold a seat in it.')
    }
    return seed
  }

  private async fetchMany<T>(session: AuthSession, path: string): Promise<T[]> {
    const res = await this.fetchImpl(`${this.url}${path}`, { headers: this.headers(session) })
    if (!res.ok) throw new Error(`Could not load replay data (${res.status}).`)
    const rows = (await res.json().catch(() => [])) as unknown
    return Array.isArray(rows) ? (rows as T[]) : []
  }

  private async fetchOne<T>(session: AuthSession, path: string): Promise<T | null> {
    const rows = await this.fetchMany<T>(session, path)
    return rows[0] ?? null
  }
}
