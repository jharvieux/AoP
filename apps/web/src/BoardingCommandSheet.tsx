import {
  hexEquals,
  hexIndex,
  type BoardActivationView,
  type BoardCommand,
  type HexCoord,
} from '@aop/engine'
import { useState } from 'react'
import { deepEqual } from './deepEqual'
import {
  BoardDefs,
  boardSvgSize,
  boardUnitFallbackName,
  hexCenter,
  hexPoints,
  HEX_SIZE,
  StackToken,
  TerrainHex,
} from './battleBoardSvg'
import {
  planAttack,
  planMove,
  type AttackPlan,
  type MovePlan,
  type StackLoss,
} from './boardingPlanner'
import { impactFeedback, tapFeedback } from './audio/feedback'
import { useTheme } from './theme/ThemeContext'

/**
 * Interactive boarding melee (#93): the player commands each of their stacks
 * on the same hex battle sheet the playback uses. The engine's activation
 * view drives everything — reachable hexes glow, engageable enemies get a
 * ring, and every order is previewed on the board before it's confirmed (tap
 * the same spot again, or the Confirm button). Tapping a lit hex then an
 * enemy next to it strikes from that exact hex — the HoMM attack-direction
 * move. There is no close button: the attack is already committed (backing
 * out after seeing the fight unfold would be a free scry on a deterministic
 * battle); "fight on" hands the rest to the crew (board AI) instead.
 */

interface BoardingCommandSheetProps {
  view: BoardActivationView
  /** Losses since the player's previous order — enemy activations happened in between. */
  losses: StackLoss[]
  onCommand: (command: BoardCommand) => void
  onAutoResolve: () => void
}

type Preview =
  | { kind: 'move'; plan: MovePlan; to: HexCoord }
  | { kind: 'attack'; plan: AttackPlan; targetId: number }
  | { kind: 'hold' }

function commandOf(view: BoardActivationView, preview: Preview): BoardCommand {
  if (preview.kind === 'move') return preview.plan.command
  if (preview.kind === 'attack') return preview.plan.command
  return { stackId: view.stack.id }
}

