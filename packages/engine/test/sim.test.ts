import { describe, expect, it } from 'vitest'
import type { MapSize } from '@aop/shared'
import { runTournament, simulateMatch, type CombatStatsData, type GameConfig } from '../src'

// Two rosters: 'even_a'/'even_b' are identical (balanced); 'strong'/'weak' are not.
const STATS: CombatStatsData = {
  units: [
    { id: 'even', attack: 5, defense: 3, health: 14 },
    { id: 'strong', attack: 10, defense: 6, health: 30 },
    { id: 'weak', attack: 3, defense: 1, health: 8 },
  ],
  ships: [{ id: 'sloop', hull: 40, cannons: 6 }],
}

function duel(
  seed: number,
  size: MapSize,
  a: { faction: string; unit: string },
  b: { faction: string; unit: string },
): GameConfig {
  return {
    seed,
    mapSize: size,
    combatStats: STATS,
    players: [
      {
        id: 'p1',
        name: 'P1',
        faction: a.faction as never,
        isAI: true,
        startingTroops: [{ unitId: a.unit, count: 6 }],
      },
      {
        id: 'p2',
        name: 'P2',
        faction: b.faction as never,
        isAI: true,
        startingTroops: [{ unitId: b.unit, count: 6 }],
      },
    ],
  }
}

describe('simulateMatch', () => {
  it('is deterministic and always terminates with standings', () => {
    const config = duel(
      1,
      'small',
      { faction: 'pirates', unit: 'even' },
      { faction: 'british', unit: 'even' },
    )
    const r1 = simulateMatch(config)
    const r2 = simulateMatch(config)
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
    expect(r1.standings).toHaveLength(2)
    expect(r1.rounds).toBeGreaterThan(0)
  })

  it('caps runaway matches at maxRounds', () => {
    const config = duel(
      1,
      'large',
      { faction: 'pirates', unit: 'even' },
      { faction: 'british', unit: 'even' },
    )
    const result = simulateMatch(config, { maxRounds: 3 })
    expect(result.rounds).toBeLessThanOrEqual(4)
  })
})

describe('runTournament', () => {
  it('reports a near-even win-rate for identical rosters (seat-mirrored)', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const configs: GameConfig[] = []
    for (const seed of seeds) {
      configs.push(
        duel(
          seed,
          'small',
          { faction: 'pirates', unit: 'even' },
          { faction: 'british', unit: 'even' },
        ),
      )
      // Mirror the seats so any first-mover / seat advantage cancels out.
      configs.push(
        duel(
          seed,
          'small',
          { faction: 'british', unit: 'even' },
          { faction: 'pirates', unit: 'even' },
        ),
      )
    }
    const report = runTournament(configs)
    expect(report.matches).toBe(configs.length)
    // Parity is measured by the win-rate spread between factions. Identical
    // rosters with seat-mirrored matches -> spread within the ±5% target.
    expect(report.spread).toBeLessThanOrEqual(0.05)
  })

  it('detects imbalance: a stronger roster wins far more', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8]
    const configs: GameConfig[] = []
    for (const seed of seeds) {
      configs.push(
        duel(
          seed,
          'small',
          { faction: 'spanish', unit: 'strong' },
          { faction: 'dutch', unit: 'weak' },
        ),
      )
      configs.push(
        duel(
          seed,
          'small',
          { faction: 'dutch', unit: 'weak' },
          { faction: 'spanish', unit: 'strong' },
        ),
      )
    }
    const report = runTournament(configs)
    expect(report.winRate.spanish!).toBeGreaterThan(report.winRate.dutch!)
    expect(report.spread).toBeGreaterThan(0.1)
  })
})
