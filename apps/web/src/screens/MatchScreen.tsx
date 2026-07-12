import type {
  Action,
  BattleReport,
  BoardCommand,
  EncounterChoice,
  EncounterKind,
  PlayerView,
  TacticId,
} from '@aop/engine'
import { FACTIONS } from '@aop/content'
import type { Coord } from '@aop/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AdSlot } from '../AdSlot'
import { impactFeedback, shipMoveFeedback, tapFeedback } from '../audio/feedback'
import { useAuth } from '../auth'
import { resolveSupabaseConfig } from '../auth/config'
import { BattleBoardSheet } from '../BattleBoardSheet'
import { BottomSheet } from '../components/BottomSheet'
import { DiplomacyPanel } from '../components/DiplomacyPanel'
import { MatchChatPanel } from '../components/MatchChatPanel'
import { Spinner } from '../components/Spinner'
import { CityScreen } from '../CityScreen'
import { MapCanvas } from '../MapCanvas'
import { submitApproachAndEngage } from '../multiplayer/approachAndEngage'
import { browserResyncTransport } from '../multiplayer/browserTransports'
import {
  applyOptimisticMove,
  canAttackAfterApproach,
  captainFromView,
  cityFromView,
  interpretTileClick,
  matchAction,
  ownCaptains,
} from '../multiplayer/matchActions'
import { MatchActionClient, MatchActionError } from '../multiplayer/matchActionClient'
import { BattleSessionClient, type BattleSessionOutcome } from '../multiplayer/battleSessionClient'
import { BattleSessionFlow } from '../multiplayer/battleSessionFlow'
import { boardFromPlayerView } from '../multiplayer/playerViewBoard'
import { classifyRangeOverlay } from '../shipRange'
import { TacticalRoundSheet } from '../TacticalRoundSheet'
import { BoardingCommandSheet } from '../BoardingCommandSheet'
import {
  createMatchRealtimeTransport,
  supabaseRealtimeClient,
  type MatchRealtimeTransport,
} from '../multiplayer/realtimeTransport'
import { subscribeReconnectSync } from '../multiplayer/reconnectSync'
import { SpectateClient, SpectateError } from '../multiplayer/spectateClient'
import { subscribeSpectatePoll } from '../multiplayer/spectatePoll'
import { submitActionWithRetry } from '../multiplayer/submitWithRetry'
import { subscribeTurnSync } from '../multiplayer/turnSync'
import {
  detectTurnTransition,
  formatCountdown,
  isViewerTurn,
  turnCountdown,
} from '../multiplayer/turnTimer'
import { ResourceHud } from '../ResourceHud'
import { UI_ICON } from '../uiIcons'

/** Slow safety-net poll behind the Realtime turn pokes (#260): catches a match
 * whose channel never connects (e.g. Realtime unavailable) at a cadence too
 * lazy to matter when pokes are flowing. */
const POLL_INTERVAL_MS = 30_000
/** Trailing debounce collapsing a burst of turn pokes into one refetch (#228's
 * refetch-storm note); any refetch resyncs wholesale, so only the last matters. */
