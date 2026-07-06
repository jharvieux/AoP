/**
 * Community map library policy (#63 Tier 2) — the pure half of the
 * publish/browse/report/remove Edge Functions, unit-testable without a live
 * Supabase stack (same split as `matchmaking.ts` / `leaderboard.ts`).
 *
 * Abuse-surface decisions live here as data so they are named, tested, and
 * changed in one place:
 *
 *  - **Size cap** ({@link MAP_CODE_MAX_BYTES}): the largest *legal* map
 *    (40x40, the engine's `maxSize`) with zero RLE compression encodes to
 *    roughly 30 KiB, so 64 KiB is ~2x headroom for any real map while
 *    rejecting megabyte spam payloads outright.
 *  - **Publish rate limit** ({@link PUBLISH_MAX_PER_WINDOW} per
 *    {@link PUBLISH_WINDOW_MS}): 5 maps/hour/author. Authoring a map takes
 *    minutes at minimum, so an honest author never notices; a spam script is
 *    capped at 120 rows/day per registered account. Removed maps still count
 *    toward the window (rows are soft-deleted), so remove-and-republish is
 *    not a bypass.
 *  - **Auto-hide threshold** ({@link REPORT_AUTO_HIDE_THRESHOLD}): a
 *    published map is hidden pending manual review once 3 *distinct
 *    registered* (non-guest) accounts report it. One malicious or mistaken
 *    report can never take a map down, and guest/anonymous sessions — free to
 *    mass-create — are recorded but never counted toward the threshold, so
 *    the trivial Sybil attack ("spin up 3 anon sessions, hide any map")
 *    doesn't work. Hiding is reversible: a moderator restores by setting
 *    `status` back to `published` (see the migration's notes).
 */

import { utf8ByteLength } from './mapCodes'

/**
 * Largest legal map code size in bytes. The largest legal map (40x40) with
 * zero RLE compression encodes to ~30 KiB, so 64 KiB is ~2x headroom for any
 * real map while rejecting megabyte spam payloads outright. Mirrored by
 * `community_maps.sql` (`octet_length(map_code) <= 65536`). Changing this
 * REQUIRES a companion migration — never edit an applied migration.
 * Verified by `constants-parity.test.ts`.
 */
export const MAP_CODE_MAX_BYTES = 64 * 1024

/**
 * Maximum length of a community map's published name. Mirrored by
 * `community_maps.sql` (`char_length(name) between 1 and 60`). Changing this
 * REQUIRES a companion migration — never edit an applied migration.
 * Verified by `constants-parity.test.ts`.
 */
export const MAP_NAME_MAX_LENGTH = 60

/**
 * Maximum length of a map report reason. Mirrored by `community_maps.sql`
 * (`char_length(reason) <= 500`). Changing this REQUIRES a companion
 * migration — never edit an applied migration. Verified by
 * `constants-parity.test.ts`.
 */
export const REPORT_REASON_MAX_LENGTH = 500
export const REPORT_AUTO_HIDE_THRESHOLD = 3
export const PUBLISH_MAX_PER_WINDOW = 5
export const PUBLISH_WINDOW_MS = 60 * 60 * 1000

/** Hard cap on one page of the library browser — a browsing list, not a feed. */
export const COMMUNITY_MAP_PAGE_MAX = 50

/**
 * The safe public projection of a `community_maps` row — what `browse-maps`
 * returns. Never the `map_code` itself (that's `download-map`, which also
 * counts the download) and never report counts or status (moderation state is
 * not a public signal; hidden/removed rows simply don't appear).
 */
export interface CommunityMapSummary {
  mapId: string
  name: string
  /** The author's profile id — lets a client mark "yours" and offer Remove. */
  authorId: string
  authorName: string
  width: number
  height: number
  playerCount: number
  downloadCount: number
  /** ISO-8601 publish time; half of the keyset-pagination cursor. */
  createdAt: string
}

/** Keyset cursor `(createdAt, mapId)` — same composite-tuple design as the
 * match browser's `OpenMatchCursor` (#150), for the same same-timestamp
 * page-boundary reason. */
