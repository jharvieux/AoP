import type { Action, GameConfig } from '@aop/engine'
import { useEffect, useMemo, useState } from 'react'
import { BattleBoardSheet } from '../BattleBoardSheet'
import { MapCanvas } from '../MapCanvas'
import { useReplayCursor } from './useReplayCursor'

const SPEEDS = [0.5, 1, 2, 4] as const

interface ReplayScreenProps {
  config: GameConfig
  actions: Action[]
  onClose: () => void
}

/**
 * Read-only playback of a full action log (#146): play/pause, step
 * forward/back, seek by round, speed control, reusing MapCanvas as the view.
 * Full visibility — every tile is always "explored" and "visible" regardless
 * of any player's real fog, since a finished game (or its multiplayer replay,
 * #147) carries no anti-cheat concern once the match is over. When the
 * action just stepped past was a battle, a "View Battle" button opens the
 * same `BattleBoardSheet` the live game uses (#304) — replay previously had
 * no battle playback of any kind, boarding or gunnery.
 */
export function ReplayScreen({ config, actions, onClose }: ReplayScreenProps) {
  const cursor = useReplayCursor(config, actions)
  const { state } = cursor
  const [viewingBattle, setViewingBattle] = useState(false)
  // A step/seek elsewhere in the log invalidates whatever battle was showing.
  useEffect(() => {
    setViewingBattle(false)
  }, [cursor.actionIndex])
  // Arbitrary perspective for MapCanvas's own-vs-enemy color coding — a
  // replay has no single "viewer", so seat 0 anchors the palette.
  const viewer = state.players[0]!

  const allKeys = useMemo(() => {
    const keys = new Set<string>()
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) keys.add(`${x},${y}`)
    }
    return keys
  }, [state.map])

  function factionOf(ownerId: string) {
    return state.players.find((p) => p.id === ownerId)?.faction ?? viewer.faction
  }

  return (
    <div className="game-screen-container replay-screen">
      <header className="hud">
        <h1>Replay</h1>
        <span className="turn-info">
          Round {cursor.round} of {cursor.maxRound} · action {cursor.actionIndex}/
          {cursor.totalActions}
        </span>
        <button className="secondary" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="map-container">
        <MapCanvas
          map={state.map}
          captains={state.captains}
          cities={state.cities}
          parties={state.parties}
          encounters={state.encounters}
          landSites={state.landSites}
          landEncounters={state.landEncounters}
          viewerId={viewer.id}
          visibleKeys={allKeys}
          exploredKeys={allKeys}
          selectedCaptainId={null}
          onTileClick={() => {}}
          factionOf={factionOf}
        />
      </div>

      <div className="bottom-action-bar replay-controls">
        <input
          type="range"
          className="round-seek"
          min={1}
          max={cursor.maxRound}
          value={cursor.round}
          onChange={(e) => cursor.seekToRound(Number(e.target.value))}
          aria-label="Seek by round"
        />
        <div className="button-group">
          <button
            className="secondary"
            onClick={cursor.stepBack}
            disabled={cursor.actionIndex === 0}
          >
            ◀ Step
          </button>
          {cursor.isPlaying ? (
            <button className="primary" onClick={cursor.pause}>
              Pause
            </button>
          ) : (
            <button className="primary" onClick={cursor.play}>
              Play
            </button>
          )}
          <button
            className="secondary"
            onClick={cursor.stepForward}
            disabled={cursor.actionIndex >= cursor.totalActions}
          >
            Step ▶
          </button>
          <select
            className="speed-select"
            value={cursor.speed}
            onChange={(e) => cursor.setSpeed(Number(e.target.value))}
            aria-label="Playback speed"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
          {cursor.battleReport && (
            <button className="secondary" onClick={() => setViewingBattle(true)}>
              View Battle
            </button>
          )}
        </div>
      </div>

      {viewingBattle && cursor.battleReport && (
        <BattleBoardSheet
          report={cursor.battleReport}
          playerName={(id) => state.players.find((p) => p.id === id)?.name ?? id}
          onClose={() => setViewingBattle(false)}
        />
      )}
    </div>
  )
}
