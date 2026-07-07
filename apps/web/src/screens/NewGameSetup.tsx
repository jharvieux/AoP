import { useState } from 'react'
import {
  AI_DIFFICULTIES,
  AI_PERSONALITIES,
  AI_TUNING,
  GAME_SETUP,
  combatStatsData,
} from '@aop/content'
import type { FactionId, MapSize } from '@aop/shared'
import type { AiDifficulty, AiPersonality, AiProfile, GameSetup, PlayerConfig } from '@aop/engine'
import { buildCatalog } from '../catalog'
import { createDefaultPlayer, FACTIONS_ARRAY, starterTroops } from '../players'
import { useTheme } from '../theme/ThemeContext'
import type { GameSetupConfig } from '../types'

interface NewGameSetupProps {
  onPlay: (config: GameSetupConfig) => void
  onBack: () => void
}

const MAP_SIZES: MapSize[] = ['small', 'medium', 'large']
const PERSONALITIES: AiPersonality[] = ['aggressive', 'economic', 'opportunist']
const DIFFICULTIES: AiDifficulty[] = ['easy', 'normal', 'hard']

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Diplomacy knob bounds (#177). Reputation starts at 100 and floors at 0, so a
// betrayal cost of 0..100 spans "treachery is free" to "one betrayal is
// ruinous". A 0..10-round truce covers "no protection" (immediate free strikes,
// the pre-#177 behavior) up to a long, telegraphed cooldown.
const BETRAYAL_PENALTY_MIN = 0
const BETRAYAL_PENALTY_MAX = 100
const TRUCE_ROUNDS_MIN = 0
const TRUCE_ROUNDS_MAX = 10

// Captivity knob bounds (#309). 0 rounds means a captured captain is
// immediately eligible for recruitment (no captivity at all); 20 is a long
// wait that keeps a captor's prize off the board for most of a match.
const CAPTIVITY_ROUNDS_MIN = 0
const CAPTIVITY_ROUNDS_MAX = 20

export function NewGameSetup({ onPlay, onBack }: NewGameSetupProps) {
  const { factionName } = useTheme()
  const [mapSize, setMapSize] = useState<MapSize>('small')
  const [playerCount, setPlayerCount] = useState(2)
  const [betrayalPenalty, setBetrayalPenalty] = useState(GAME_SETUP.betrayalReputationPenalty)
  const [truceRounds, setTruceRounds] = useState(GAME_SETUP.betrayalTruceRounds)
  const [captivityRounds, setCaptivityRounds] = useState(GAME_SETUP.captainCaptivityRounds)
  const [battleResolution, setBattleResolution] = useState<
    NonNullable<GameSetup['battleResolution']>
  >(GAME_SETUP.battleResolution ?? 'auto')
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

  function handleProfileChange(index: number, patch: Partial<AiProfile>) {
    const updated = [...players]
    const current = updated[index]
    if (current?.aiProfile) {
      updated[index] = { ...current, aiProfile: { ...current.aiProfile, ...patch } }
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
      // The host's diplomacy knobs (#177) and captivity window (#309)
      // override the content defaults.
      setup: {
        ...GAME_SETUP,
        betrayalReputationPenalty: betrayalPenalty,
        betrayalTruceRounds: truceRounds,
        captainCaptivityRounds: captivityRounds,
        battleResolution,
      },
      combatStats: combatStatsData(),
      content: buildCatalog(),
      aiTuning: AI_TUNING,
      aiPersonalities: AI_PERSONALITIES,
      aiDifficulties: AI_DIFFICULTIES,
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
          <label className="section-label">Betrayal reputation cost ({betrayalPenalty})</label>
          <input
            type="range"
            min={BETRAYAL_PENALTY_MIN}
            max={BETRAYAL_PENALTY_MAX}
            step={5}
            value={betrayalPenalty}
            onChange={(e) => setBetrayalPenalty(Number(e.target.value))}
            aria-label="Betrayal reputation cost"
          />
        </div>

        <div className="setup-section">
          <label className="section-label">
            Betrayal truce window ({truceRounds} {truceRounds === 1 ? 'round' : 'rounds'})
          </label>
          <input
            type="range"
            min={TRUCE_ROUNDS_MIN}
            max={TRUCE_ROUNDS_MAX}
            step={1}
            value={truceRounds}
            onChange={(e) => setTruceRounds(Number(e.target.value))}
            aria-label="Betrayal truce window in rounds"
          />
        </div>

        <div className="setup-section">
          <label className="section-label">
            Captain captivity ({captivityRounds} {captivityRounds === 1 ? 'round' : 'rounds'})
          </label>
          <input
            type="range"
            min={CAPTIVITY_ROUNDS_MIN}
            max={CAPTIVITY_ROUNDS_MAX}
            step={1}
            value={captivityRounds}
            onChange={(e) => setCaptivityRounds(Number(e.target.value))}
            aria-label="Captain captivity window in rounds"
          />
        </div>

        <div className="setup-section">
          <label className="section-label">Battle resolution</label>
          <div className="button-group">
            <button
              className={`size-button ${battleResolution === 'auto' ? 'active' : ''}`}
              onClick={() => setBattleResolution('auto')}
            >
              Auto
            </button>
            <button
              className={`size-button ${battleResolution === 'tactical' ? 'active' : ''}`}
              onClick={() => setBattleResolution('tactical')}
            >
              Tactical
            </button>
          </div>
          <p className="building-option__hint">
            {battleResolution === 'tactical'
              ? 'Fight your own battles round by round — auto-resolve stays one tap away.'
              : 'Every battle resolves instantly. Switch to Tactical to fight them out by hand.'}
          </p>
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
                  {/* #235: seats 1+ are always AI — GameScreen anchors the
                      viewer/fog to the first human seat, so a second human
                      seat has no working turn (no hotseat support yet). */}
                  <span className="player-name">{index === 0 ? 'You' : 'AI'}</span>
                </div>
                <select
                  className="faction-select"
                  value={player.faction}
                  onChange={(e) => handlePlayerFactionChange(index, e.target.value as FactionId)}
                >
                  {FACTIONS_ARRAY.map((faction) => (
                    <option key={faction.id} value={faction.id}>
                      {factionName(faction.id, faction.name)}
                    </option>
                  ))}
                </select>
                {player.isAI && player.aiProfile && (
                  <div className="ai-profile">
                    <select
                      className="personality-select"
                      value={player.aiProfile.personality}
                      onChange={(e) =>
                        handleProfileChange(index, {
                          personality: e.target.value as AiPersonality,
                        })
                      }
                      title="AI personality"
                    >
                      {PERSONALITIES.map((p) => (
                        <option key={p} value={p}>
                          {titleCase(p)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="difficulty-select"
                      value={player.aiProfile.difficulty}
                      onChange={(e) =>
                        handleProfileChange(index, {
                          difficulty: e.target.value as AiDifficulty,
                        })
                      }
                      title="AI difficulty"
                    >
                      {DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>
                          {titleCase(d)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
