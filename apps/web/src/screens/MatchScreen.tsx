import type { Action, EncounterChoice, EncounterKind, PlayerView } from '@aop/engine'
import { FACTIONS } from '@aop/content'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AdSlot } from '../AdSlot'
import { impactFeedback, shipMoveFeedback, tapFeedback } from '../audio/feedback'
import { useAuth } from '../auth'
import { resolveSupabaseConfig } from '../auth/config'
import { BottomSheet } from '../components/BottomSheet'
import { DiplomacyPanel } from '../components/DiplomacyPanel'
import { MatchChatPanel } from '../components/MatchChatPanel'
import { CityScreen } from '../CityScreen'
import { MapCanvas } from '../MapCanvas'
import type { ChatPokeTransport } from '../multiplayer/chatSync'
import {
  captainFromView,
  cityFromView,
  interpretTileClick,
  matchAction,
  ownCaptains,
} from '../multiplayer/matchActions'
import { MatchActionClient, MatchActionError } from '../multiplayer/matchActionClient'
import { boardFromPlayerView } from '../multiplayer/playerViewBoard'
import { subscribeReconnectSync } from '../multiplayer/reconnectSync'
import { SpectateClient, SpectateError } from '../multiplayer/spectateClient'
import { subscribeSpectatePoll } from '../multiplayer/spectatePoll'
import {
  detectTurnTransition,
  formatCountdown,
  isViewerTurn,
  turnCountdown,
} from '../multiplayer/turnTimer'
import { ResourceHud } from '../ResourceHud'
import { UI_ICON } from '../uiIcons'

/** Poll cadence for `get-player-view` — the stand-in for a Realtime turn poke
 * (#243's transport decision is still with the operator; see spectatePoll.ts). */
const POLL_INTERVAL_MS = 4000
const CHAT_POLL_INTERVAL_MS = 5000
const BASE_TITLE = document.title

interface MatchScreenProps {
  matchId: string
  onBack: () => void
}

interface LiveMatch {
  seq: number
  seat: number
  view: PlayerView
  turnDeadline: string | null
}

/**
 * Poll-driven stand-in for the Realtime chat poke: fires a synthetic,
 * strictly-increasing chat poke on an interval so `useMatchChat`'s existing
 * poke-driven refetch runs without a Realtime transport. Swap for the real
 * `match:{id}` channel when #243's transport lands — nothing else changes.
 */
function pollingChatTransport(intervalMs: number): ChatPokeTransport {
  return {
    subscribe(_channel, onPoke) {
      let tick = 0
      const id = setInterval(() => onPoke({ type: 'chat', id: ++tick }), intervalMs)
      return () => clearInterval(id)
    },
  }
}

/**
 * The live multiplayer match screen (#261, building on #243's modules): the
 * fog-locked `PlayerView` board with the full action surface — captain
 * select/move, attack, encounters, city build/recruit, diplomacy, chat, end
 * turn, resign — every action proposed through `submit-action` and
 * re-validated server-side (§5.4). The screen never holds a `GameState`;
 * every intent is derived from the view by `matchActions.ts` and every
 * response replaces the view wholesale (§13 — no diff-patching).
 */
