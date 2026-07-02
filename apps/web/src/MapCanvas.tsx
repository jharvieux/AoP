import { nextFloat, seedRng } from '@aop/engine'
import { Application, Graphics } from 'pixi.js'
import { useEffect, useRef } from 'react'

/**
 * Placeholder world map: a seeded scatter of island tiles on open sea, drawn
 * with Pixi. Proves the WebGL canvas + engine RNG wiring; real map generation
 * lands in Phase 1.
 */

const TILE = 48
const COLS = 24
const ROWS = 24

export function MapCanvas({ seed }: { seed: number }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let destroyed = false
    const app = new Application()

    app
      .init({
        resizeTo: container,
        background: '#1b4a6b',
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
      })
      .then(() => {
        if (destroyed) {
          app.destroy(true)
          return
        }
        container.appendChild(app.canvas)

        const g = new Graphics()
        let rng = seedRng(seed)
        for (let y = 0; y < ROWS; y++) {
          for (let x = 0; x < COLS; x++) {
            const [next, roll] = nextFloat(rng)
            rng = next
            if (roll > 0.85) {
              // island
              g.rect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8)
              g.fill(roll > 0.95 ? '#c9a227' : '#4a7c3f')
            } else if (roll > 0.8) {
              // shallows
              g.rect(x * TILE, y * TILE, TILE, TILE)
              g.fill('#2a6a8f')
            }
          }
        }
        app.stage.addChild(g)
      })

    return () => {
      destroyed = true
      if (app.renderer) app.destroy(true)
    }
  }, [seed])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
