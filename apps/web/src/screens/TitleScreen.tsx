import { useEffect } from 'react'
import { SkullEmblem } from '../components/SkullEmblem'
import { useBackgroundMusic } from '../audio/useBackgroundMusic'

/**
 * Launch splash (docs/design_handoff_start_screen): emblem, engraved title,
 * loading bar, then auto-advance to the main menu after 3.2s. The handoff
 * says to also wait on real asset loading if that ever takes longer; today
 * the client has nothing async to preload at launch (fonts/art stream in
 * lazily), so the timer alone decides — but a click/tap/keypress advances
 * immediately too (#342): it doubles as the user gesture that satisfies the
 * browser's autoplay policy, so the menu theme (started here, under the same
 * 'bg-music' key MainMenu uses) is actually audible instead of being
 * silently rejected on a fresh load.
 */
export function TitleScreen({ onDone }: { onDone: () => void }) {
  useBackgroundMusic('menu')

  useEffect(() => {
    const id = setTimeout(onDone, 3200)
    window.addEventListener('pointerdown', onDone)
    window.addEventListener('keydown', onDone)
    return () => {
      clearTimeout(id)
      window.removeEventListener('pointerdown', onDone)
      window.removeEventListener('keydown', onDone)
    }
  }, [onDone])

  return (
    <div className="screen parchment-screen title-screen">
      <div className="title-screen__stack">
        <SkullEmblem className="title-screen__emblem" />
        <div>
          <h1 className="title-screen__title">Age of Plunder</h1>
          <p className="title-screen__subtitle">A Pirate Strategy Game</p>
        </div>
        <div className="title-screen__loading">
          <div className="title-screen__loading-track">
            <div className="title-screen__loading-fill" />
          </div>
          <div className="title-screen__loading-caption">Charting the seas…</div>
        </div>
      </div>
    </div>
  )
}
