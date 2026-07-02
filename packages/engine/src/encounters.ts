/**
 * Random encounters (#23): merchants, natives, and settlers scattered across the
 * open sea by the map generator. Placement is a pure function of the seeded RNG,
 * and every outcome resolves from the same RNG stream that lives in GameState, so
 * spawns and results replay identically on every machine.
 */

import type { Coord, FactionId, ResourcePool } from '@aop/shared'
import { chebyshevDistance } from '@aop/shared'
import type { EncounterCatalogLike, EncounterChoiceLike, EncounterKind } from './content'
import { isWaterTile, tileAt, type GameMap } from './map'
import { nextFloat, nextInt, type RngState } from './rng'
import type { EncounterState, TroopStack } from './types'

const KINDS: readonly EncounterKind[] = ['merchant', 'natives', 'settlers']

/** Keep encounters off each player's doorstep so starts don't hand out free loot. */
const MIN_START_DISTANCE = 4

/**
 * Deterministically scatter encounter entities across navigable water. Consumes
 * and returns the RNG so createGame can fold the advanced state back into the
 * match — replays reproduce the exact same board.
 */
export function spawnEncounters(
  map: GameMap,
  catalog: EncounterCatalogLike,
  rng: RngState,
  startPositions: readonly Coord[],
): { encounters: EncounterState[]; rng: RngState } {
  const water: Coord[] = []
  const candidates: Coord[] = []
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const coord = { x, y }
      if (!isWaterTile(tileAt(map, coord))) continue
      water.push(coord)
      const clearOfStarts = startPositions.every(
        (s) => chebyshevDistance(s, coord) >= MIN_START_DISTANCE,
      )
      if (clearOfStarts) candidates.push(coord)
    }
  }

  const target = Math.floor(water.length * catalog.spawnDensity)
  const count = Math.min(target, candidates.length)

  // Fisher–Yates over the candidate pool, seeded — the first `count` tiles win.
  let state = rng
  for (let i = candidates.length - 1; i > 0; i--) {
    let j: number
    ;[state, j] = nextInt(state, 0, i)
    const tmp = candidates[i]!
    candidates[i] = candidates[j]!
    candidates[j] = tmp
  }

  const encounters: EncounterState[] = []
  for (let i = 0; i < count; i++) {
    let k: number
    ;[state, k] = nextInt(state, 0, KINDS.length - 1)
    encounters.push({
      id: `enc-${i}`,
      kind: KINDS[k]!,
      position: { ...candidates[i]! },
      active: true,
      respawnRound: null,
    })
  }
  return { encounters, rng: state }
}

export interface EncounterChoiceResult {
  success: boolean
  rng: RngState
  /** Captain troop list after a successful grant or a failed raid's losses. */
  troops: TroopStack[]
  /** Resources granted to the player (success only; empty otherwise). */
  reward: Partial<ResourcePool>
  /** Captain XP gained (success only). */
  xpGained: number
  /** Unit stack granted on success — surfaced to the outcome dialog. */
  troopsGained?: TroopStack
  /** Troop stacks lost on failure — surfaced to the outcome dialog. */
  troopsLost: TroopStack[]
}

/**
 * Resolve one encounter choice: roll success from the seeded RNG, then compute
 * the captain's new troop list and the player's reward. Pure — the reducer layers
 * on ownership/adjacency/affordability validation and state assembly.
 */
export function resolveEncounterChoice(
  choice: EncounterChoiceLike,
  faction: FactionId,
  troops: readonly TroopStack[],
  crewCapacity: number,
  rng: RngState,
): EncounterChoiceResult {
  const [nextRng, roll] = nextFloat(rng)
  const success = roll < choice.successChance

  if (!success) {
    const troopsLost: TroopStack[] = []
    const pct = choice.failTroopLossPct ?? 0
    const survivors = troops
      .map((stack) => {
        const lost = Math.floor(stack.count * pct)
        if (lost > 0) troopsLost.push({ unitId: stack.unitId, count: lost })
        return { unitId: stack.unitId, count: stack.count - lost }
      })
      .filter((stack) => stack.count > 0)
    return { success: false, rng: nextRng, troops: survivors, reward: {}, xpGained: 0, troopsLost }
  }

  const grantUnit = choice.grantUnitByFaction?.[faction]
  const aboard = troops.reduce((sum, t) => sum + t.count, 0)
  const room = Math.max(0, crewCapacity - aboard)
  const grantCount = grantUnit ? Math.min(choice.grantCount ?? 0, room) : 0

  const troopList = troops.map((t) => ({ ...t }))
  let troopsGained: TroopStack | undefined
  if (grantUnit && grantCount > 0) {
    const existing = troopList.find((t) => t.unitId === grantUnit)
    if (existing) existing.count += grantCount
    else troopList.push({ unitId: grantUnit, count: grantCount })
    troopsGained = { unitId: grantUnit, count: grantCount }
  }

  const result: EncounterChoiceResult = {
    success: true,
    rng: nextRng,
    troops: troopList,
    reward: choice.reward ?? {},
    xpGained: choice.xp ?? 0,
    troopsLost: [],
  }
  if (troopsGained) result.troopsGained = troopsGained
  return result
}

/** Reactivate any encounters whose respawn round has arrived (called on round advance). */
export function reactivateEncounters(
  encounters: readonly EncounterState[],
  round: number,
): EncounterState[] {
  return encounters.map((e) =>
    !e.active && e.respawnRound !== null && e.respawnRound <= round
      ? { ...e, active: true, respawnRound: null }
      : e,
  )
}
