/**
 * Faction/unit balance simulation (#24) — operator entry point.
 *
 * Wires the real @aop/content rosters into the engine's headless simulation
 * harness (@aop/engine `runTournament`) and prints a per-faction win-rate matrix.
 * Because the engine is pure and deterministic, results are identical on every
 * machine and reproducible from the seed list below.
 *
 * Run with a TypeScript-aware runner from the repo root, e.g.:
 *
 *     npx tsx scripts/balance-sim.ts
 *
 * Balance target: every faction's win-rate within ±5% of parity (spread ≤ 0.10).
 *
 * Scope note: until the economy/recruitment systems (issues #9–#11) land, a match
 * only exercises each captain's *starting* troops, so this measures tier-1 unit
 * parity, not full-economy faction balance. Re-run and re-tune once recruitment
 * exists; the harness itself is complete.
 */

import { combatStatsData, FACTIONS, GAME_SETUP } from '@aop/content'
import { FACTION_IDS, type FactionId, type MapSize } from '@aop/shared'
import { runTournament, type GameConfig } from '@aop/engine'

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1)
const MAP_SIZES: MapSize[] = ['small', 'medium']
const TROOPS_PER_CAPTAIN = 6

function startingTroops(faction: FactionId) {
  return [{ unitId: FACTIONS[faction].units[0]!.id, count: TROOPS_PER_CAPTAIN }]
}

function duel(seed: number, size: MapSize, a: FactionId, b: FactionId): GameConfig {
  return {
    seed,
    mapSize: size,
    setup: GAME_SETUP,
    combatStats: combatStatsData(),
    players: [
      { id: 'p1', name: a, faction: a, isAI: true, startingTroops: startingTroops(a) },
      { id: 'p2', name: b, faction: b, isAI: true, startingTroops: startingTroops(b) },
    ],
  }
}

const configs: GameConfig[] = []
for (const seed of SEEDS) {
  for (const size of MAP_SIZES) {
    for (let i = 0; i < FACTION_IDS.length; i++) {
      for (let j = i + 1; j < FACTION_IDS.length; j++) {
        // Both seatings so first-mover/seat advantage cancels out.
        configs.push(duel(seed, size, FACTION_IDS[i]!, FACTION_IDS[j]!))
        configs.push(duel(seed, size, FACTION_IDS[j]!, FACTION_IDS[i]!))
      }
    }
  }
}

const report = runTournament(configs)

console.log(`Matches simulated: ${report.matches}`)
console.log('Faction win-rates:')
for (const faction of FACTION_IDS) {
  const rate = ((report.winRate[faction] ?? 0) * 100).toFixed(1)
  console.log(
    `  ${faction.padEnd(8)} ${rate}%  (${report.wins[faction] ?? 0}/${report.plays[faction] ?? 0})`,
  )
}
console.log(`Win-rate spread: ${(report.spread * 100).toFixed(1)}%  (target ≤ 10%)`)
if (report.spread > 0.1) {
  console.log('OUT OF BALANCE: tune the weakest/strongest faction rosters in @aop/content.')
}
