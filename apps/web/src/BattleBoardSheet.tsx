import { FACTIONS } from '@aop/content'
import type { BattleReport, BoardBattleLog, BoardEvent, HexCoord } from '@aop/engine'
import { useEffect, useMemo, useState } from 'react'
import { useTheme } from './theme/ThemeContext'

/**
 * Post-battle report sheet (#39). Naval battles show the round-by-round
 * gunnery exchange; when the fight went to the hex battle board (a boarding
 * melee), the board itself is rendered as an SVG hex grid and the melee log
 * plays back blow by blow. The board is small (11×8 hexes, ≤14 stacks), so
 * plain SVG stays comfortably past 60fps on phones — the world map keeps the
 * Pixi canvas; UI chrome like this stays in the DOM per the architecture.
 */

interface BattleBoardSheetProps {
  report: BattleReport
  playerName: (id: string) => string
  onClose: () => void
}

const HEX_SIZE = 22
const SQRT3 = Math.sqrt(3)

const TERRAIN_FILL: Record<string, string> = {
  open: '#1d3345',
  rough: '#4a3c22',
  cover: '#1f4a2a',
  blocked: '#3a3f45',
}

function hexCenter(hex: HexCoord): { x: number; y: number } {
  return {
    x: HEX_SIZE * SQRT3 * (hex.col + 0.5 * (hex.row % 2)) + HEX_SIZE,
    y: HEX_SIZE * 1.5 * hex.row + HEX_SIZE,
  }
}

function hexPoints(cx: number, cy: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    pts.push(
      `${(cx + HEX_SIZE * 0.94 * Math.cos(angle)).toFixed(1)},${(cy + HEX_SIZE * 0.94 * Math.sin(angle)).toFixed(1)}`,
    )
  }
  return pts.join(' ')
}

interface PlaybackStack {
  id: number
  side: 'attacker' | 'defender'
  unitId: string
  count: number
  position: HexCoord
}

/** Board state after applying the first `step` events of the log. */
function stacksAtStep(log: BoardBattleLog, step: number): PlaybackStack[] {
  const stacks: PlaybackStack[] = log.stacks.map((s) => ({ ...s, position: { ...s.position } }))
  for (let i = 0; i < step && i < log.events.length; i++) {
    const e = log.events[i]!
    if (e.type === 'move') {
      const mover = stacks.find((s) => s.id === e.stackId)
      if (mover) mover.position = { ...e.to }
    } else if (e.type === 'attack' || e.type === 'retaliation') {
      const target = stacks.find((s) => s.id === e.targetId)
      if (target) target.count = e.targetCount
    }
  }
  return stacks.filter((s) => s.count > 0)
}

