export interface AudioSettings {
  muted: boolean
  /** Master volume in [0,1] applied to every clip this manager plays. */
  volume: number
}

const STORAGE_KEY = 'aop:audio-settings'
const DEFAULT_SETTINGS: AudioSettings = { muted: false, volume: 0.8 }

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
    }
  } catch {
    return DEFAULT_SETTINGS
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
class AudioManager {
  private settings: AudioSettings = loadSettings()
  private listeners = new Set<Listener>()
  private active = new Map<string, HTMLAudioElement>()

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

  /**
   * Play a clip once, fire-and-forget. `key` defaults to the clip's `url`; a
   * second call with the same key stops any still-playing instance first.
   * Returns the `Audio` element so callers can observe its `ended` event.
   */
  play(url: string, opts: { key?: string; loop?: boolean } = {}): HTMLAudioElement {
    const key = opts.key ?? url
    this.active.get(key)?.pause()

    const audio = new Audio(url)
    audio.loop = opts.loop ?? false
    audio.volume = this.settings.muted ? 0 : this.settings.volume
    this.active.set(key, audio)
    audio.addEventListener('ended', () => {
      if (this.active.get(key) === audio) this.active.delete(key)
    })
    void audio.play().catch(() => {
      // Autoplay rejection or missing asset: silently no-op.
    })
    return audio
  }

  /** Stop a specific keyed clip early (e.g. an encounter's greeting closing). */
  stop(key: string): void {
    this.active.get(key)?.pause()
    this.active.delete(key)
  }

  private update(partial: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...partial }
    // Re-apply volume to anything already playing so a slider drag is heard live.
    for (const audio of this.active.values()) {
      audio.volume = this.settings.muted ? 0 : this.settings.volume
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings))
    }
    for (const listener of this.listeners) listener(this.settings)
  }
}

/** Single shared instance — audio settings and in-flight clips are process-global. */
export const audioManager = new AudioManager()
