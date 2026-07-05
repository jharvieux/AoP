import { useEffect } from 'react'
import { audioManager } from './audioManager'
import { MUSIC_TRACK_URL, type MusicContext } from './musicClips'

const MUSIC_KEY = 'bg-music'

/**
 * Plays the looping background track for `context`, replacing whatever track
 * was playing under the same key (see AudioManager.play's keyed-replace
 * behavior). Stops on unmount so navigating away from the screen silences it.
 */
export function useBackgroundMusic(context: MusicContext): void {
  useEffect(() => {
    audioManager.play(MUSIC_TRACK_URL[context], { key: MUSIC_KEY, loop: true, category: 'music' })
    return () => audioManager.stop(MUSIC_KEY)
  }, [context])
}
