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
import { MapCanvas } from '../MapCanvas'
import { ResourceHud } from '../ResourceHud'
import { CityScreen } from '../CityScreen'
import { SaveScreen } from '../SaveScreen'
import { BottomSheet } from '../components/BottomSheet'
import { useTheme } from '../theme/ThemeContext'
import { audioManager } from '../audio/audioManager'
import { DIALOGUE } from '../audio/dialogueClips'
import { useEncounterAudio } from '../audio/useEncounterAudio'
import { hapticImpact, hapticTap } from '../haptics'
import { UI_ICON } from '../uiIcons'
import { ENCOUNTER_PORTRAIT } from '../encounterPortraits'

const BATTLE_TAUNT_KEY = 'battle-taunt'

/** How long an AI seat "thinks" between actions. Purely cosmetic pacing. */
const AI_STEP_MS = 250
const ODDS_TRIALS = 120

interface GameScreenProps {
  game: GameState
  /** Structured result of the last combat, shown in the battle sheet (#39). */
  battleReport: BattleReport | null
  onDismissBattleReport: () => void
  onAction: (action: Action) => void
  onSaveSlot: (slotId: string) => Promise<void>
  onLoadSlot: (slotId: string) => void
  /** Opens the #146 replay viewer over a saved slot, without disturbing this game. */
  onWatchSlot: (slotId: string) => void
}

export function GameScreen({
  game,
  battleReport,
  onDismissBattleReport,
  onAction,
  onSaveSlot,
  onLoadSlot,
  onWatchSlot,
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
  const [cityOpen, setCityOpen] = useState(false)
  const [savesOpen, setSavesOpen] = useState(false)

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
        attacker: captainToCombatant(
          selectedCaptain,
          factionOf(selectedCaptain.ownerId),
          game.config.content,
        ),
        defender: captainToCombatant(
          attackTarget,
          factionOf(attackTarget.ownerId),
          game.config.content,
        ),
      },
      createCombatStats(game.config.combatStats),
      game.actionCount,
      ODDS_TRIALS,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCaptain, attackTarget, game])

  function confirmAttack() {
    if (!selectedCaptain || !attackTarget) return
    hapticImpact()
    audioManager.play(DIALOGUE.battleCharge)
    onAction({
      type: 'attackCaptain',
      playerId: viewer.id,
      captainId: selectedCaptain.id,
      targetCaptainId: attackTarget.id,
    })
    setAttackTargetId(null)
    setSelectedCaptainId(null)
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
    hapticImpact()
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
    hapticTap()
    setSelectedCaptainId(null)
    onAction({ type: 'endTurn', playerId: player.id })
  }

  function resign() {
    hapticImpact()
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
              hapticTap()
              setCityOpen(true)
            }}
            disabled={!isViewerTurn}
          >
            City
          </button>
          <button
            className="secondary"
            onClick={() => {
              hapticTap()
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
          onLoad={(slotId) => {
            setSavesOpen(false)
            onLoadSlot(slotId)
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
