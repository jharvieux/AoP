import { ENGINE_VERSION } from '@aop/shared'
import { BUILDINGS } from './buildings'
import { combatStatsData } from './combat'
import { ENCOUNTERS } from './encounters'
import { FACTIONS } from './factions'
import { RESOURCE_NODES } from './resourceNodes'
import { SHIP_CLASSES } from './ships'
import { CAPTAIN_XP_THRESHOLDS, SKILLS } from './skills'
import { AI_TUNING, GAME_SETUP } from './tuning'

/**
 * A deterministic, non-cryptographic 32-bit FNV-1a hash, hex-encoded. Chosen
 * over `crypto.subtle` because it runs identically with no async round trip
 * in both the browser bundle and the Deno edge functions — this only needs to
 * be a stable fingerprint, not tamper-proof.
 */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * A fingerprint of every `@aop/content` balance table that feeds a
 * `GameConfig` (#251). `ENGINE_VERSION` alone only tracks `@aop/engine` code
 * changes — a pure content/balance edit (a unit's stats, a building cost, AI
 * tuning) left it untouched, so the replay version guard
 * (`apps/web/src/multiplayer/matchReplay.ts`, docs/MULTIPLAYER.md §10) could
 * never fire for the most common kind of post-launch deploy. Folding this
 * into {@link engineVersionStamp} closes that gap: any change to the content
 * hashed here changes the stamp pinned into `matches.engine_version`.
 *
 * Hashes the whole exported shape of each table, including display-only text
 * (names, descriptions) — this only needs to be *sensitive*, not minimal. A
 * cosmetic-only edit forcing an extra version bump is a harmless false
 * positive; missing a balance change would not be.
 */
export function contentVersion(): string {
  const snapshot = {
    factions: FACTIONS,
    buildings: BUILDINGS,
    ships: SHIP_CLASSES,
    skills: SKILLS,
    captainXpThresholds: CAPTAIN_XP_THRESHOLDS,
    encounters: ENCOUNTERS,
    resourceNodes: RESOURCE_NODES,
    gameSetup: GAME_SETUP,
    aiTuning: AI_TUNING,
    combatStats: combatStatsData(),
  }
  return fnv1aHex(JSON.stringify(snapshot))
}

/**
 * The value pinned into `matches.engine_version` at match creation and
 * compared by the client replay guard: `ENGINE_VERSION` (the manually-bumped
 * `@aop/engine` build tag — still requires a human to bump it alongside a
 * breaking engine change) combined with {@link contentVersion} (automatically
 * sensitive to any `@aop/content` change, no manual bump needed). Lives here
 * rather than in `@aop/shared` because computing it needs `@aop/content`'s
 * data and `@aop/shared` must stay dependency-free (docs/MULTIPLAYER.md §2);
 * `@aop/content` already depends on `@aop/shared`, so the composition can only
 * happen on this side of that boundary.
 */
export function engineVersionStamp(): string {
  return `${ENGINE_VERSION}+${contentVersion()}`
}
