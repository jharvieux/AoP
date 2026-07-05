import { useEffect, useState } from 'react'
import { audioManager, type AudioSettings } from './audioManager'

export interface UseAudioSettings extends AudioSettings {
  setMuted: (muted: boolean) => void
  setVolume: (volume: number) => void
  setMusicVolume: (volume: number) => void
  setSfxVolume: (volume: number) => void
}

/** Reactive view of the audio manager's persisted mute/volume settings (#28). */
export function useAudioSettings(): UseAudioSettings {
  const [settings, setSettings] = useState<AudioSettings>(audioManager.getSettings())

  useEffect(() => audioManager.subscribe(setSettings), [])

  return {
    ...settings,
    setMuted: (muted: boolean) => audioManager.setMuted(muted),
    setVolume: (volume: number) => audioManager.setVolume(volume),
    setMusicVolume: (volume: number) => audioManager.setMusicVolume(volume),
    setSfxVolume: (volume: number) => audioManager.setSfxVolume(volume),
  }
}
