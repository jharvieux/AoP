import { useState } from 'react'
import { AI_TUNING, FACTIONS, GAME_SETUP, combatStatsData } from '@aop/content'
import type { FactionId, MapSize } from '@aop/shared'
import type { PlayerConfig, TroopStack } from '@aop/engine'
import { buildCatalog } from '../catalog'
import type { GameSetupConfig } from '../types'

interface NewGameSetupProps {
  onPlay: (config: GameSetupConfig) => void
  onBack: () => void
}

const MAP_SIZES: MapSize[] = ['small', 'medium', 'large']
const FACTIONS_ARRAY = Object.values(FACTIONS)

function getDefaultFaction(index: number): FactionId {
  const faction = FACTIONS_ARRAY[index % FACTIONS_ARRAY.length]
  if (!faction) throw new Error('No factions available')
  return faction.id
}

/** Starting crew for a faction's captain, drawn from its tier-1 unit in @aop/content. */
function starterTroops(faction: FactionId): TroopStack[] {
  const unit = FACTIONS[faction].units[0]
  if (!unit) throw new Error(`Faction ${faction} has no units`)
  return [{ unitId: unit.id, count: 6 }]
}

function createDefaultPlayer(index: number): PlayerConfig {
  return {
    id: index === 0 ? 'player-0' : `ai-${index}`,
    name: index === 0 ? 'You' : `Captain ${index}`,
    faction: getDefaultFaction(index),
    isAI: index !== 0,
  }
}

export function NewGameSetup({ onPlay, onBack }: NewGameSetupProps) {
  const [mapSize, setMapSize] = useState<MapSize>('small')
  const [playerCount, setPlayerCount] = useState(2)
  const [players, setPlayers] = useState<PlayerConfig[]>(
    Array.from({ length: 2 }, (_, i) => createDefaultPlayer(i)),
  )

  function handlePlayerCountChange(newCount: number) {
    setPlayerCount(newCount)
    const newPlayers = Array.from({ length: newCount }, (_, i) => {
      const existing = players[i]
      if (existing) {
        return existing
      }
      return createDefaultPlayer(i)
    })
    setPlayers(newPlayers)
  }

  function handlePlayerFactionChange(index: number, faction: FactionId) {
    const updated = [...players]
    const current = updated[index]
    if (current) {
      updated[index] = { ...current, faction }
      setPlayers(updated)
    }
  }

  function handlePlayerTypeToggle(index: number) {
    if (index === 0) return // Can't toggle player 0
    const updated = [...players]
    const current = updated[index]
    if (current) {
      updated[index] = { ...current, isAI: !current.isAI }
      setPlayers(updated)
    }
  }

  function handlePlayClick() {
    onPlay({
      seed: Math.floor(Math.random() * 2 ** 31),
      mapSize,
      players: players.map((p) => ({ ...p, startingTroops: starterTroops(p.faction) })),
      // Freeze opening-state + combat + economy/content balance snapshots from
      // @aop/content into the match so the pure engine holds no balance data.
      setup: GAME_SETUP,
      combatStats: combatStatsData(),
      content: buildCatalog(),
      aiTuning: AI_TUNING,
    })
  }

  return (
    <div className="screen setup-screen">
      <div className="setup-content">
        <div className="setup-header">
          <h2>New Game</h2>
          <button className="back-button" onClick={onBack}>
            ← Back
          </button>
        </div>

        <div className="setup-section">
          <label className="section-label">Map Size</label>
          <div className="button-group">
            {MAP_SIZES.map((size) => (
              <button
                key={size}
                className={`size-button ${mapSize === size ? 'active' : ''}`}
                onClick={() => setMapSize(size)}
              >
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <label className="section-label">Players ({playerCount})</label>
          <div className="button-group">
            {Array.from({ length: 7 }, (_, i) => i + 2).map((count) => (
              <button
                key={count}
                className={`player-count-button ${playerCount === count ? 'active' : ''}`}
                onClick={() => handlePlayerCountChange(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-section">
          <label className="section-label">Factions & Seats</label>
          <div className="player-list">
            {players.map((player, index) => (
              <div key={index} className="player-row">
                <div className="player-info">
                  <span className="player-name">
                    {index === 0 ? 'You' : player.isAI ? 'AI' : 'Human'}
                  </span>
                  {index !== 0 && (
                    <button
                      className="toggle-ai"
                      onClick={() => handlePlayerTypeToggle(index)}
                      title={player.isAI ? 'Make human' : 'Make AI'}
                    >
                      {player.isAI ? '🤖' : '👤'}
                    </button>
                  )}
                </div>
                <select
                  className="faction-select"
                  value={player.faction}
                  onChange={(e) => handlePlayerFactionChange(index, e.target.value as FactionId)}
                >
                  {FACTIONS_ARRAY.map((faction) => (
                    <option key={faction.id} value={faction.id}>
                      {faction.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <button className="primary large play-button" onClick={handlePlayClick}>
          Play Game
        </button>
      </div>
    </div>
  )
}
