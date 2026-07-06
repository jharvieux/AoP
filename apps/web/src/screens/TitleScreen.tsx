import { useEffect } from 'react'
import { SkullEmblem } from '../components/SkullEmblem'

/**
 * Launch splash (docs/design_handoff_start_screen): emblem, engraved title,
 * loading bar, then auto-advance to the main menu after 3.2s — no input
 * required. The handoff says to also wait on real asset loading if that ever
 * takes longer; today the client has nothing async to preload at launch
 * (fonts/art stream in lazily), so the timer alone decides.
 */
export function TitleScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 3200)
    return () => clearTimeout(id)
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
