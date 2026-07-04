import { useEffect, useState } from 'react'
import type { EncounterKind } from '@aop/engine'
import { audioManager } from './audioManager'
import { ENCOUNTER_GREETING } from './dialogueClips'

const GREETING_KEY = 'encounter-greeting'

/**
 * Plays an encounter's greeting clip once when it opens (#75/#28), keyed by
 * encounter id so re-renders (e.g. odds recalculating) don't restart it.
 * Playback is fire-and-forget via the shared audio manager and never blocks
 * the encounter UI. Returns whether the greeting is currently playing, for an
 * optional "Playing…" indicator.
 */
export function useEncounterAudio(
  encounterId: string | null,
  kind: EncounterKind | undefined,
): boolean {
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    setIsPlaying(false)
    if (!encounterId || !kind) {
      audioManager.stop(GREETING_KEY)
      return
    }

    const audio = audioManager.play(ENCOUNTER_GREETING[kind], { key: GREETING_KEY })
    setIsPlaying(true)
    const handleEnded = () => setIsPlaying(false)
    audio.addEventListener('ended', handleEnded)

    return () => audio.removeEventListener('ended', handleEnded)
    // Re-trigger only when a *different* encounter opens, not on every render.
  }, [encounterId, kind])

  return isPlaying
}
