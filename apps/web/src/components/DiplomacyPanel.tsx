import { useState } from 'react'
import { FACTIONS } from '@aop/content'
import { useTheme } from '../theme/ThemeContext'
import { BottomSheet } from './BottomSheet'
import { buildDiplomacyRoster, type DiplomacyPlayerInfo, type ViewAlliancesLike } from './diplomacy'

export interface DiplomacyPanelProps {
  viewerId: string
  viewerReputation: number
  /** Every other living seat (see `buildDiplomacyRoster` — the viewer and eliminated seats are dropped). */
  players: DiplomacyPlayerInfo[]
  /** The viewer-scoped alliance graph — `GameState.alliances` in single/local play, or `PlayerView.alliances` in multiplayer. */
  alliances: ViewAlliancesLike
  /** `setup.allianceReputationMin` (#138) — the minimum reputation to propose or accept a new alliance. */
  allianceReputationMin: number
  onPropose: (targetId: string) => void
  onAccept: (proposerId: string) => void
  onLeave: (otherId: string) => void
  onClose: () => void
  /**
   * Alliance actions are turn-ordered (docs/MULTIPLAYER.md §5/§9 — engine
   * validation is the single choke point, and `applyActionWithOutcome` rejects
   * off-turn actions the same as any other). Pass `true` outside the viewer's
   * turn so the panel can disable actions rather than let the server bounce
   * every one of them.
   */
  disabled?: boolean
}

/**
 * The diplomacy panel (#141): current alliances, pending proposals in both
 * directions, and every other seat's public reputation (#138, disclosed via
 * `playerView`), with affordances to propose/accept/leave an alliance. Reuses
 * the same engine actions (`proposeAlliance`/`acceptAlliance`/`leaveAlliance`,
 * #136/#137) GameScreen already dispatches other actions through — there is no
 * separate alliance edge function to call.
 */
export function DiplomacyPanel({
  viewerId,
  viewerReputation,
  players,
  alliances,
  allianceReputationMin,
  onPropose,
  onAccept,
  onLeave,
  onClose,
  disabled = false,
}: DiplomacyPanelProps) {
  const { factionName } = useTheme()
  const [confirmingLeaveId, setConfirmingLeaveId] = useState<string | null>(null)

  const roster = buildDiplomacyRoster(
    viewerId,
    viewerReputation,
    players,
    alliances,
    allianceReputationMin,
  )
  const allyRows = roster.filter((r) => r.relation === 'ally')
  const incomingRows = roster.filter((r) => r.relation === 'incomingProposal')
  const outgoingRows = roster.filter((r) => r.relation === 'outgoingProposal')
  const otherRows = roster.filter((r) => r.relation === 'none')

  function label(faction: DiplomacyPlayerInfo['faction']) {
    return factionName(faction, FACTIONS[faction].name)
  }

  return (
    <BottomSheet title="Diplomacy" onClose={onClose}>
      <section className="diplomacy-section">
        <h3>Your reputation: {viewerReputation}</h3>
      </section>

      <section className="diplomacy-section">
        <h3>Alliances</h3>
        {allyRows.length === 0 ? (
          <p className="diplomacy-empty">No standing alliances.</p>
        ) : (
          <ul className="diplomacy-list">
            {allyRows.map(({ player }) => (
              <li key={player.id} className="diplomacy-row">
                <span className="diplomacy-row__name">
                  {player.name} ({label(player.faction)})
                </span>
                <span className="diplomacy-row__reputation">Rep {player.reputation}</span>
                {confirmingLeaveId === player.id ? (
                  <span className="button-group">
                    <button
                      className="danger"
                      disabled={disabled}
                      onClick={() => {
                        onLeave(player.id)
                        setConfirmingLeaveId(null)
                      }}
                    >
                      Confirm break
                    </button>
                    <button className="secondary" onClick={() => setConfirmingLeaveId(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    className="secondary"
                    disabled={disabled}
                    onClick={() => setConfirmingLeaveId(player.id)}
                  >
                    Break alliance
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="diplomacy-section">
        <h3>Proposals awaiting you</h3>
        {incomingRows.length === 0 ? (
          <p className="diplomacy-empty">No pending proposals.</p>
        ) : (
          <ul className="diplomacy-list">
            {incomingRows.map(({ player }) => (
              <li key={player.id} className="diplomacy-row">
                <span className="diplomacy-row__name">
                  {player.name} ({label(player.faction)})
                </span>
                <span className="diplomacy-row__reputation">Rep {player.reputation}</span>
                <button className="primary" disabled={disabled} onClick={() => onAccept(player.id)}>
                  Accept
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="diplomacy-section">
        <h3>Your outgoing proposals</h3>
        {outgoingRows.length === 0 ? (
          <p className="diplomacy-empty">No proposals sent.</p>
        ) : (
          <ul className="diplomacy-list">
            {outgoingRows.map(({ player }) => (
              <li key={player.id} className="diplomacy-row">
                <span className="diplomacy-row__name">
                  {player.name} ({label(player.faction)})
                </span>
                <span className="diplomacy-row__hint">Awaiting response…</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="diplomacy-section">
        <h3>Other captains</h3>
        {otherRows.length === 0 ? (
          <p className="diplomacy-empty">No other seats to treat with.</p>
        ) : (
          <ul className="diplomacy-list">
            {otherRows.map(({ player, reputationOk }) => (
              <li key={player.id} className="diplomacy-row">
                <span className="diplomacy-row__name">
                  {player.name} ({label(player.faction)})
                </span>
                <span className="diplomacy-row__reputation">Rep {player.reputation}</span>
                <button
                  className="secondary"
                  disabled={disabled || !reputationOk}
                  onClick={() => onPropose(player.id)}
                >
                  Propose alliance
                </button>
                {!reputationOk && (
                  <p className="diplomacy-row__hint">
                    Reputation too low to ally (needs {allianceReputationMin}+).
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </BottomSheet>
  )
}
