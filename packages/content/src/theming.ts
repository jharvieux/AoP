/**
 * Data-driven caps for theme-pack asset uploads (#64). Theme packs are a
 * pure client-side cosmetic overlay — the engine never sees them, and they
 * carry no gameplay balance — but the *limits* still live here as data
 * rather than hardcoded in the UI, matching this repo's pattern of keeping
 * tunable numbers out of application logic (they protect the browser:
 * IndexedDB storage, decode cost, memory — not game balance).
 */
export interface ThemeAssetLimits {
  /** Max stored bytes for a single sprite image, after downscaling. */
  maxImageBytes: number
  /** Max accepted bytes for an audio clip (audio isn't re-encoded client-side). */
  maxAudioBytes: number
  /** Longest audio clip accepted, in seconds. */
  maxAudioDurationSec: number
  /** Images wider or taller than this are downscaled to fit before storage. */
  maxImageDimension: number
  allowedImageTypes: readonly string[]
  allowedAudioTypes: readonly string[]
}

export const THEME_ASSET_LIMITS: ThemeAssetLimits = {
  maxImageBytes: 500_000,
  maxAudioBytes: 2_000_000,
  maxAudioDurationSec: 20,
  maxImageDimension: 256,
  allowedImageTypes: ['image/png', 'image/jpeg', 'image/webp'],
  allowedAudioTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
}

/**
 * Named audio slots a theme pack may override. The game has no audio system
 * yet (Phase 4 polish), so nothing plays these back today — this just gives
 * the theme-pack editor concrete, stable ids to upload against so packs
 * authored now keep working once playback lands.
 */
export const THEME_AUDIO_SLOTS: readonly string[] = ['music-theme', 'sfx-combat', 'sfx-victory']
