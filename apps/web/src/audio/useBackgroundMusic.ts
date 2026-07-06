import { useEffect } from 'react'
import { audioManager } from './audioManager'
import { MUSIC, pickMusicSource, type MusicContext } from './musicClips'

const MUSIC_KEY = 'bg-music'

/**
 * Plays the looping background track for `context`, replacing whatever track
 * was playing under the same key (see AudioManager.play's keyed-replace
 * behavior). Stops on unmount so navigating away from the screen silences it.
 */
export function useBackgroundMusic(context: MusicContext): void {
  useEffect(() => {
    const url = pickMusicSource(MUSIC[context], (mimeType) => new Audio().canPlayType(mimeType))
    audioManager.play(url, { key: MUSIC_KEY, loop: true, category: 'music' })
    return () => audioManager.stop(MUSIC_KEY)
  }, [context])
}
