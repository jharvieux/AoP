import { tileIndex, type Captain, type GameMap } from '@aop/engine'
import { Application, Graphics } from 'pixi.js'
import { useEffect, useRef } from 'react'

/**
 * Renders the seeded world map (#6) and captains (#8): deep sea, shallows,
 * islands, and ports, with a coloured dot per captain. Purely a view over engine
 * state — it holds no game logic.
 */

const TILE = 20

const TILE_COLOR = {
  deep: '#1b4a6b',
  shallows: '#2a6a8f',
  land: '#4a7c3f',
  port: '#c9a227',
} as const

const CAPTAIN_COLORS = [
  '#e23b3b',
  '#3b6be2',
  '#e2c23b',
  '#8f3be2',
  '#3be2a1',
  '#e28f3b',
  '#ffffff',
  '#000000',
]

export function MapCanvas({ map, captains }: { map: GameMap; captains: Captain[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let destroyed = false
    const app = new Application()

    app
      .init({
        resizeTo: container,
        background: TILE_COLOR.deep,
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

        const tiles = new Graphics()
        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            const tile = map.tiles[tileIndex(map, x, y)]!
            if (tile.type === 'deep') continue
            tiles.rect(x * TILE, y * TILE, TILE, TILE)
            tiles.fill(TILE_COLOR[tile.type])
          }
        }
        app.stage.addChild(tiles)

        const ships = new Graphics()
        captains.forEach((cap, i) => {
          const cx = cap.position.x * TILE + TILE / 2
          const cy = cap.position.y * TILE + TILE / 2
          ships.circle(cx, cy, TILE / 2.5)
          ships.fill(CAPTAIN_COLORS[i % CAPTAIN_COLORS.length])
        })
        app.stage.addChild(ships)
      })

    return () => {
      destroyed = true
      if (app.renderer) app.destroy(true)
    }
  }, [map, captains])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