export interface CommunityMapCursor {
  createdAt: string
  mapId: string
}

/** Separator for the encoded cursor. Safe: ISO timestamps and UUIDs never contain it. */
const CURSOR_SEP = '|'

export function encodeCommunityMapCursor(cursor: CommunityMapCursor): string {
  return `${cursor.createdAt}${CURSOR_SEP}${cursor.mapId}`
}

export function decodeCommunityMapCursor(raw: unknown): CommunityMapCursor | null {
  if (typeof raw !== 'string') return null
  const sep = raw.indexOf(CURSOR_SEP)
  if (sep <= 0 || sep >= raw.length - 1) return null
  return { createdAt: raw.slice(0, sep), mapId: raw.slice(sep + 1) }
}

export interface CommunityMapQuery {
  /** Case-insensitive substring match against the map name. */
  search?: string
  /** Requested page size; silently clamped to `1..COMMUNITY_MAP_PAGE_MAX`. */
  limit?: number
  before?: CommunityMapCursor | null
}

export function clampCommunityMapLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return COMMUNITY_MAP_PAGE_MAX
  return Math.min(Math.max(1, Math.floor(limit)), COMMUNITY_MAP_PAGE_MAX)
}

/** Newest first, `mapId` descending as a stable tiebreaker. */
function compareMaps(a: CommunityMapSummary, b: CommunityMapSummary): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.mapId < b.mapId ? 1 : a.mapId > b.mapId ? -1 : 0
}

function isAfterCursor(m: CommunityMapSummary, cursor: CommunityMapCursor): boolean {
  if (m.createdAt !== cursor.createdAt) return m.createdAt < cursor.createdAt
  return m.mapId < cursor.mapId
}

/**
 * Filter, sort, and page the library list. Pure; the Edge Function's SQL
 * applies the coarse filters (`status = 'published'`, an `ilike` name
 * pre-filter, a `<= createdAt` cursor pre-filter) and this applies the
 * precise policy — exactly the `selectOpenMatches` split from #150.
 */
export function selectCommunityMaps(
  candidates: readonly CommunityMapSummary[],
  query: CommunityMapQuery = {},
): CommunityMapSummary[] {
  const before = query.before ?? null
  const search = query.search?.trim().toLowerCase() ?? ''
  return candidates
    .filter((m) => search === '' || m.name.toLowerCase().includes(search))
    .filter((m) => before === null || isAfterCursor(m, before))
    .sort(compareMaps)
    .slice(0, clampCommunityMapLimit(query.limit))
}

/**
 * Normalize a submitted map name: must be a string; whitespace is trimmed and
 * inner runs collapsed; the result must be 1..{@link MAP_NAME_MAX_LENGTH}
 * characters. `null` means "reject the request", never "use a default" — a
 * publish with no usable name is a client bug, not something to paper over.
 */
export function normalizeMapName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name.length < 1 || name.length > MAP_NAME_MAX_LENGTH) return null
  return name
}

/**
 * Normalize an optional report reason: absent/blank → `null` (a bare report
 * is fine); anything else is trimmed and truncated to
 * {@link REPORT_REASON_MAX_LENGTH} — a report is a flag for human review, so
 * an over-long reason is clipped rather than rejected.
 */
export function normalizeReportReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const reason = raw.trim()
  if (reason === '') return null
  return reason.slice(0, REPORT_REASON_MAX_LENGTH)
}

/** True when a map code's UTF-8 byte length exceeds {@link MAP_CODE_MAX_BYTES}. */
export function mapCodeExceedsSizeLimit(code: string): boolean {
  return utf8ByteLength(code) > MAP_CODE_MAX_BYTES
}

/** True when an author who already published `recentPublishCount` maps inside the window must be throttled. */
export function publishRateLimited(recentPublishCount: number): boolean {
  return recentPublishCount >= PUBLISH_MAX_PER_WINDOW
}

/** Escape `%`, `_`, and `\` for safe interpolation into a SQL `ilike` pattern. */
export function escapeIlikePattern(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
