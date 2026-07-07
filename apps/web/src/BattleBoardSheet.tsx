import type { BattleReport, BoardBattleLog, BoardEvent, HexCoord } from '@aop/engine'
import { useEffect, useMemo, useState } from 'react'
import {
  BoardDefs,
  boardSvgSize,
  HEX_SIZE,
  hexCenter,
  StackToken,
  TerrainHex,
  unitDefinition,
} from './battleBoardSvg'
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

  // The event that just played (#303): drives the hit flash/shake on the
  // target's token and the floating damage number below. `step` itself is
  // enough of a key — it only advances forward, so it's always fresh even
  // when the same stack is struck on consecutive steps.
  const lastEvent = board?.events[step - 1]
  const hit =
    lastEvent && (lastEvent.type === 'attack' || lastEvent.type === 'retaliation')
      ? { targetId: lastEvent.targetId, damage: lastEvent.damage }
      : null
  // Looked up a step earlier than `stacks` above: a killing blow removes the
  // target from `stacksAtStep(step)` entirely (count reaches 0), which would
  // otherwise swallow the floating damage number on exactly the hits players
  // most want to see.
  const hitStack = hit
    ? stacksAtStep(board!, step - 1).find((s) => s.id === hit.targetId)
    : undefined

  const displayUnitName = (unitId: string) =>
    unitName(unitId, unitDefinition(unitId)?.name ?? unitId)

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

  const { width: svgWidth, height: svgHeight } = board
    ? boardSvgSize(board.width, board.height)
    : { width: 0, height: 0 }

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
                <BoardDefs />
                {board.terrain.map((t, i) => (
                  <TerrainHex
                    key={i}
                    hex={{ col: i % board.width, row: Math.floor(i / board.width) }}
                    terrain={t}
                  />
                ))}
                {stacks.map((s) => (
                  <StackToken
                    key={s.id}
                    side={s.side}
                    unitId={s.unitId}
                    count={s.count}
                    position={s.position}
                    label={displayUnitName(s.unitId)}
                    hitKey={hit?.targetId === s.id ? `hit-${step}` : undefined}
                  />
                ))}
                {hit && hitStack && (
                  <text
                    key={`dmg-${step}`}
                    x={hexCenter(hitStack.position).x}
                    y={hexCenter(hitStack.position).y - HEX_SIZE}
                    textAnchor="middle"
                    className="battle-board-svg__damage"
                  >
                    -{hit.damage}
                  </text>
                )}
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
