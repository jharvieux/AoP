import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { MAX_CHAT_LENGTH } from './multiplayer'
import { MAP_CODE_MAX_BYTES, MAP_NAME_MAX_LENGTH, REPORT_REASON_MAX_LENGTH } from './communityMaps'

/**
 * Parity check: TS constants are mirrored by SQL check constraints in
 * migrations. Migrations are immutable once applied, so bumping a TS constant
 * without a companion migration desynchronizes the two tiers — constraint
 * violations start arriving as raw 500s instead of friendly client-side errors.
 *
 * This test reads the latest migration files and asserts the TS constant values
 * appear in the newest constraint definition per column. If a constant changes,
 * you MUST add a new migration (never edit an applied one).
 *
 * Related issues: #256 (parity guard), migration notes (each constant is
 * documented with "requires a companion migration").
 */
describe('TS constants ↔ SQL constraints parity', () => {
  function readMigration(filename: string): string {
    // Walk up from packages/shared/src to repo root, then into supabase/migrations
    const currentFile = new URL(import.meta.url).pathname
    const packageDir = path.dirname(path.dirname(currentFile))
    const repoRoot = path.dirname(path.dirname(packageDir))
    const migrationsDir = path.join(repoRoot, 'supabase', 'migrations')
    const filepath = path.join(migrationsDir, filename)
    return fs.readFileSync(filepath, 'utf-8')
  }

  it('MAX_CHAT_LENGTH appears in match_chat.sql body constraint', () => {
    const sql = readMigration('20260705000002_match_chat.sql')
    // The constraint is: `body text not null check (char_length(body) between 1 and 500)`
    const pattern = `char_length(body) between 1 and ${MAX_CHAT_LENGTH}`
    expect(sql).toContain(pattern)
  })

  it('MAP_NAME_MAX_LENGTH appears in community_maps.sql name constraint', () => {
    const sql = readMigration('20260707063000_community_maps.sql')
    // The constraint is: `name text not null check (char_length(name) between 1 and 60)`
    const pattern = `char_length(name) between 1 and ${MAP_NAME_MAX_LENGTH}`
    expect(sql).toContain(pattern)
  })

  it('MAP_CODE_MAX_BYTES appears in the map_code cap migration constraint', () => {
    // 20260714000000 (#507) supersedes the original 64 KiB inline check from
    // 20260707063000_community_maps.sql — the newest constraint per column wins.
    const sql = readMigration('20260714000000_community_maps_map_code_cap.sql')
    // The constraint is: `check (octet_length(map_code) <= 262144)`
    const pattern = `octet_length(map_code) <= ${MAP_CODE_MAX_BYTES}`
    expect(sql).toContain(pattern)
  })

  it('REPORT_REASON_MAX_LENGTH appears in community_maps.sql reason constraint', () => {
    const sql = readMigration('20260707063000_community_maps.sql')
    // The constraint is: `reason text check (char_length(reason) <= 500)`
    const pattern = `char_length(reason) <= ${REPORT_REASON_MAX_LENGTH}`
    expect(sql).toContain(pattern)
  })
})
