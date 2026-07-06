import {
  captainToCombatant,
  createCombatStats,
  currentPlayer,
  estimateOdds,
  nextAiAction,
  pathCost,
  visibleState,
  type Action,
  type BattleReport,
  type BoardActivationView,
  type BoardCommand,
  type BoardOrder,
  type EncounterChoice,
  type EncounterKind,
  type GameState,
  type StandingOrder,
} from '@aop/engine'
import { FACTIONS } from '@aop/content'
import { chebyshevDistance } from '@aop/shared'
import { useEffect, useMemo, useState } from 'react'
import { AdSlot } from '../AdSlot'
import { BattleBoardSheet } from '../BattleBoardSheet'
import { BoardingCommandSheet } from '../BoardingCommandSheet'
import {
  probeBoardingBattle,
  stackLosses,
  type BoardingProbeOutcome,
  type StackLoss,
} from '../boardingPlanner'
import { MapCanvas } from '../MapCanvas'
import { ResourceHud } from '../ResourceHud'
import { CityScreen } from '../CityScreen'
import { SaveScreen } from '../SaveScreen'
import { BottomSheet } from '../components/BottomSheet'
import { useTheme } from '../theme/ThemeContext'
import { audioManager } from '../audio/audioManager'
import { DIALOGUE } from '../audio/dialogueClips'
import { useEncounterAudio } from '../audio/useEncounterAudio'
import { useBackgroundMusic } from '../audio/useBackgroundMusic'
import { selectGameplayMusicContext } from '../audio/musicClips'
import {
  coinFeedback,
  combatFeedback,
  impactFeedback,
  shipMoveFeedback,
  tapFeedback,
} from '../audio/feedback'
import { UI_ICON } from '../uiIcons'
import { ENCOUNTER_PORTRAIT } from '../encounterPortraits'

const BATTLE_TAUNT_KEY = 'battle-taunt'

/** How long an AI seat "thinks" between actions. Purely cosmetic pacing. */
const AI_STEP_MS = 250
const ODDS_TRIALS = 120

/**
 * An attack that reached the boarding melee, mid-command (#93). The action has
 * not been dispatched yet: the fight is simulated locally, one recorded command
 * per attacker activation, and dispatched with the full plan once it resolves.
 */
interface BoardingState {
  captainId: string
  targetCaptainId: string
  commands: BoardCommand[]
  view: BoardActivationView
  losses: StackLoss[]
}

interface GameScreenProps {
  game: GameState
  /** Structured result of the last combat, shown in the battle sheet (#39). */
  battleReport: BattleReport | null
  onDismissBattleReport: () => void
  onAction: (action: Action) => void
  onSaveSlot: (slotId: string) => Promise<void>
  /** Throws on failure (#237) — SaveScreen catches it and keeps its sheet open. */
  onLoadSlot: (slotId: string) => Promise<void>
  /** Opens the #146 replay viewer over a saved slot, without disturbing this game. */
  onWatchSlot: (slotId: string) => void
  /** True once autosave has failed and hasn't succeeded since (#237). */
  autosaveFailing: boolean
}