export function BattleBoardSheet({ report, playerName, onClose }: BattleBoardSheetProps) {
  const { unitName } = useTheme()
  const board = report.board
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)

  const totalSteps = board?.events.length ?? 0

  useEffect(() => {
    if (!playing || !board) return
    if (step >= totalSteps) {
      setPlaying(false)
      return
    }
    const id = setTimeout(() => setStep((s) => Math.min(s + 1, totalSteps)), 600)
    return () => clearTimeout(id)
  }, [playing, step, totalSteps, board])

  const stacks = useMemo(() => (board ? stacksAtStep(board, step) : []), [board, step])

  const displayUnitName = (unitId: string) => {
    const def = Object.values(FACTIONS)
      .flatMap((f) => f.units)
      .find((u) => u.id === unitId)
    return unitName(unitId, def?.name ?? unitId)
  }

  // Per-unit-tier troop icon (#26/#89): undefined for tier 1 or any faction/tier that
  // hasn't been generated yet, in which case the board keeps its plain 2-letter fallback.
  const unitTierIconUrl = (unitId: string): string | undefined => {
    for (const faction of Object.values(FACTIONS)) {
      const def = faction.units.find((u) => u.id === unitId)
      if (def) return faction.unitTierSpriteUrls?.[def.tier]
    }
    return undefined
  }

  const eventCaption = (e: BoardEvent | undefined): string => {
    if (!board || !e) return 'Deployment'
    const name = (id: number) => {
      const s = board.stacks.find((st) => st.id === id)
      return s ? displayUnitName(s.unitId) : '?'
    }
    switch (e.type) {
      case 'move':
        return `Round ${e.round}: ${name(e.stackId)} advance`
      case 'hold':
        return `Round ${e.round}: ${name(e.stackId)} hold the line`
      case 'attack':
      case 'retaliation': {
        const verb =
          e.type === 'attack'
            ? e.ranged
              ? 'fire on'
              : e.flanked
                ? 'flank'
                : 'strike'
            : 'strike back at'
        const slain = e.kills > 0 ? `, ${e.kills} slain` : ''
        return `Round ${e.round}: ${name(e.stackId)} ${verb} ${name(e.targetId)} (${e.damage} damage${slain})`
      }
    }
  }

  const svgWidth = board ? HEX_SIZE * SQRT3 * (board.width + 0.5) + HEX_SIZE : 0
  const svgHeight = board ? HEX_SIZE * (1.5 * board.height + 0.5) + HEX_SIZE : 0

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet battle-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__header">
          <h2>
            {board ? 'Boarding action' : 'Naval battle'} — {playerName(report.winnerId)} victorious
          </h2>
          <button className="sheet__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <section>
          <p className="building-option__hint">
            {report.rounds.length} round{report.rounds.length === 1 ? '' : 's'} of gunnery
            {report.escapedId ? ` — ${playerName(report.escapedId)} broke off and escaped` : ''}
            {board ? ' — then the crews met on the deck' : ''}
          </p>
        </section>

        {board && (
          <section>
            <div className="battle-board-scroll">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="battle-board-svg"
                role="img"
                aria-label="Boarding melee on the battle board"
              >
                {board.terrain.map((t, i) => {
                  const hex = { col: i % board.width, row: Math.floor(i / board.width) }
                  const { x, y } = hexCenter(hex)
                  return (
                    <polygon
                      key={i}
                      points={hexPoints(x, y)}
                      fill={TERRAIN_FILL[t] ?? TERRAIN_FILL.open}
                      stroke="#0e1c26"
                      strokeWidth="1"
                    />
                  )
                })}
                {stacks.map((s) => {
                  const { x, y } = hexCenter(s.position)
                  const iconUrl = unitTierIconUrl(s.unitId)
                  return (
                    <g key={s.id}>
                      <circle
                        cx={x}
                        cy={y}
                        r={HEX_SIZE * 0.62}
                        fill={s.side === 'attacker' ? '#a33c2e' : '#2e5da3'}
                        stroke="#0e1c26"
                        strokeWidth="1.5"
                      />
                      {iconUrl ? (
                        <image
                          href={iconUrl}
                          x={x - HEX_SIZE * 0.5}
                          y={y - HEX_SIZE * 0.58}
                          width={HEX_SIZE}
                          height={HEX_SIZE}
                          clipPath="circle(46%)"
                          preserveAspectRatio="xMidYMid slice"
                        />
                      ) : (
                        <text
                          x={x}
                          y={y - 2}
                          textAnchor="middle"
                          className="battle-board-svg__unit"
                        >
                          {displayUnitName(s.unitId).slice(0, 2)}
                        </text>
                      )}
                      <text
                        x={x}
                        y={y + 10}
                        textAnchor="middle"
                        className="battle-board-svg__count"
                      >
                        {s.count}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>

            <p className="building-option__hint">{eventCaption(board.events[step - 1])}</p>

            <div className="button-group">
              <button
                className="secondary"
                onClick={() => {
                  setPlaying(false)
                  setStep((s) => Math.max(0, s - 1))
                }}
                disabled={step === 0}
              >
                ◀ Back
              </button>
              <button
                className="secondary"
                onClick={() => {
                  if (step >= totalSteps) {
                    setStep(0)
                    setPlaying(true)
                  } else {
                    setPlaying((p) => !p)
                  }
                }}
              >
                {playing ? 'Pause' : step >= totalSteps ? '⟲ Replay' : 'Play'}
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setPlaying(false)
                  setStep((s) => Math.min(totalSteps, s + 1))
                }}
                disabled={step >= totalSteps}
              >
                Next ▶
              </button>
            </div>
          </section>
        )}

        <section>
          <button className="primary" onClick={onClose}>
            Continue
          </button>
        </section>
      </div>
    </div>
  )
}