export function MatchScreen({ matchId, onBack }: MatchScreenProps) {
  const auth = useAuth()

  const [live, setLive] = useState<LiveMatch | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedCaptainId, setSelectedCaptainId] = useState<string | null>(null)
  const [attackTargetId, setAttackTargetId] = useState<string | null>(null)
  const [encounterId, setEncounterId] = useState<string | null>(null)
  const [openCityId, setOpenCityId] = useState<string | null>(null)
  const [diplomacyOpen, setDiplomacyOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [confirmingResign, setConfirmingResign] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const prevViewRef = useRef<PlayerView | null>(null)
  // Whether any view has ever loaded — ref, not state, because `refetch` is
  // captured once by the mount effect and must not read a stale `live`.
  const hasLoadedRef = useRef(false)

  const config = resolveSupabaseConfig()
  const session = auth.state.status === 'authenticated' ? auth.state.session : null

  async function refetch() {
    if (!session || !config) return
    try {
      const result = await new SpectateClient(config).getPlayerView(session, matchId)
      hasLoadedRef.current = true
      setLive({
        seq: result.seq,
        seat: result.seat,
        view: result.view,
        turnDeadline: result.turnDeadline,
      })
      setLoadError(null)
    } catch (err) {
      // Transient refetch failures keep the last-known view (the next poll
      // retries); losing the seat or the match ends the session outright.
      if (err instanceof SpectateError && (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND')) {
        setLive(null)
        setLoadError(err.message)
      } else if (!hasLoadedRef.current) {
        setLoadError(err instanceof Error ? err.message : 'Could not load the match.')
      }
    }
  }

  // Initial load + steady-state poll + reconnect resync (§9): network return
  // and tab-visibility return both force a refetch through the same
  // subscribeReconnectSync module a Realtime transport would use.
  useEffect(() => {
    if (!session || !config) return
    void refetch()
    const stopPoll = subscribeSpectatePoll({ intervalMs: POLL_INTERVAL_MS, onTick: refetch })
    const stopResync = subscribeReconnectSync({
      transport: {
        onChannelStatusChange: () => () => undefined, // no Realtime channel yet (#243)
        onNetworkStatusChange: (handler) => {
          const online = () => handler(true)
          const offline = () => handler(false)
          window.addEventListener('online', online)
          window.addEventListener('offline', offline)
          return () => {
            window.removeEventListener('online', online)
            window.removeEventListener('offline', offline)
          }
        },
        onVisibilityReturn: (handler) => {
          const onVisibility = () => {
            if (document.visibilityState === 'visible') handler()
          }
          document.addEventListener('visibilitychange', onVisibility)
          window.addEventListener('focus', handler)
          return () => {
            document.removeEventListener('visibilitychange', onVisibility)
            window.removeEventListener('focus', handler)
          }
        },
      },
      onResync: refetch,
    })
    return () => {
      stopPoll()
      stopResync()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, auth.state.status])

  // 1 Hz countdown tick — drives only the timer readout.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Turn-change notification (#35): haptic nudge + tab title while it's the
  // viewer's move, so a backgrounded tab still signals.
  useEffect(() => {
    const view = live?.view ?? null
    if (view) {
      const transition = detectTurnTransition(prevViewRef.current, view)
      if (transition === 'your-turn') impactFeedback()
      document.title = isViewerTurn(view) ? `Your turn — ${BASE_TITLE}` : BASE_TITLE
    }
    prevViewRef.current = view
  }, [live?.view])
  useEffect(
    () => () => {
      document.title = BASE_TITLE
    },
    [],
  )

  const board = useMemo(() => (live ? boardFromPlayerView(live.view) : null), [live?.view])
  const chatTransport = useMemo(() => pollingChatTransport(CHAT_POLL_INTERVAL_MS), [])

  async function submit(action: Action) {
    if (!session || !config || !live || submitting) return
    setActionError(null)
    setSubmitting(true)
    try {
      const client = new MatchActionClient(config)
      const result = await client.submitAction(session, {
        matchId,
        expectedSeq: live.seq,
        action,
      })
      setLive({ ...live, seq: result.seq, view: result.view })
      // The response carries no turn_deadline; pick the fresh one up now
      // rather than waiting out the poll interval.
      void refetch()
    } catch (err) {
      if (err instanceof MatchActionError && err.isStale) {
        // §9 step 3: stale view — discard and refetch, never patch around it.
        setActionError('The board changed — refreshed.')
        setSelectedCaptainId(null)
        void refetch()
      } else {
        setActionError(err instanceof Error ? err.message : 'The action was rejected.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError || !session || !config) {
    return (
      <div className="screen menu-screen">
        <div className="menu-content">
          <h1 className="game-title">Match</h1>
          <p className="theme-error">
            {!session || !config ? 'Sign in from Account to play multiplayer matches.' : loadError}
          </p>
          <button className="back-button" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    )
  }

  if (!live || !board) {
    return (
      <div className="screen menu-screen">
        <div className="menu-content">
          <h1 className="game-title">Loading match…</h1>
          <button className="back-button" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    )
  }

  const { view } = live
  const viewer = view.players.find((p) => p.id === view.viewerId)
  const currentPlayer = view.players[view.currentPlayerIndex]
  const myTurn = isViewerTurn(view)
  const countdown = turnCountdown(live.turnDeadline, nowMs)
  const hasAlliance = view.alliances.allies.length > 0

  const selectedCaptain =
    view.captains.find((c) => c.id === selectedCaptainId && c.ownerId === view.viewerId) ?? null
  const attackTarget = attackTargetId
    ? (view.captains.find((c) => c.id === attackTargetId) ?? null)
    : null
  const encounter = encounterId
    ? (view.encounters.find((e) => e.id === encounterId && e.active) ?? null)
    : null
  // ViewEncounter.kind is a plain string on the wire; the catalog lookup needs
  // the engine's kind union. An unknown kind just yields no choices.
  const encounterChoices = encounter
    ? Object.keys(view.rules.content?.encounters?.[encounter.kind as EncounterKind]?.choices ?? {})
    : []

  const openCity = openCityId
    ? (view.cities.find((c) => c.id === openCityId && c.ownerId === view.viewerId) ?? null)
    : null
  const openCityState = openCity ? cityFromView(openCity) : null
  const myCaptains = ownCaptains(view)
    .map(captainFromView)
    .filter((c): c is NonNullable<typeof c> => c !== null)
  const captainAtOpenCity = openCity
    ? myCaptains.find(
        (c) =>
          Math.max(
            Math.abs(c.position.x - openCity.position.x),
            Math.abs(c.position.y - openCity.position.y),
          ) <= 1,
      )
    : undefined
  const firstOwnCityId = view.cities.find((c) => c.ownerId === view.viewerId)?.id ?? null

  function handleTileClick(x: number, y: number) {
    if (!live || !board || !myTurn || view.status !== 'active' || submitting) return
    const intent = interpretTileClick(view, board.map, selectedCaptainId, x, y)
    if (!intent) return
    switch (intent.kind) {
      case 'selectCaptain':
        setSelectedCaptainId(intent.captainId)
        setAttackTargetId(null)
        break
      case 'openCity':
        tapFeedback()
        setOpenCityId(intent.cityId)
        break
      case 'move':
        shipMoveFeedback()
        void submit(matchAction.move(view, selectedCaptain!.id, intent.to))
        break
      case 'attack':
        setAttackTargetId(intent.targetCaptainId)
        break
      case 'encounter':
        setEncounterId(intent.encounterId)
        break
    }
  }

  function confirmAttack() {
    if (!selectedCaptain || !attackTarget) return
    impactFeedback()
    const captainId = selectedCaptain.id
    const targetCaptainId = attackTarget.id
    setAttackTargetId(null)
    setSelectedCaptainId(null)
    void submit(matchAction.attack(view, captainId, targetCaptainId))
  }

  function resolveEncounter(choice: string) {
    if (!selectedCaptain || !encounter) return
    impactFeedback()
    void submit(
      matchAction.resolveEncounter(
        view,
        selectedCaptain.id,
        encounter.id,
        choice as EncounterChoice,
      ),
    )
    setEncounterId(null)
    setSelectedCaptainId(null)
  }

  const seatName = (seat: number) =>
    view.players.find((p) => p.id === `seat-${seat}`)?.name ?? `Seat ${seat}`

  return (
    <div className="game-screen-container">
      <header className="hud">
        <h1>Age of Plunder</h1>
        <span className="turn-info">
          Round {view.round} —{' '}
          {view.status === 'finished'
            ? view.winnerId
              ? `${view.players.find((p) => p.id === view.winnerId)?.name ?? view.winnerId} wins!`
              : 'Match finished'
            : myTurn
              ? 'Your move'
              : `${currentPlayer?.name ?? '…'} is playing`}
          {view.status === 'active' && countdown && (
            <span className={`turn-countdown${countdown.urgent ? ' turn-countdown--urgent' : ''}`}>
              {' '}
              ·{' '}
              {countdown.expired
                ? 'auto-skip imminent'
                : formatCountdown(countdown.remainingSeconds)}
            </span>
          )}
        </span>
        {viewer?.resources && <ResourceHud resources={viewer.resources} />}
      </header>

      {actionError && (
        <div className="autosave-failing-banner" role="status">
          {actionError}
        </div>
      )}

      <div className="map-container">
        <MapCanvas
          map={board.map}
          captains={board.captains}
          cities={board.cities}
          encounters={board.encounters}
          viewerId={view.viewerId}
          visibleKeys={board.visibleKeys}
          exploredKeys={board.exploredKeys}
          selectedCaptainId={selectedCaptainId}
          onTileClick={handleTileClick}
          factionOf={board.factionOf}
        />
      </div>

      <div className="bottom-action-bar">
        <div className="button-group">
          <button
            className="secondary"
            onClick={() => {
              tapFeedback()
              if (firstOwnCityId) setOpenCityId(firstOwnCityId)
            }}
            disabled={!myTurn || !firstOwnCityId}
          >
            City
          </button>
          <button
            className="secondary"
            onClick={() => {
              tapFeedback()
              setDiplomacyOpen(true)
            }}
            disabled={view.status !== 'active'}
          >
            Diplomacy
          </button>
          <button
            className="secondary"
            onClick={() => {
              tapFeedback()
              setChatOpen(true)
            }}
          >
            Chat
          </button>
          <button
            className="primary"
            onClick={() => {
              tapFeedback()
              setSelectedCaptainId(null)
              void submit(matchAction.endTurn(view))
            }}
            disabled={!myTurn || submitting || view.status !== 'active'}
          >
            {UI_ICON.endTurn && (
              <img className="button-icon" src={UI_ICON.endTurn} alt="" aria-hidden />
            )}
            {myTurn ? 'End Turn' : 'Waiting…'}
          </button>
          {view.status === 'active' &&
            (!confirmingResign ? (
              <button className="secondary" onClick={() => setConfirmingResign(true)}>
                Resign
              </button>
            ) : (
              <>
                <button
                  className="danger"
                  disabled={!myTurn || submitting}
                  onClick={() => {
                    impactFeedback()
                    setConfirmingResign(false)
                    void submit(matchAction.resign(view))
                  }}
                >
                  Confirm Resign
                </button>
                <button className="secondary" onClick={() => setConfirmingResign(false)}>
                  Cancel
                </button>
              </>
            ))}
          <button className="secondary" onClick={onBack}>
            Leave
          </button>
        </div>
      </div>

      {/* Between-turns placement only (docs/ARCHITECTURE.md §9): never while a
          sheet is open, never during the viewer's own move. */}
      {!myTurn &&
        view.status === 'active' &&
        !attackTarget &&
        !encounter &&
        !openCity &&
        !diplomacyOpen &&
        !chatOpen && <AdSlot placement="between-turns" />}

      {attackTarget && selectedCaptain && (
        <BottomSheet title={`Engage ${attackTarget.name}?`} onClose={() => setAttackTargetId(null)}>
          <section className="battle-intro">
            <div className="battle-intro__side">
              {FACTIONS[board.factionOf(selectedCaptain.ownerId)].captainPortraitUrl && (
                <img
                  className="battle-intro__portrait"
                  src={FACTIONS[board.factionOf(selectedCaptain.ownerId)].captainPortraitUrl}
                  alt=""
                  aria-hidden
                />
              )}
              <span>{selectedCaptain.name}</span>
            </div>
            <span className="battle-intro__vs">VS</span>
            <div className="battle-intro__side">
              {FACTIONS[board.factionOf(attackTarget.ownerId)].captainPortraitUrl && (
                <img
                  className="battle-intro__portrait"
                  src={FACTIONS[board.factionOf(attackTarget.ownerId)].captainPortraitUrl}
                  alt=""
                  aria-hidden
                />
              )}
              <span>{attackTarget.name}</span>
            </div>
          </section>
          <section>
            <p className="building-option__hint">
              No odds preview in multiplayer — their manifest is exactly what the fog hides.
            </p>
            <button className="primary" onClick={confirmAttack} disabled={submitting}>
              {UI_ICON.attack && (
                <img className="button-icon" src={UI_ICON.attack} alt="" aria-hidden />
              )}
              Attack
            </button>
          </section>
        </BottomSheet>
      )}

      {encounter && (
        <BottomSheet
          title={
            encounter.kind === 'merchant'
              ? 'A merchant ship hails you'
              : encounter.kind === 'natives'
                ? 'A native village on the shore'
                : 'A band of settlers adrift'
          }
          onClose={() => setEncounterId(null)}
        >
          <section className="button-group">
            {encounterChoices.map((choice) => (
              <button
                key={choice}
                className="secondary"
                disabled={submitting}
                onClick={() => resolveEncounter(choice)}
              >
                {choice[0]!.toUpperCase() + choice.slice(1)}
              </button>
            ))}
          </section>
        </BottomSheet>
      )}

      {openCity && openCityState && viewer?.resources && (
        <CityScreen
          city={openCityState}
          captain={captainAtOpenCity}
          captains={myCaptains}
          faction={viewer.faction}
          resources={viewer.resources}
          onClose={() => setOpenCityId(null)}
          onBuild={(buildingId) =>
            void submit(matchAction.construct(view, openCity.id, buildingId))
          }
          onRecruit={(unitId) => void submit(matchAction.recruit(view, openCity.id, unitId))}
          onTransfer={(direction, unitId) => {
            if (!captainAtOpenCity) return
            void submit(
              matchAction.transferTroops(
                view,
                openCity.id,
                captainAtOpenCity.id,
                direction,
                unitId,
              ),
            )
          }}
          onSetStandingOrders={(orders) => {
            if (!captainAtOpenCity) return
            void submit(matchAction.setStandingOrders(view, captainAtOpenCity.id, orders))
          }}
          onSetBoardOrders={(boardOrders) => {
            if (!captainAtOpenCity) return
            // A view never discloses current orders (write-only from a client,
            // §7), so board doctrine rides an empty naval-order slate rather
            // than re-sending unknown existing orders.
            void submit(matchAction.setStandingOrders(view, captainAtOpenCity.id, [], boardOrders))
          }}
          onChooseCaptainSkill={(skillId) => {
            if (!captainAtOpenCity) return
            void submit(matchAction.chooseCaptainSkill(view, captainAtOpenCity.id, skillId))
          }}
          onUpgradeShip={(track) => {
            if (!captainAtOpenCity) return
            void submit(matchAction.upgradeShip(view, openCity.id, captainAtOpenCity.id, track))
          }}
        />
      )}

      {diplomacyOpen && viewer && (
        <DiplomacyPanel
          viewerId={view.viewerId}
          viewerReputation={viewer.reputation}
          players={view.players
            .filter((p) => p.id !== view.viewerId)
            .map((p) => ({
              id: p.id,
              name: p.name,
              faction: p.faction,
              reputation: p.reputation,
              eliminated: p.eliminated,
            }))}
          alliances={view.alliances}
          allianceReputationMin={view.rules.setup.allianceReputationMin}
          disabled={!myTurn || submitting}
          onPropose={(targetId) => void submit(matchAction.proposeAlliance(view, targetId))}
          onAccept={(proposerId) => void submit(matchAction.acceptAlliance(view, proposerId))}
          onLeave={(otherId) => void submit(matchAction.leaveAlliance(view, otherId))}
          onClose={() => setDiplomacyOpen(false)}
        />
      )}

      {chatOpen && (
        <MatchChatPanel
          config={config}
          session={session}
          matchId={matchId}
          transport={chatTransport}
          hasAlliance={hasAlliance}
          viewerSeat={live.seat}
          seatName={seatName}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  )
}
