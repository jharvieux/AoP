import { runAiTurn } from './ai'
import { combatantStrength, createCombatStats, type CombatStats } from './combat'
import { createGame, currentPlayer } from './game'
import type { Captain, GameConfig, GameState } from './types'

/**
 * Headless balance-simulation harness (#24).
 *
 * Because the engine is pure and deterministic, we can play thousands of
 * AI-vs-AI matches with no I/O and get identical results everywhere. This module
 * runs a match to completion ({@link simulateMatch}) and aggregates faction
 * win-rates across a batch of configs ({@link runTournament}) so content numbers
 * can be tuned toward an even (±5%) faction win-rate.
 *
 * It stays content-free: callers build the {@link GameConfig}s (with combat stats
 * and starting rosters drawn from @aop/content) and pass them in. See
 * `scripts/balance-sim.ts` for the content-wired operator entry point.
 */

export interface MatchStanding {
  playerId: string
  faction: string
  eliminated: boolean
  /** Total surviving fleet strength — the tie-breaker for capped (unfinished) matches. */
  strength: number
}

export interface MatchResult {
  winnerId: string | null
  winnerFaction: string | null
  /** True if the match ended by elimination; false if it hit the round cap. */
  finished: boolean
  rounds: number
  standings: MatchStanding[]
}

export interface SimOptions {
  /** Hard cap so a stalemate (AIs unable to reach each other) still terminates. */
  maxRounds?: number
}

const DEFAULT_MAX_ROUNDS = 150

export function simulateMatch(config: GameConfig, opts: SimOptions = {}): MatchResult {
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS
  const stats = config.combatStats ? createCombatStats(config.combatStats) : null

  let state = createGame(config)
  let safety = 0
  const safetyCap = maxRounds * config.players.length + 10
  while (state.status === 'active' && state.round <= maxRounds && safety++ < safetyCap) {
    state = runAiTurn(state, currentPlayer(state).id)
  }

  const standings = buildStandings(state, stats)
  const winnerId = state.status === 'finished' ? state.winnerId : decideByStandings(standings)
  const winnerFaction = standings.find((s) => s.playerId === winnerId)?.faction ?? null

  return {
    winnerId,
    winnerFaction,
    finished: state.status === 'finished',
    rounds: state.round,
    standings,
  }
}

export interface WinRateReport {
  matches: number
  wins: Record<string, number>
  plays: Record<string, number>
  winRate: Record<string, number>
  /** Largest gap between any two factions' win-rates — 0 is perfectly balanced. */
  spread: number
}

/**
 * Simulate a batch of match configs and aggregate per-faction win-rates. Each
 * config lists the factions playing; a faction's win-rate is wins / matches it
 * appeared in. Deterministic given the configs.
 */
export function runTournament(configs: GameConfig[], opts: SimOptions = {}): WinRateReport {
  const wins: Record<string, number> = {}
  const plays: Record<string, number> = {}

  for (const config of configs) {
    for (const p of config.players) {
      plays[p.faction] = (plays[p.faction] ?? 0) + 1
      wins[p.faction] ??= 0
    }
    const result = simulateMatch(config, opts)
    if (result.winnerFaction) wins[result.winnerFaction] = (wins[result.winnerFaction] ?? 0) + 1
  }

  const winRate: Record<string, number> = {}
  for (const faction of Object.keys(plays)) {
    winRate[faction] = plays[faction]! > 0 ? wins[faction]! / plays[faction]! : 0
  }

  const rates = Object.values(winRate)
  const spread = rates.length > 0 ? Math.max(...rates) - Math.min(...rates) : 0

  return { matches: configs.length, wins, plays, winRate, spread }
}

function buildStandings(state: GameState, stats: CombatStats | null): MatchStanding[] {
  return state.players.map((p) => ({
    playerId: p.id,
    faction: p.faction,
    eliminated: p.eliminated,
    strength: fleetStrength(
      state.captains.filter((c) => c.ownerId === p.id),
      stats,
    ),
  }))
}

function fleetStrength(captains: Captain[], stats: CombatStats | null): number {
  if (!stats) return captains.length
  return captains.reduce(
    (sum, c) =>
      sum +
      combatantStrength(
        { captainId: c.id, ownerId: c.ownerId, shipClassId: c.shipClassId, troops: c.troops },
        stats,
      ),
    0,
  )
}

/** Pick the strongest surviving player; ties go to the lowest seat (deterministic). */
function decideByStandings(standings: MatchStanding[]): string | null {
  const alive = standings.filter((s) => !s.eliminated)
  if (alive.length === 0) return null
  let best = alive[0]!
  for (const s of alive) {
    if (s.strength > best.strength) best = s
  }
  return best.playerId
}