export function GameScreen({
  game,
  battleReport,
  onDismissBattleReport,
  onAction,
  onSaveSlot,
  onLoadSlot,
  onWatchSlot,
  autosaveFailing,
}: GameScreenProps) {
  const { factionName } = useTheme()
  const player = currentPlayer(game)
  // Fog and interaction are anchored to the human seat, so the view stays stable
  // while AI seats take their turns.
  const viewer = game.players.find((p) => !p.isAI) ?? game.players[0]!
  const isViewerTurn = player.id === viewer.id && !player.isAI

  const [confirmingResign, setConfirmingResign] = useState(false)
  const [selectedCaptainId, setSelectedCaptainId] = useState<string | null>(null)
  const [attackTargetId, setAttackTargetId] = useState<string | null>(null)
  const [encounterId, setEncounterId] = useState<string | null>(null)
  const [boarding, setBoarding] = useState<BoardingState | null>(null)
  const [cityOpen, setCityOpen] = useState(false)
  const [savesOpen, setSavesOpen] = useState(false)

  // Ambient during normal play, battle theme while a battle report or boarding
  // melee sheet is open.
  useBackgroundMusic(
    selectGameplayMusicContext({ battleReportOpen: !!battleReport, boardingOpen: !!boarding }),
  )

  // Combat-resolved feedback, once per battle report shown.
  useEffect(() => {
    if (battleReport) combatFeedback()
  }, [battleReport])

  // AI seats play themselves, one action per tick, so the main thread never
  // blocks. The same nextAiAction() runs unchanged in a worker or edge function.
  useEffect(() => {
    // Pause while the battle sheet is open so the player can read the report
    // before the AI plays on.
    if (game.status !== 'active' || !player.isAI || battleReport) return
    let cancelled = false
    const id = setTimeout(() => {
      if (cancelled) return
      onAction(nextAiAction(game, player.id))
    }, AI_STEP_MS)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [game, player, onAction, battleReport])

  const { visible, explored } = useMemo(() => visibleState(game, viewer.id), [game, viewer.id])
  const visibleKeys = useMemo(() => new Set(visible.map((c) => `${c.x},${c.y}`)), [visible])
  const exploredKeys = useMemo(() => new Set(explored.map((c) => `${c.x},${c.y}`)), [explored])

  const selectedCaptain = selectedCaptainId
    ? (game.captains.find((c) => c.id === selectedCaptainId) ?? null)
    : null
  const attackTarget = attackTargetId
    ? (game.captains.find((c) => c.id === attackTargetId) ?? null)
    : null
  const encounter = encounterId
    ? (game.encounters.find((e) => e.id === encounterId && e.active) ?? null)
    : null
  const encounterChoices = encounter
    ? Object.keys(game.config.content?.encounters?.[encounter.kind]?.choices ?? {})
    : []

  const isEncounterAudioPlaying = useEncounterAudio(encounterId, encounter?.kind)

  // Taunt bark when a target is lined up for battle (#28/#75); stops if the
  // player backs out without attacking.
  useEffect(() => {
    if (!attackTargetId) return
    audioManager.play(DIALOGUE.battleTaunt, { key: BATTLE_TAUNT_KEY })
    return () => audioManager.stop(BATTLE_TAUNT_KEY)
  }, [attackTargetId])

  const viewerCity = game.cities.find((c) => c.ownerId === viewer.id)
  const viewerCaptainAtCity = viewerCity
    ? game.captains.find(
        (c) => c.ownerId === viewer.id && chebyshevDistance(c.position, viewerCity.position) <= 1,
      )
    : undefined
  // Every captain the viewer owns, so the city sheet's fleet list (#114) can
  // break the army out one row per captain instead of just the docked one.
  const viewerCaptains = useMemo(
    () => game.captains.filter((c) => c.ownerId === viewer.id),
    [game.captains, viewer.id],
  )

  function factionOf(ownerId: string) {
    return game.players.find((p) => p.id === ownerId)!.faction
  }

  function handleTileClick(x: number, y: number) {
    if (!isViewerTurn || game.status !== 'active') return
    const ownHere = game.captains.find(
      (c) => c.ownerId === viewer.id && c.position.x === x && c.position.y === y,
    )
    if (ownHere) {
      setSelectedCaptainId(ownHere.id)
      setAttackTargetId(null)
      return
    }
    if (!selectedCaptain) return

    const enemyHere = game.captains.find(
      (c) => c.ownerId !== viewer.id && c.position.x === x && c.position.y === y,
    )
    if (enemyHere) {
      if (
        chebyshevDistance(selectedCaptain.position, enemyHere.position) <= 1 &&
        selectedCaptain.movementPoints >= 1
      ) {
        setAttackTargetId(enemyHere.id)
      }
      return
    }

    const encounterHere = game.encounters.find(
      (e) => e.active && e.position.x === x && e.position.y === y,
    )
    if (encounterHere) {
      if (
        chebyshevDistance(selectedCaptain.position, encounterHere.position) <= 1 &&
        selectedCaptain.movementPoints >= 1
      ) {
        setEncounterId(encounterHere.id)
      }
      return
    }

    // Empty tile: move there if it is reachable by sea within remaining movement.
    const cost = pathCost(game.map, selectedCaptain.position, { x, y })
    if (cost !== null && cost <= selectedCaptain.movementPoints) {
      shipMoveFeedback()
      onAction({
        type: 'moveCaptain',
        playerId: viewer.id,
        captainId: selectedCaptain.id,
        to: { x, y },
      })
    }
  }

  const odds = useMemo(() => {
    if (!selectedCaptain || !attackTarget || !game.config.combatStats) return null
    return estimateOdds(
      {
        attacker: captainToCombatant(selectedCaptain, game.config.content),
        defender: captainToCombatant(attackTarget, game.config.content),
      },
      createCombatStats(game.config.combatStats),
      game.actionCount,
      ODDS_TRIALS,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCaptain, attackTarget, game])

  /**
   * Launch the attack (#93). The battle is first simulated locally from the
   * current RNG state: if it reaches a boarding melee, the command sheet opens
   * and the player drives their stacks by hand; the action is dispatched with
   * the recorded plan once the fight resolves. A battle decided at sea (or a
   * pre-#39 match without battle tuning) dispatches immediately, unchanged —
   * the naval tactic rounds themselves stay auto-resolved for now. Committed
   * either way: the deterministic sim already revealed the naval outcome, so
   * there is no backing out once the probe has run.
   */
  function confirmAttack() {
    if (!selectedCaptain || !attackTarget) return
    impactFeedback()
    audioManager.play(DIALOGUE.battleCharge)
    const captainId = selectedCaptain.id
    const targetCaptainId = attackTarget.id
    setAttackTargetId(null)
    setSelectedCaptainId(null)

    let probe: BoardingProbeOutcome | null = null
    try {
      probe = probeBoardingBattle(game, { captainId, targetCaptainId }, [])
    } catch (err) {
      // Fail-safe: a broken local simulation must never block the attack —
      // dispatch without a plan and let the board AI fight the melee.
      console.error('Boarding simulation failed; falling back to auto-resolve', err)
    }
    if (probe?.kind === 'awaitingCommand') {
      setBoarding({ captainId, targetCaptainId, commands: [], view: probe.view, losses: [] })
      return
    }
    onAction({ type: 'attackCaptain', playerId: viewer.id, captainId, targetCaptainId })
  }

  /** Dispatch the boarding attack with every command recorded so far; the board AI finishes any remainder. */
  function dispatchBoarding(current: BoardingState, commands: BoardCommand[]) {
    setBoarding(null)
    onAction({
      type: 'attackCaptain',
      playerId: viewer.id,
      captainId: current.captainId,
      targetCaptainId: current.targetCaptainId,
      ...(commands.length > 0 ? { boardCommands: commands } : {}),
    })
  }

  /** One confirmed activation order: extend the plan and re-probe for the next activation. */
  function orderBoardingCommand(command: BoardCommand) {
    if (!boarding) return
    const commands = [...boarding.commands, command]
    let probe: BoardingProbeOutcome | null = null
    try {
      probe = probeBoardingBattle(
        game,
        { captainId: boarding.captainId, targetCaptainId: boarding.targetCaptainId },
        commands,
      )
    } catch (err) {
      console.error('Boarding simulation failed mid-melee; auto-resolving the rest', err)
    }
    if (probe?.kind === 'awaitingCommand') {
      setBoarding({
        ...boarding,
        commands,
        view: probe.view,
        losses: stackLosses(boarding.view, probe.view),
      })
      return
    }
    // Resolved (or the sim failed): submit the recorded plan — the engine
    // re-derives the identical fight from the action log.
    dispatchBoarding(boarding, commands)
  }

  /** Resolution bark for the encounter sheet closing (#75); kind/choice-dependent. */
  function playEncounterResolutionBark(kind: EncounterKind, choice: string) {
    if (kind === 'merchant') audioManager.play(DIALOGUE.merchantFarewell)
    else if (kind === 'natives' && choice === 'fight') audioManager.play(DIALOGUE.battleCharge)
    else if (kind === 'natives' && choice === 'trade') audioManager.play(DIALOGUE.nativeTrade)
    else if (kind === 'settlers') audioManager.play(DIALOGUE.settlerGratitude)
  }

  function resolveEncounter(choice: string) {
    if (!selectedCaptain || !encounter) return
    impactFeedback()
    const reward =
      game.config.content?.encounters?.[encounter.kind]?.choices?.[choice as EncounterChoice]
        ?.reward
    if (reward?.gold) coinFeedback()
    playEncounterResolutionBark(encounter.kind, choice)
    onAction({
      type: 'resolveEncounter',
      playerId: viewer.id,
      captainId: selectedCaptain.id,
      encounterId: encounter.id,
      choice: choice as EncounterChoice,
    })
    setEncounterId(null)
    setSelectedCaptainId(null)
  }

  function endTurn() {
    tapFeedback()
    setSelectedCaptainId(null)
    onAction({ type: 'endTurn', playerId: player.id })
  }

  function resign() {
    impactFeedback()
    onAction({ type: 'resign', playerId: player.id })
    setConfirmingResign(false)
  }

  const cityCallbacks = viewerCity && {
    onBuild: (buildingId: string) =>
      onAction({ type: 'construct', playerId: viewer.id, cityId: viewerCity.id, buildingId }),
    onRecruit: (unitId: string) =>
      onAction({ type: 'recruit', playerId: viewer.id, cityId: viewerCity.id, unitId, count: 1 }),
    onTransfer: (direction: 'toShip' | 'toGarrison', unitId: string) => {
      if (!viewerCaptainAtCity) return
      onAction({
        type: 'transferTroops',
        playerId: viewer.id,
        cityId: viewerCity.id,
        captainId: viewerCaptainAtCity.id,
        direction,
        unitId,
        count: 1,
      })
    },
    onSetStandingOrders: (orders: StandingOrder[]) => {
      if (!viewerCaptainAtCity) return
      onAction({
        type: 'setStandingOrders',
        playerId: viewer.id,
        captainId: viewerCaptainAtCity.id,
        orders,
      })
    },
    onSetBoardOrders: (boardOrders: BoardOrder[]) => {
      if (!viewerCaptainAtCity) return
      // Board doctrine rides the same action; naval orders are re-sent as-is.
      onAction({
        type: 'setStandingOrders',
        playerId: viewer.id,
        captainId: viewerCaptainAtCity.id,
        orders: viewerCaptainAtCity.standingOrders ?? [],
        boardOrders,
      })
    },
    onChooseCaptainSkill: (skillId: string) => {
      if (!viewerCaptainAtCity) return
      onAction({
        type: 'chooseCaptainSkill',
        playerId: viewer.id,
        captainId: viewerCaptainAtCity.id,
        skillId,
      })
    },
    onUpgradeShip: (track: string) => {
      if (!viewerCaptainAtCity) return
      onAction({
        type: 'upgradeShip',
        playerId: viewer.id,
        cityId: viewerCity.id,
        captainId: viewerCaptainAtCity.id,
        track,
      })
    },
  }

  return (
    <div className="game-screen-container">
      <header className="hud">
        <h1>Age of Plunder</h1>
        <span className="turn-info">
          Round {game.round} — {player.name} (
          {factionName(player.faction, FACTIONS[player.faction].name)})
        </span>
        <ResourceHud resources={viewer.resources} />
      </header>

      {/* Persistent until the next successful autosave (#237) — a long game
          is exactly when hitting storage quota costs the most. */}
      {autosaveFailing && (
        <div className="autosave-failing-banner" role="status">
          Autosave failing — free up storage or save to a slot manually.
        </div>
      )}

      <div className="map-container">
        <MapCanvas
          map={game.map}
          captains={game.captains}
          cities={game.cities}
          encounters={game.encounters}
          viewerId={viewer.id}
          visibleKeys={visibleKeys}
          exploredKeys={exploredKeys}
          selectedCaptainId={selectedCaptainId}
          onTileClick={handleTileClick}
          factionOf={factionOf}
        />
      </div>

      {/* Primary actions live in a bottom bar, not the header, so they sit in
          the thumb-reach zone on one-handed phone use (#27). */}
      <div className="bottom-action-bar">
        <div className="button-group">
          <button
            className="secondary"
            onClick={() => {
              tapFeedback()
              setCityOpen(true)
            }}
            disabled={!isViewerTurn}
          >
            City
          </button>
          <button
            className="secondary"
            onClick={() => {
              tapFeedback()
              setSavesOpen(true)
            }}
          >
            Saves
          </button>
          <button className="primary" onClick={endTurn} disabled={player.isAI}>
            {UI_ICON.endTurn && (
              <img className="button-icon" src={UI_ICON.endTurn} alt="" aria-hidden />
            )}
            {player.isAI ? 'AI thinking…' : 'End Turn'}
          </button>
          {!confirmingResign ? (
            <button
              className="secondary"
              onClick={() => setConfirmingResign(true)}
              disabled={player.isAI}
            >
              Resign
            </button>
          ) : (
            <>
              <button className="danger" onClick={resign} disabled={player.isAI}>
                Confirm Resign
              </button>
              <button className="secondary" onClick={() => setConfirmingResign(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Between-turns placement only (docs/ARCHITECTURE.md §9): no attack/encounter
          sheet or building modal is open, and it's never the viewer's turn to act. */}
      {!isViewerTurn && !attackTarget && !encounter && !cityOpen && !savesOpen && (
        <AdSlot placement="between-turns" />
      )}

      {boarding && (
        <BoardingCommandSheet
          key={boarding.commands.length}
          view={boarding.view}
          losses={boarding.losses}
          onCommand={orderBoardingCommand}
          onAutoResolve={() => dispatchBoarding(boarding, boarding.commands)}
        />
      )}

      {battleReport && (
        <BattleBoardSheet
          report={battleReport}
          playerName={(id) => game.players.find((p) => p.id === id)?.name ?? id}
          onClose={onDismissBattleReport}
        />
      )}

      {attackTarget && odds && selectedCaptain && (
        <BottomSheet title={`Engage ${attackTarget.name}?`} onClose={() => setAttackTargetId(null)}>
          <section className="battle-intro">
            <div className="battle-intro__side">
              {FACTIONS[factionOf(selectedCaptain.ownerId)].captainPortraitUrl && (
                <img
                  className="battle-intro__portrait"
                  src={FACTIONS[factionOf(selectedCaptain.ownerId)].captainPortraitUrl}
                  alt=""
                  aria-hidden
                />
              )}
              <span>{selectedCaptain.name}</span>
            </div>
            <span className="battle-intro__vs">VS</span>
            <div className="battle-intro__side">
              {FACTIONS[factionOf(attackTarget.ownerId)].captainPortraitUrl && (
                <img
                  className="battle-intro__portrait"
                  src={FACTIONS[factionOf(attackTarget.ownerId)].captainPortraitUrl}
                  alt=""
                  aria-hidden
                />
              )}
              <span>{attackTarget.name}</span>
            </div>
          </section>
          <section>
            <p className="building-option__hint">
              You win {Math.round(odds.attackerWinProbability * 100)}% · They win{' '}
              {Math.round(odds.defenderWinProbability * 100)}% · A side breaks off{' '}
              {Math.round(odds.escapeProbability * 100)}% ({odds.trials}-battle estimate)
            </p>
            <button className="primary" onClick={confirmAttack}>
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
            <>
              {encounter.kind === 'merchant'
                ? 'A merchant ship hails you'
                : encounter.kind === 'natives'
                  ? 'A native village on the shore'
                  : 'A band of settlers adrift'}
              {isEncounterAudioPlaying && (
                <span className="encounter-audio-indicator"> · Playing…</span>
              )}
            </>
          }
          onClose={() => setEncounterId(null)}
        >
          <img
            className="encounter-portrait"
            src={ENCOUNTER_PORTRAIT[encounter.kind]}
            alt=""
            aria-hidden
          />
          <section className="button-group">
            {encounterChoices.map((choice) => (
              <button key={choice} className="secondary" onClick={() => resolveEncounter(choice)}>
                {choice[0]!.toUpperCase() + choice.slice(1)}
              </button>
            ))}
          </section>
        </BottomSheet>
      )}

      {cityOpen && viewerCity && cityCallbacks && (
        <CityScreen
          city={viewerCity}
          captain={viewerCaptainAtCity}
          captains={viewerCaptains}
          faction={viewer.faction}
          resources={viewer.resources}
          onClose={() => setCityOpen(false)}
          {...cityCallbacks}
        />
      )}

      {savesOpen && (
        <SaveScreen
          onClose={() => setSavesOpen(false)}
          onSave={onSaveSlot}
          onLoad={async (slotId) => {
            // #237: only close the sheet on success — SaveScreen's own
            // try/catch keeps it open (with a message) if onLoadSlot throws.
            await onLoadSlot(slotId)
            setSavesOpen(false)
          }}
          onWatch={(slotId) => {
            setSavesOpen(false)
            onWatchSlot(slotId)
          }}
        />
      )}
    </div>
  )
}
