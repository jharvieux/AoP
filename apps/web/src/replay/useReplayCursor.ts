import type { Action, GameConfig, GameState } from '@aop/engine'
import { useEffect, useMemo, useState } from 'react'
import { actionIndexForRound, buildReplayCheckpoints, stateAtActionIndex } from './replayCursor'

/** Base tick at 1x speed; `speed` divides this, so 2x plays twice as fast. */
const BASE_TICK_MS = 350

export interface ReplayControls {
  state: GameState
  actionIndex: number
  totalActions: number
  round: number
  maxRound: number
  isPlaying: boolean
  speed: number
  play(): void
  pause(): void
  stepForward(): void
  stepBack(): void
  seekToRound(round: number): void
  setSpeed(speed: number): void
}

/**
 * Thin React wiring around the pure replay-cursor functions (play/pause timer,
 * step, seek-by-round, speed). All scrubbing math lives in replayCursor.ts so
 * it stays unit-testable without rendering.
 */
export function useReplayCursor(config: GameConfig, actions: Action[]): ReplayControls {
  const checkpoints = useMemo(() => buildReplayCheckpoints(config, actions), [config, actions])
  const totalActions = actions.length
  const maxRound = checkpoints[checkpoints.length - 1]!.round

  const [actionIndex, setActionIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  // A newly loaded replay (different config/action log) resets the cursor.
  useEffect(() => {
    setActionIndex(0)
    setIsPlaying(false)
  }, [checkpoints])

  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      setActionIndex((i) => Math.min(i + 1, totalActions))
    }, BASE_TICK_MS / speed)
    return () => clearInterval(id)
  }, [isPlaying, speed, totalActions])

  // Auto-pause once playback reaches the end of the log.
  useEffect(() => {
    if (actionIndex >= totalActions) setIsPlaying(false)
  }, [actionIndex, totalActions])

  const state = useMemo(
    () => stateAtActionIndex(checkpoints, actions, actionIndex),
    [checkpoints, actions, actionIndex],
  )

  return {
    state,
    actionIndex,
    totalActions,
    round: state.round,
    maxRound,
    isPlaying,
    speed,
    play() {
      if (actionIndex >= totalActions) setActionIndex(0)
      setIsPlaying(true)
    },
    pause() {
      setIsPlaying(false)
    },
    stepForward() {
      setIsPlaying(false)
      setActionIndex((i) => Math.min(i + 1, totalActions))
    },
    stepBack() {
      setIsPlaying(false)
      setActionIndex((i) => Math.max(i - 1, 0))
    },
    seekToRound(round) {
      setIsPlaying(false)
      setActionIndex(actionIndexForRound(checkpoints, round))
    },
    setSpeed(next) {
      setSpeed(next)
    },
  }
}
