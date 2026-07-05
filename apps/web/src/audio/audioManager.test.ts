import { describe, expect, it } from 'vitest'
import { volumeForCategory, type AudioSettings } from './audioManager'

const settings: AudioSettings = { muted: false, volume: 0.8, musicVolume: 0.5, sfxVolume: 0.3 }

describe('volumeForCategory', () => {
  it('routes dialogue clips to the dialogue volume slider', () => {
    expect(volumeForCategory(settings, 'dialogue')).toBe(0.8)
  })

  it('routes background music to the music volume slider', () => {
    expect(volumeForCategory(settings, 'music')).toBe(0.5)
  })

  it('routes one-shot SFX to the sfx volume slider', () => {
    expect(volumeForCategory(settings, 'sfx')).toBe(0.3)
  })

  it('mute silences every category regardless of its individual slider', () => {
    const muted = { ...settings, muted: true }
    expect(volumeForCategory(muted, 'dialogue')).toBe(0)
    expect(volumeForCategory(muted, 'music')).toBe(0)
    expect(volumeForCategory(muted, 'sfx')).toBe(0)
  })
})
