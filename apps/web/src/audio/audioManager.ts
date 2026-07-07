/** Which volume slider a clip is governed by. Defaults to `'dialogue'` for
 * backward compatibility with call sites that predate music/sfx (#75/#28). */
export type AudioCategory = 'dialogue' | 'music' | 'sfx'

export interface AudioSettings {
  muted: boolean
  /** Volume in [0,1] for NPC/narrator dialogue clips (the original category). */
  volume: number
  /** Volume in [0,1] for looping background music. */
  musicVolume: number
  /** Volume in [0,1] for one-shot gameplay SFX (clicks, hits, pickups). */
  sfxVolume: number
}

const STORAGE_KEY = 'aop:audio-settings'
const DEFAULT_SETTINGS: AudioSettings = {
  muted: false,
  volume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.8,
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function loadSettings(): AudioSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AudioSettings>
    return {
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_SETTINGS.muted,
      volume: typeof parsed.volume === 'number' ? clamp01(parsed.volume) : DEFAULT_SETTINGS.volume,
      musicVolume:
        typeof parsed.musicVolume === 'number'
          ? clamp01(parsed.musicVolume)
          : DEFAULT_SETTINGS.musicVolume,
      sfxVolume:
        typeof parsed.sfxVolume === 'number'
          ? clamp01(parsed.sfxVolume)
          : DEFAULT_SETTINGS.sfxVolume,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** Pure: which volume slider governs `category` under the current settings
 * (muted always wins). Exported so the selection logic is unit-testable
 * without touching the `Audio` element. */
export function volumeForCategory(settings: AudioSettings, category: AudioCategory): number {
  if (settings.muted) return 0
  switch (category) {
    case 'music':
      return settings.musicVolume
    case 'sfx':
      return settings.sfxVolume
    case 'dialogue':
      return settings.volume
  }
}

type Listener = (settings: AudioSettings) => void

/**
 * Central playback + settings manager for game audio (#28): NPC dialogue barks
 * (#75) today, and sea ambience / combat SFX / UI ticks once those assets are
 * sourced (a human task — this manager is the mechanical plumbing for them).
 *
 * Deliberately built on the native `Audio` element rather than a library
 * (howler etc.) so it adds zero runtime dependencies — everything this game
 * needs (short clips, no spatial/3D audio) is covered by the browser API, and
 * CLAUDE.md reserves new runtime dependencies for explicit operator approval.
 *
 * Mute + master volume persist to `localStorage` so they survive a reload.
 * Playback is keyed: a second `play()` with the same key stops any
 * still-playing instance first, so re-renders or rapid clicks never layer
 * overlapping copies of the same clip. Playback failures (autoplay rejection,
 * missing asset) are swallowed — audio is optional presentation, never a
 * blocking dependency for gameplay.
 */
interface ActiveClip {
  audio: HTMLAudioElement
  category: AudioCategory
}

class AudioManager {
  private settings: AudioSettings = loadSettings()
  private listeners = new Set<Listener>()
  private active = new Map<string, ActiveClip>()

  getSettings(): AudioSettings {
    return this.settings
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setMuted(muted: boolean): void {
    this.update({ muted })
  }

  setVolume(volume: number): void {
    this.update({ volume: clamp01(volume) })
  }

  setMusicVolume(volume: number): void {
    this.update({ musicVolume: clamp01(volume) })
  }

  setSfxVolume(volume: number): void {
    this.update({ sfxVolume: clamp01(volume) })
  }

  private volumeFor(category: AudioCategory): number {
    return volumeForCategory(this.settings, category)
  }

  /**
   * Play a clip once, fire-and-forget. `key` defaults to the clip's `url`; a
   * second call with the same key stops any still-playing instance first.
   * `category` picks which volume slider governs it (defaults to `'dialogue'`
   * for pre-existing call sites). Returns the `Audio` element so callers can
   * observe its `ended` event.
   */
  play(
    url: string,
    opts: { key?: string; loop?: boolean; category?: AudioCategory } = {},
  ): HTMLAudioElement {
    const key = opts.key ?? url
    this.active.get(key)?.audio.pause()

    const category = opts.category ?? 'dialogue'
    const audio = new Audio(url)
    audio.loop = opts.loop ?? false
    audio.volume = this.volumeFor(category)
    this.active.set(key, { audio, category })
    audio.addEventListener('ended', () => {
      if (this.active.get(key)?.audio === audio) this.active.delete(key)
    })
    void audio.play().catch(() => {
      // Autoplay rejection (no user gesture yet) or missing asset. Looping
      // background music is worth retrying on the first interaction anywhere
      // on the page (#342) — a fresh page load has had no gesture yet, so the
      // very first `play()` reliably gets rejected; a one-shot dialogue/SFX
      // clip replayed out of context later would be worse than dropping it,
      // so this only applies to loops.
      if (opts.loop) this.retryOnNextInteraction(url, opts, audio)
    })
    return audio
  }

  /**
   * Registers a one-time listener that retries a rejected `play()` call on
   * the first `pointerdown`/`keydown` anywhere on the page. Only retries if
   * `key` still points at the same (rejected) `Audio` instance — if a newer
   * `play()` call already replaced it (e.g. the music context changed before
   * the user interacted), this is a no-op.
   */
  private retryOnNextInteraction(
    url: string,
    opts: { key?: string; loop?: boolean; category?: AudioCategory },
    rejectedAudio: HTMLAudioElement,
  ): void {
    const key = opts.key ?? url
    const retry = () => {
      window.removeEventListener('pointerdown', retry)
      window.removeEventListener('keydown', retry)
      if (this.active.get(key)?.audio === rejectedAudio) this.play(url, opts)
    }
    window.addEventListener('pointerdown', retry, { once: true })
    window.addEventListener('keydown', retry, { once: true })
  }

  /** Stop a specific keyed clip early (e.g. an encounter's greeting closing). */
  stop(key: string): void {
    this.active.get(key)?.audio.pause()
    this.active.delete(key)
  }

  private update(partial: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...partial }
    // Re-apply volume to anything already playing so a slider drag is heard live.
    for (const clip of this.active.values()) {
      clip.audio.volume = this.volumeFor(clip.category)
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings))
    }
    for (const listener of this.listeners) listener(this.settings)
  }
}

/** Single shared instance — audio settings and in-flight clips are process-global. */
export const audioManager = new AudioManager()