const POKE_DEBOUNCE_MS = 250
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
 * The live multiplayer match screen (#261, building on #243's modules): the
 * fog-locked `PlayerView` board with the full action surface — captain
 * select/move, attack, encounters, city build/recruit, diplomacy, chat, end
 * turn, resign — every action proposed through `submit-action` and
 * re-validated server-side (§5.4). The screen never holds a `GameState`;
 * every intent is derived from the view by `matchActions.ts` and every
 * response replaces the view wholesale (§13 — no diff-patching).
 *
 * #285 follow-ups this screen now covers: the attack response's `battleReport`
 * is rendered through `BattleBoardSheet`; a boarding attacker with no live RNG
 * to probe (single-player's #93 picker) gets a say in the melee by
 * pre-committing a board doctrine via `CityScreen`'s standing-orders panel,
 * which the reducer now falls back to (`reducer.ts` attackCaptain); moves
 * apply an optimistic local patch before the round trip; and a stale
 * (`SEQ_CONFLICT`/`NOT_YOUR_TURN`) rejection retries the same action once
 * against a fresh view instead of dropping it (`submitWithRetry.ts`).
 */
export function MatchScreen({ matchId, onBack }: MatchScreenProps) {
  const auth = useAuth()

  const [live, setLive] = useState<LiveMatch | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedCaptainId, setSelectedCaptainId] = useState<string | null>(null)
  const [attackTargetId, setAttackTargetId] = useState<string | null>(null)
  // The approach leg (#414) recorded when `attackTargetId` was set for a
  // non-adjacent-but-reachable-this-turn target; `null` for an already
  // adjacent attack, which needs no approach move first.
  const [pendingApproach, setPendingApproach] = useState<Coord[] | null>(null)
  const [encounterId, setEncounterId] = useState<string | null>(null)
  const [openCityId, setOpenCityId] = useState<string | null>(null)
  const [diplomacyOpen, setDiplomacyOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [confirmingResign, setConfirmingResign] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  // Structured result of the viewer's own last attack (#285), for the battle
  // report sheet — derived output, never part of the polled view.
  const [battleReport, setBattleReport] = useState<BattleReport | null>(null)
  // Interactive-combat session (#408/#409, docs/design/multiplayer-tactical-probe.md): the
  // driver holds the running per-side CAS counters; `battleOutcome` is the engine context to
  // render (a naval round or a melee activation), null when no battle is being played out.
  const [battleFlow, setBattleFlow] = useState<BattleSessionFlow | null>(null)
  const [battleOutcome, setBattleOutcome] = useState<BattleSessionOutcome | null>(null)
  const [battleBusy, setBattleBusy] = useState(false)
  // The live `match:{id}` Realtime transport (#260) — also handed to the chat
  // panel so incoming-message pokes arrive without polling.
  const [transport, setTransport] = useState<MatchRealtimeTransport | null>(null)

  const pokeTimerRef = useRef<number | null>(null)
  const prevViewRef = useRef<PlayerView | null>(null)
  // Whether any view has ever loaded — ref, not state, because `refetch` is
  // captured once by the mount effect and must not read a stale `live`.
  const hasLoadedRef = useRef(false)
  // One-shot guard for the resume-on-reconnect battle-context probe (#409).
  const battleResumedRef = useRef(false)

  const config = resolveSupabaseConfig()
  const session = auth.state.status === 'authenticated' ? auth.state.session : null

  // Returns the freshly-fetched `{ seq, view }` so a caller that needs it
  // synchronously (the SEQ_CONFLICT retry in `submit`, below) doesn't have to
  // read back through `live` state, which a just-issued `setLive` here hasn't
  // committed yet within the same tick.
  async function fetchLive(): Promise<{ seq: number; view: PlayerView } | null> {
    if (!session || !config) return null
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
      return { seq: result.seq, view: result.view }
    } catch (err) {
      // Transient refetch failures keep the last-known view (the next poll
      // retries); losing the seat or the match ends the session outright.
      if (err instanceof SpectateError && (err.code === 'FORBIDDEN' || err.code === 'NOT_FOUND')) {
        setLive(null)
        setLoadError(err.message)
      } else if (!hasLoadedRef.current) {
        setLoadError(err instanceof Error ? err.message : 'Could not load the match.')
      }
      return null
    }
  }

  async function refetch() {
    await fetchLive()
  }

  // Initial load + Realtime turn pokes (#260) + reconnect resync (§9) + the
  // slow safety-net poll. Turn pokes are debounced (a burst collapses into one
  // refetch); channel reconnect, network return, and tab-visibility return all
  // force an immediate refetch through subscribeReconnectSync.
  useEffect(() => {
    if (!session || !config) return
    void refetch()

    const rt = createMatchRealtimeTransport(supabaseRealtimeClient(config), session.accessToken)
    setTransport(rt)
    const debouncedRefetch = () => {
      if (pokeTimerRef.current !== null) return
      pokeTimerRef.current = window.setTimeout(() => {
        pokeTimerRef.current = null
        void refetch()
      }, POKE_DEBOUNCE_MS)
    }
    const stopTurnSync = subscribeTurnSync({ matchId, transport: rt, onTurn: debouncedRefetch })
    const stopPoll = subscribeSpectatePoll({ intervalMs: POLL_INTERVAL_MS, onTick: refetch })
    const stopResync = subscribeReconnectSync({
      transport: {
        ...browserResyncTransport(),
        onChannelStatusChange: (handler) => rt.onChannelStatusChange(handler),
      },
      onResync: refetch,
    })
    return () => {
      stopTurnSync()
      stopPoll()
      stopResync()
      if (pokeTimerRef.current !== null) {
        window.clearTimeout(pokeTimerRef.current)
        pokeTimerRef.current = null
      }
      setTransport(null)
      rt.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, auth.state.status])

  // A session refresh mid-match must reach the transport: private-channel
  // rejoins are RLS-checked against this JWT (#228).
  useEffect(() => {
    if (transport && session) transport.setAuth(session.accessToken)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken])

  // 1 Hz countdown tick — drives only the timer readout.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Resume-on-reconnect (#409): once, after the first view loads in a tactical match, ask
  // battle-context whether this seat has a battle in progress (a reload mid-fight, or a
  // pending session the BATTLE_PENDING guard would otherwise wedge behind). Only tactical
  // matches can hold a session, so non-tactical matches never make this call. The full
  // reconnect story (live defender pickup) is #422.
  useEffect(() => {
    if (!live || !session || !config || battleResumedRef.current) return
    if (live.view.rules.setup.battleResolution !== 'tactical') return
    battleResumedRef.current = true
    const flow = makeBattleFlow()
    flow
      .resume()
      .then((outcome) => {
        if (outcome.kind === 'awaitingTactic' || outcome.kind === 'awaitingCommand') {
          setBattleFlow(flow)
          setBattleOutcome(outcome)
        }
      })
      .catch((err) => {
        // Only the expected quiet cases are swallowed: no session in progress (MATCH_STATE)
        // or this seat isn't a participant (NOT_A_PARTICIPANT). Any OTHER failure (network,
        // server error) is a real problem — surface it through the same actionError UI every
        // other MatchScreen write path uses, rather than swallowing it invisibly (fail loud).
        const code = err instanceof MatchActionError ? err.code : undefined
        if (code === 'MATCH_STATE' || code === 'NOT_A_PARTICIPANT') return
        setActionError(
          err instanceof Error ? err.message : 'Could not check for a battle in progress.',
        )
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, session, config])

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

  async function submit(action: Action) {
    if (!session || !config || !live || submitting) return
    setActionError(null)
    setSubmitting(true)
    const client = new MatchActionClient(config)
    // §9 step 3 + #285 optimistic retry: a stale rejection (SEQ_CONFLICT /
    // NOT_YOUR_TURN) refetches and retries the same action once against the
    // fresh seq before giving up — a routine AI-auto-play bump between polls
    // shouldn't force the player to redo their tap. See submitWithRetry.ts.
    const outcome = await submitActionWithRetry(
      {
        submit: (expectedSeq, a) =>
          client.submitAction(session, { matchId, expectedSeq, action: a }),
        refetch: fetchLive,
      },
      live.seq,
      action,
    )
    setSubmitting(false)
    if (outcome.kind === 'ok') {
      setLive({ ...live, seq: outcome.result.seq, view: outcome.result.view })
      if (outcome.result.battleReport) setBattleReport(outcome.result.battleReport)
      // The response carries no turn_deadline; pick the fresh one up now
      // rather than waiting out the poll interval.
      void refetch()
    } else if (outcome.kind === 'stale') {
      setActionError('The board changed — refreshed.')
      setSelectedCaptainId(null)
    } else {
      const err = outcome.error
      setActionError(err instanceof Error ? err.message : 'The action was rejected.')
    }
  }

  // --- Interactive combat (#409): drive TacticalRoundSheet/BoardingCommandSheet from the
  // #408 battle-session endpoints. A `battleResolution: 'tactical'` attacker plays the fight
  // round by round; every other attack (and non-tactical matches) keeps today's one-shot
  // `submit()` path. rngState never reaches the client — each pick is one round trip that
  // returns the engine's own next decision context (BattleSessionFlow). The live interactive
  // DEFENDER seat, boarding-loss highlighting, and tactical-after-approach are #422.

  function makeBattleFlow(): BattleSessionFlow {
    const client = new BattleSessionClient(config!)
    return new BattleSessionFlow({
      open: (p) => client.open(session!, { matchId, ...p }),
      round: (p) => client.round(session!, { matchId, ...p }),
      auto: () => client.auto(session!, { matchId }),
      context: () => client.context(session!, { matchId }),
    })
  }

  function applyBattleOutcome(flow: BattleSessionFlow, outcome: BattleSessionOutcome): void {
    if (outcome.kind === 'resolved') {
      setBattleFlow(null)
      setBattleOutcome(null)
      setLive((l) => (l ? { ...l, seq: outcome.seq, view: outcome.view } : l))
      setBattleReport(outcome.battleReport)
      void refetch()
    } else if (outcome.kind === 'awaitingTactic' || outcome.kind === 'awaitingCommand') {
      setBattleFlow(flow)
      setBattleOutcome(outcome)
    }
    // 'recorded' is the defender-seat ack — the attacker driver never receives it.
  }

  function handleBattleError(err: unknown): void {
    // A stale session (SEQ_CONFLICT) means the battle already resolved/deleted server-side:
    // drop the local sheet and refetch. Every other failure keeps the sheet open so the
    // player can retry the pick or hit auto-fight (the session is still live server-side).
    if (err instanceof MatchActionError && err.isStale) {
      setBattleFlow(null)
      setBattleOutcome(null)
      setActionError('The board changed — refreshed.')
      void refetch()
      return
    }
    setActionError(err instanceof Error ? err.message : 'The battle order was rejected.')
  }

  async function runBattleStep(step: () => Promise<BattleSessionOutcome>): Promise<void> {
    if (battleBusy) return
    setBattleBusy(true)
    setActionError(null)
    try {
      const flow = battleFlow
      if (!flow) return
      applyBattleOutcome(flow, await step())
    } catch (err) {
      handleBattleError(err)
    } finally {
      setBattleBusy(false)
    }
  }

  async function startTacticalBattle(
    captainId: string,
    targetCaptainId: string,
    expectedSeq: number,
  ): Promise<void> {
    if (battleBusy) return
    setBattleBusy(true)
    setActionError(null)
    const flow = makeBattleFlow()
    try {
      applyBattleOutcome(flow, await flow.open(expectedSeq, captainId, targetCaptainId))
    } catch (err) {
      handleBattleError(err)
    } finally {
      setBattleBusy(false)
    }
  }

  async function autoFightBattle(): Promise<void> {
    if (!battleFlow || battleBusy) return
    setBattleBusy(true)
    setActionError(null)
    const flow = battleFlow
    try {
      const result = await flow.autoResolve()
      applyBattleOutcome(flow, { kind: 'resolved', ...result })
    } catch (err) {
      handleBattleError(err)
    } finally {
      setBattleBusy(false)
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
          <h1 className="game-title">
            <Spinner label="Loading match" /> Loading match…
          </h1>
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
  // Own cities widened to CityState, for the city screen's cycling arrows (#429).
  const myCities = view.cities
    .filter((c) => c.ownerId === view.viewerId)
    .map(cityFromView)
    .filter((c): c is NonNullable<ReturnType<typeof cityFromView>> => c !== null)
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
        setPendingApproach(null)
        break
      case 'openCity':
        tapFeedback()
        setOpenCityId(intent.cityId)
        break
      case 'move':
        shipMoveFeedback()
        // Optimistic local application (#285): move the sprite now rather
        // than waiting out the submit-action round trip — the authoritative
        // response (or a discard-on-conflict refetch) always replaces this
        // wholesale, so a wrong guess here only ever flickers back.
        setLive({
          ...live,
          view: applyOptimisticMove(view, board.map, selectedCaptain!.id, intent.to),
        })
        void submit(matchAction.move(view, selectedCaptain!.id, intent.to))
        break
      case 'attack':
        setAttackTargetId(intent.targetCaptainId)
        setPendingApproach(null)
        break
      case 'approachAndAttack':
        // Non-adjacent but reachable-and-attackable this turn (#414): opens
        // the same confirm sheet as an adjacent attack; the recorded
        // approach leg is sailed first when the player confirms.
        setAttackTargetId(intent.targetCaptainId)
        setPendingApproach(intent.approach)
        break
      case 'encounter':
        setEncounterId(intent.encounterId)
        break
      case 'setSailOrder':
        shipMoveFeedback()
        void submit(
          matchAction.setSailOrder(
            view,
            selectedCaptain!.id,
            intent.destination,
            intent.targetId && intent.targetKind
              ? { id: intent.targetId, kind: intent.targetKind }
              : undefined,
          ),
        )
        break
    }
  }

  function resumeSailOrder(captainId: string) {
    const order = myCaptains.find((c) => c.id === captainId)?.sailOrder
    if (!order) return
    tapFeedback()
    void submit(
      matchAction.setSailOrder(
        view,
        captainId,
        order.destination,
        order.targetId && order.targetKind
          ? { id: order.targetId, kind: order.targetKind }
          : undefined,
      ),
    )
  }

  function cancelSailOrder(captainId: string) {
    tapFeedback()
    void submit(matchAction.clearSailOrder(view, captainId))
  }

  // Movement-range shading (#371): same classification as single-player, but
  // over the fog-reconstructed board and the view's own visibility sets.
  const rangeOverlay = selectedCaptain
    ? classifyRangeOverlay({
        map: board.map,
        from: selectedCaptain.position,
        movementPoints: selectedCaptain.movementPoints ?? 0,
        hasTroops: (selectedCaptain.troops ?? []).reduce((sum, t) => sum + t.count, 0) > 0,
        enemies: view.captains
          .filter(
            (c) =>
              c.ownerId !== view.viewerId &&
              board.visibleKeys.has(`${c.position.x},${c.position.y}`),
          )
          .map((c) => c.position),
        enemyCities: view.cities
          .filter(
            (c) =>
              c.ownerId !== view.viewerId &&
              board.exploredKeys.has(`${c.position.x},${c.position.y}`),
          )
          .map((c) => c.position),
        encounters: view.encounters
          .filter((e) => e.active && board.visibleKeys.has(`${e.position.x},${e.position.y}`))
          .map((e) => e.position),
      })
    : undefined

  // Paused sail orders (#372): own ships halted on a new contact.
  const interruptedCaptains = myCaptains.filter((c) => c.sailOrder?.interrupted)

  function confirmAttack() {
    if (!selectedCaptain || !attackTarget) return
    impactFeedback()
    const captainId = selectedCaptain.id
    const targetCaptainId = attackTarget.id
    const approach = pendingApproach
    setAttackTargetId(null)
    setSelectedCaptainId(null)
    setPendingApproach(null)
    // Tactical mode (#305/#409): an adjacent attack is played out round by round through a
    // binding battle session instead of one-shot auto-resolution. Tactical-after-approach
    // stays on the auto path below for now (opening a session after a same-turn move is #422).
    if (!approach && view?.rules.setup.battleResolution === 'tactical' && live) {
      void startTacticalBattle(captainId, targetCaptainId, live.seq)
      return
    }
    if (!approach) {
      void submit(matchAction.attack(view, captainId, targetCaptainId))
      return
    }
    void submitApproachAndAttack(captainId, targetCaptainId, approach)
  }

  /**
   * Sail `approach`'s last leg, then attack — the multiplayer counterpart of
   * `GameScreen`'s `dispatchApproach` + `confirmAttack` (#414, finishing
   * #376's parity). `MatchScreen`'s plain `submit()` closes over `live.seq`
   * at call time, so two back-to-back `void submit()` calls would both race
   * the same pre-move seq; `submitApproachAndEngage` threads `seq`/`view`
   * explicitly between the two so the attack always targets the seq the move
   * actually produced. `buildFollowUp` re-checks legality against the fresh
   * post-move view — the round trip takes real time, during which fog or an
   * opposing action may have moved, sunk, or hidden the target — and skips
   * the attack rather than ever submitting one the engine would reject.
   */
  async function submitApproachAndAttack(
    captainId: string,
    targetCaptainId: string,
    approach: Coord[],
  ) {
    if (!session || !config || !live || submitting) return
    setActionError(null)
    setSubmitting(true)
    const client = new MatchActionClient(config)
    const deps = {
      submit: (expectedSeq: number, a: Action) =>
        client.submitAction(session, { matchId, expectedSeq, action: a }),
      refetch: fetchLive,
      buildFollowUp: (freshView: PlayerView) =>
        canAttackAfterApproach(
          freshView,
          boardFromPlayerView(freshView).map,
          captainId,
          targetCaptainId,
        )
          ? matchAction.attack(freshView, captainId, targetCaptainId)
          : null,
    }
    const moveAction = matchAction.move(view, captainId, approach.at(-1)!)
    const outcome = await submitApproachAndEngage(deps, live.seq, moveAction)
    setSubmitting(false)

    switch (outcome.kind) {
      case 'ok':
        setLive({ ...live, seq: outcome.followUp.seq, view: outcome.followUp.view })
        if (outcome.followUp.battleReport) setBattleReport(outcome.followUp.battleReport)
        void refetch()
        break
      case 'followUpSkipped':
        // The approach landed but the target is no longer a legal attack —
        // the ship has moved, so keep that; just don't send an attack the
        // engine would bounce.
        setLive({ ...live, seq: outcome.move.seq, view: outcome.move.view })
        setActionError(
          'The target moved out of reach — the approach completed, but the attack was cancelled.',
        )
        void refetch()
        break
      case 'followUpFailed':
        // A hard rejection (no internal retry) leaves `live` at the pre-move
        // snapshot for the move's own seq/view; a stale rejection already
        // refreshed `live` via the retry's own refetch, so it's left alone.
        if (outcome.outcome.kind === 'error') {
          setLive({ ...live, seq: outcome.move.seq, view: outcome.move.view })
        }
        setActionError(
          outcome.outcome.kind === 'error'
            ? outcome.outcome.error instanceof Error
              ? outcome.outcome.error.message
              : 'The attack was rejected.'
            : 'The board changed — refreshed.',
        )
        break
      case 'moveFailed':
        setActionError(
          outcome.outcome.kind === 'error'
            ? outcome.outcome.error instanceof Error
              ? outcome.outcome.error.message
              : 'The approach was rejected.'
            : 'The board changed — refreshed.',
        )
        break
    }
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
          parties={board.parties}
          encounters={board.encounters}
          viewerId={view.viewerId}
          visibleKeys={board.visibleKeys}
          exploredKeys={board.exploredKeys}
          selectedCaptainId={selectedCaptainId}
          onTileClick={handleTileClick}
          rangeOverlay={rangeOverlay}
          onSetCourse={(cell) => {
            if (!selectedCaptain) return
            shipMoveFeedback()
            void submit(matchAction.setSailOrder(view, selectedCaptain.id, cell))
          }}
          factionOf={board.factionOf}
        />
        {myTurn &&
          interruptedCaptains.map((cap) => (
            <div key={cap.id} className="sail-interrupt-banner" role="status">
              <span>{cap.name} halted: new contact sighted</span>
              <div className="button-group">
                <button type="button" className="secondary" onClick={() => resumeSailOrder(cap.id)}>
                  Resume
                </button>
                <button type="button" className="secondary" onClick={() => cancelSailOrder(cap.id)}>
                  Cancel
                </button>
              </div>
            </div>
          ))}
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
        !chatOpen &&
        !battleReport && <AdSlot placement="between-turns" />}

      {battleReport && (
        <BattleBoardSheet
          report={battleReport}
          playerName={(id) => view.players.find((p) => p.id === id)?.name ?? id}
          onClose={() => setBattleReport(null)}
        />
      )}

      {/* Interactive combat (#409): the naval round and the boarding activation, driven from
          the #408 session. Same engine views single-player's probe feeds these sheets — the
          `key` remounts each on a fresh context. Boarding-loss highlighting (the `losses`
          diff, §5) is #422; multiplayer shows the activation without the since-last-order
          delta for now. */}
      {battleOutcome?.kind === 'awaitingTactic' && (
        <TacticalRoundSheet
          key={`t${battleOutcome.ctx.round}`}
          ctx={battleOutcome.ctx}
          onChoose={(tactic: TacticId) =>
            void runBattleStep(() => battleFlow!.chooseTactic(tactic))
          }
          onAutoResolve={() => void autoFightBattle()}
        />
      )}

      {battleOutcome?.kind === 'awaitingCommand' && (
        <BoardingCommandSheet
          key={`b${battleOutcome.view.round}-${battleOutcome.view.stack.id}`}
          view={battleOutcome.view}
          losses={[]}
          onCommand={(command: BoardCommand) =>
            void runBattleStep(() => battleFlow!.command(command))
          }
          onAutoResolve={() => void autoFightBattle()}
        />
      )}

      {attackTarget && selectedCaptain && (
        <BottomSheet
          title={`Engage ${attackTarget.name}?`}
          onClose={() => {
            setAttackTargetId(null)
            setPendingApproach(null)
          }}
        >
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
          setup={view.rules.setup}
          round={view.round}
          playerName={(id) => view.players.find((p) => p.id === id)?.name ?? id}
          cities={myCities}
          onSelectCity={setOpenCityId}
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
          onRecruitCaptain={(captainId) =>
            void submit(matchAction.recruitCaptain(view, openCity.id, captainId))
          }
          onRansomCaptain={(captainId) => void submit(matchAction.ransomCaptain(view, captainId))}
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

      {chatOpen && transport && (
        <MatchChatPanel
          config={config}
          session={session}
          matchId={matchId}
          transport={transport}
          hasAlliance={hasAlliance}
          viewerSeat={live.seat}
          seatName={seatName}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  )
}