export function BoardingCommandSheet({
  view,
  losses,
  onCommand,
  onAutoResolve,
}: BoardingCommandSheetProps) {
  const { unitName } = useTheme()
  const [preview, setPreview] = useState<Preview | null>(null)

  const acting = view.stack
  const displayUnitName = (unitId: string) => unitName(unitId, boardUnitFallbackName(unitId))

  const engageable = new Set(
    view.targets.filter((t) => planAttack(view, t.targetId) !== null).map((t) => t.targetId),
  )

  function confirm(next: Preview) {
    impactFeedback()
    setPreview(null)
    onCommand(commandOf(view, next))
  }

  function handleHexClick(hex: HexCoord) {
    const plan = planMove(view, hex)
    if (!plan) {
      // Tap-away anywhere unreachable cancels the pending preview.
      setPreview(null)
      return
    }
    if (preview?.kind === 'move' && hexEquals(preview.to, hex)) {
      confirm(preview)
      return
    }
    tapFeedback()
    setPreview({ kind: 'move', plan, to: hex })
  }

  function handleEnemyClick(targetId: number) {
    // A pending move upgrades to "strike from that hex" when the enemy is engageable from it.
    const fromHex = preview?.kind === 'move' ? preview.to : undefined
    const plan =
      (fromHex ? planAttack(view, targetId, fromHex) : null) ?? planAttack(view, targetId)
    if (!plan) return
    if (
      preview?.kind === 'attack' &&
      preview.targetId === targetId &&
      deepEqual(preview.plan.command, plan.command)
    ) {
      confirm(preview)
      return
    }
    tapFeedback()
    setPreview({ kind: 'attack', plan, targetId })
  }

  function handleHold() {
    if (preview?.kind === 'hold') {
      confirm(preview)
      return
    }
    tapFeedback()
    setPreview({ kind: 'hold' })
  }

  function caption(): string {
    if (!preview) {
      if (losses.length > 0) {
        const parts = losses.map(
          (l) =>
            `${l.side === 'attacker' ? 'your' : 'enemy'} ${displayUnitName(l.unitId)} ${l.before}→${l.after}`,
        )
        return `Since your last order: ${parts.join(', ')}`
      }
      return 'Tap a lit hex to move, a ringed enemy to attack, or Hold to brace. Tap again to confirm.'
    }
    if (preview.kind === 'move') {
      const ground =
        preview.plan.terrain === 'cover'
          ? ' into cover (blows land softer there)'
          : preview.plan.terrain === 'rough'
            ? ' across rough ground'
            : ''
      return `Move here${ground} — tap again or Confirm.`
    }
    if (preview.kind === 'attack') {
      const enemy = view.enemies.find((e) => e.id === preview.targetId)
      const name = enemy ? displayUnitName(enemy.unitId) : '?'
      const count = enemy ? ` (${enemy.count})` : ''
      if (preview.plan.mode === 'ranged') return `Fire on ${name}${count} — no reply at range.`
      const flank = preview.plan.flanking ? 'Flank' : 'Strike'
      const reply = preview.plan.retaliation
        ? ' — they can strike back'
        : ' — they already struck back this round'
      return `${flank} ${name}${count}${reply}.`
    }
    return 'Hold fast — braced against the next blow until this stack acts again.'
  }

  const { width: svgWidth, height: svgHeight } = boardSvgSize(view.width, view.height)
  const ownHpShare = Math.round(
    (view.ownTotalHp / Math.max(1, view.ownTotalHp + view.enemyTotalHp)) * 100,
  )

  const ghostAt =
    preview?.kind === 'move' ? preview.to : preview?.kind === 'attack' ? preview.plan.from : null
  const previewTargetId = preview?.kind === 'attack' ? preview.targetId : null

  return (
    <div className="sheet-backdrop">
      <div className="sheet battle-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__header">
          <h2>Boarding action — your command</h2>
        </div>

        <section>
          <p className="building-option__hint">
            Round {view.round} — your {displayUnitName(acting.unitId)} ({acting.count}) await
            orders.
          </p>
          <div
            className="boarding-strength"
            role="img"
            aria-label={`Crew strength: yours ${view.ownTotalHp}, theirs ${view.enemyTotalHp}`}
          >
            <div className="boarding-strength__own" style={{ width: `${ownHpShare}%` }} />
          </div>
        </section>

        <section>
          <div className="battle-board-scroll">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="battle-board-svg"
              role="img"
              aria-label="Boarding melee — awaiting your order"
            >
              <BoardDefs />
              {view.terrain.map((t, i) => {
                const hex = { col: i % view.width, row: Math.floor(i / view.width) }
                return (
                  <TerrainHex key={i} hex={hex} terrain={t} onClick={() => handleHexClick(hex)} />
                )
              })}
              {view.reachable.map((r) => {
                const { x, y } = hexCenter(r.hex)
                return (
                  <polygon
                    key={hexIndex(r.hex, view.width)}
                    points={hexPoints(x, y)}
                    className="battle-board-svg__reach"
                    onClick={() => handleHexClick(r.hex)}
                  />
                )
              })}

              {ghostAt && (
                <line
                  x1={hexCenter(acting.position).x}
                  y1={hexCenter(acting.position).y}
                  x2={hexCenter(ghostAt).x}
                  y2={hexCenter(ghostAt).y}
                  className="battle-board-svg__move-line"
                />
              )}

              {[acting, ...view.allies].map((s) => (
                <StackToken
                  key={s.id}
                  side={s.side}
                  unitId={s.unitId}
                  count={s.count}
                  position={s.position}
                  label={displayUnitName(s.unitId)}
                />
              ))}
              {view.enemies.map((s) => {
                const { x, y } = hexCenter(s.position)
                return (
                  <g key={s.id}>
                    <StackToken
                      side={s.side}
                      unitId={s.unitId}
                      count={s.count}
                      position={s.position}
                      label={displayUnitName(s.unitId)}
                      onClick={engageable.has(s.id) ? () => handleEnemyClick(s.id) : undefined}
                    />
                    {engageable.has(s.id) && (
                      <circle
                        cx={x}
                        cy={y}
                        r={HEX_SIZE * 0.76}
                        className={
                          s.id === previewTargetId
                            ? 'battle-board-svg__target-ring battle-board-svg__target-ring--preview'
                            : 'battle-board-svg__target-ring'
                        }
                      />
                    )}
                  </g>
                )
              })}

              <circle
                cx={hexCenter(acting.position).x}
                cy={hexCenter(acting.position).y}
                r={HEX_SIZE * 0.76}
                className="battle-board-svg__active-ring"
              />
              {ghostAt && (
                <StackToken
                  side={acting.side}
                  unitId={acting.unitId}
                  count={acting.count}
                  position={ghostAt}
                  label={displayUnitName(acting.unitId)}
                  ghost
                />
              )}
            </svg>
          </div>

          <p className="building-option__hint">{caption()}</p>

          <div className="button-group">
            <button className="secondary" onClick={() => setPreview(null)} disabled={!preview}>
              Cancel
            </button>
            <button className="secondary" onClick={handleHold}>
              Hold
            </button>
            <button
              className="primary"
              onClick={() => preview && confirm(preview)}
              disabled={!preview}
            >
              Confirm order
            </button>
          </div>
          <button className="secondary boarding-auto" onClick={onAutoResolve}>
            Let the crew fight on (auto-resolve)
          </button>
        </section>
      </div>
    </div>
  )
}
