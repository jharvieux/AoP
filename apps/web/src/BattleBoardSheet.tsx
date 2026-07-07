import type { BattleReport, BoardBattleLog, BoardEvent, HexCoord, RoundReport } from '@aop/engine'
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
 * Post-battle report sheet (#39). A boarding melee (the fight went to the hex
 * battle board) plays back blow by blow on an SVG hex grid. Every other naval
 * battle — the common case — now gets its own round-by-round playback (#304)
 * instead of a static one-line summary: the same Back/Play/Next transport,
 * stepping through each round's tactic choices, damage, and remaining hit
 * points from {@link BattleReport.rounds}. The board is small (11×8 hexes,
 * ≤14 stacks), so plain SVG stays comfortably past 60fps on phones — the
 * world map keeps the Pixi canvas; UI chrome like this stays in the DOM per
 * the architecture.
 */

interface BattleBoardSheetProps {
  report: BattleReport
  playerName: (id: string) => string
  onClose: () => void
}

const TACTIC_LABEL: Record<string, string> = {
  broadside: 'broadside',
  board: 'boarding action',
  ram: 'ram',
  evade: 'evasive maneuvers',
}

function tacticLabel(tactic: string | null): string {
  return tactic ? (TACTIC_LABEL[tactic] ?? tactic) : 'auto-resolve'
}

/** Caption for the gunnery playback at `step` (0 = pre-battle, else `rounds[step - 1]`). */
function roundCaption(rounds: RoundReport[], step: number): string {
  if (step === 0) return 'The fleets close to gun range.'
  const r = rounds[step - 1]
  if (!r) return ''
  return (
    `Round ${r.round}: ${tacticLabel(r.attackerTactic)} vs ${tacticLabel(r.defenderTactic)} — ` +
    `${Math.round(r.attackerDamage)} damage dealt, ${Math.round(r.defenderDamage)} damage taken ` +
    `(${Math.round(r.attackerHp)} hp vs ${Math.round(r.defenderHp)} hp)`
  )
}

/**
 * HP-bar fill percentage for `side` at `step`. `BattleReport` only carries HP
 * *after* each round, not the true starting HP, so the highest HP any round
 * reports stands in for "full" — round 1's post-damage figure is always the
 * highest point in the sequence, which is a close approximation for a bar and
 * needs no engine change to compute.
 */
function gunneryHpShare(
  rounds: RoundReport[],
  step: number,
  side: 'attacker' | 'defender',
): number {
  if (rounds.length === 0) return 100
  const hpOf = (r: RoundReport) => (side === 'attacker' ? r.attackerHp : r.defenderHp)
  const maxHp = Math.max(...rounds.map(hpOf), 1)
  if (step === 0) return 100
  const round = rounds[step - 1]
  const hp = round ? hpOf(round) : maxHp
  return Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)))
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

  // Boarding melees step through the board event log; every other battle
  // steps through its gunnery rounds instead (#304) — same transport, a
  // different source of truth for how many steps there are.
  const totalSteps = board ? board.events.length : report.rounds.length

  useEffect(() => {
    if (!playing) return
    if (step >= totalSteps) {
      setPlaying(false)
      return
    }
    const id = setTimeout(() => setStep((s) => Math.min(s + 1, totalSteps)), 600)
    return () => clearTimeout(id)
  }, [playing, step, totalSteps])

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

        <section>
          {board ? (
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
          ) : (
            <div className="gunnery-round" role="img" aria-label="Naval gunnery exchange">
              <div className="gunnery-round__side">
                <strong>{playerName(report.attacker.ownerId)}</strong>
                <div className="gunnery-hp-bar">
                  <div
                    className="gunnery-hp-bar__fill"
                    style={{ width: `${gunneryHpShare(report.rounds, step, 'attacker')}%` }}
                  />
                </div>
              </div>
              <div className="gunnery-round__side">
                <strong>{playerName(report.defender.ownerId)}</strong>
                <div className="gunnery-hp-bar">
                  <div
                    className="gunnery-hp-bar__fill"
                    style={{ width: `${gunneryHpShare(report.rounds, step, 'defender')}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <p className="building-option__hint">
            {board ? eventCaption(board.events[step - 1]) : roundCaption(report.rounds, step)}
          </p>

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

        <section>
          <button className="primary" onClick={onClose}>
            Continue
          </button>
        </section>
      </div>
    </div>
  )
}
