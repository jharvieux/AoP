import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { audioManager, volumeForCategory, type AudioSettings } from './audioManager'

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

// #342: on a fresh load the first `play()` has no user gesture yet and gets
// rejected by the browser's autoplay policy. These tests stand in a minimal
// `Audio`/`window` (this project has no jsdom dependency — see the other
// tests in this file, all pure-logic) to verify the retry-on-interaction
// safety net without pulling one in just for this.
let playBehavior: () => Promise<void> = () => Promise.resolve()

class FakeAudio extends EventTarget {
  volume = 0
  loop = false
  constructor(public src: string) {
    super()
  }
  play(): Promise<void> {
    return playBehavior()
  }
  pause(): void {}
}

describe('AudioManager retry-on-interaction', () => {
  let fakeWindow: EventTarget

  beforeEach(() => {
    fakeWindow = new EventTarget()
    ;(globalThis as unknown as { window: EventTarget }).window = fakeWindow
    ;(globalThis as unknown as { Audio: typeof FakeAudio }).Audio = FakeAudio
    playBehavior = () => Promise.resolve()
  })

  afterEach(() => {
    delete (globalThis as { window?: EventTarget }).window
    delete (globalThis as { Audio?: typeof FakeAudio }).Audio
  })

  it('retries a rejected looping clip on the first pointerdown', async () => {
    playBehavior = () => Promise.reject(new Error('autoplay blocked'))
    audioManager.play('menu_theme.ogg', { key: 'bg-music', loop: true, category: 'music' })
    await Promise.resolve()
    await Promise.resolve()

    let retried = false
    playBehavior = () => {
      retried = true
      return Promise.resolve()
    }
    fakeWindow.dispatchEvent(new Event('pointerdown'))
    expect(retried).toBe(true)
  })

  it('does not replay a rejected clip once its key has been superseded', async () => {
    playBehavior = () => Promise.reject(new Error('autoplay blocked'))
    audioManager.play('menu_theme.ogg', { key: 'bg-music', loop: true, category: 'music' })
    await Promise.resolve()
    await Promise.resolve()

    // A newer play() call for the same key (e.g. title -> menu navigation)
    // supersedes the rejected instance before any interaction happens.
    playBehavior = () => Promise.resolve()
    audioManager.play('exploration_ambient.ogg', { key: 'bg-music', loop: true, category: 'music' })

    let retried = false
    playBehavior = () => {
      retried = true
      return Promise.resolve()
    }
    fakeWindow.dispatchEvent(new Event('pointerdown'))
    expect(retried).toBe(false)
  })
})
