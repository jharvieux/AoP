import {
  captainToCombatant,
  cityToCombatant,
  combatantStrength,
  createCombatStats,
  currentPlayer,
  estimateOdds,
  findLandPath,
  mapDistance,
  nextAiAction,
  partyToCombatant,
  pathCost,
  tileAt,
  tileIndex,
  visibleState,
  type Action,
  type BattleReport,
  type BoardActivationView,
  type BoardCommand,
  type BoardOrder,
  type EncounterChoice,
  type EncounterKind,
  type GameState,
  type LandingParty,
  type StandingOrder,
  type TacticContext,
  type TacticId,
} from '@aop/engine'
import { FACTIONS } from '@aop/content'
import { canAfford, type Coord } from '@aop/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdSlot } from '../AdSlot'
import { findApproachPath } from '../approach'
import { classifyRangeOverlay, type RangeOverlay } from '../shipRange'
import { BattleBoardSheet } from '../BattleBoardSheet'
import { BoardingCommandSheet } from '../BoardingCommandSheet'
import {
  probeBoardingBattle,
  probeCityAssault,
  probeTacticalBattle,
  stackLosses,
  type BoardingProbeOutcome,
  type StackLoss,
  type TacticalProbeOutcome,
} from '../boardingPlanner'
import { MapCanvas, type MapControls } from '../MapCanvas'
import { ResourceHud } from '../ResourceHud'
import { CityScreen } from '../CityScreen'
import { SaveScreen } from '../SaveScreen'
import { TacticalRoundSheet } from '../TacticalRoundSheet'
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
 * `gunneryOrders` carries whatever naval-round tactics Tactical mode (#305)
 * already recorded before the melee started — empty when the boarding follows
 * an auto-resolved gunnery duel.
 */
interface BoardingState {
  captainId: string
  targetCaptainId: string
  gunneryOrders: TacticId[]
  commands: BoardCommand[]
  view: BoardActivationView
  losses: StackLoss[]
}

/**
 * A city assault (#344) that reached the land melee, mid-command. Like
 * {@link BoardingState} but the target is a city, so there is no naval gunnery
 * phase — the embarked troops fight the garrison on the land board directly.
 * Dispatched as an `attackCity` action with the recorded `boardCommands` once
 * the probe resolves.
 */
interface AssaultBoardingState {
  captainId: string
  targetCityId: string
  commands: BoardCommand[]
  view: BoardActivationView
  losses: StackLoss[]
}

/**
 * An attack being fought round-by-round in Tactical mode (#305), still ahead
 * of the boarding melee (if any). `ctx` is the engine's own `TacticContext`
 * for the next undecided round, from the live probe; picking a tactic
 * extends `gunneryOrders` and re-probes for the round after.
 */
interface TacticalRoundState {
  captainId: string
  targetCaptainId: string
  gunneryOrders: TacticId[]
  ctx: TacticContext
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

/**
 * The viewer's own captain docked at (adjacent to) a given city, if any — gates
 * recruit/load-troops/unload-troops/standing-order actions. Extracted as a pure
 * function so `mapDistance` topology-awareness (#385, same hex-distance-2 bug as
 * #370) is unit-testable without rendering the component.
 */
export function findViewerCaptainAtCity(
  captains: GameState['captains'],
  map: GameState['map'],
  viewerId: string,
  cityPosition: Coord,
): GameState['captains'][number] | undefined {
  return captains.find(
    (c) => c.ownerId === viewerId && mapDistance(map, c.position, cityPosition) <= 1,
  )
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
  const { factionName, unitName } = useTheme()
  const player = currentPlayer(game)
  // Fog and interaction are anchored to the human seat, so the view stays stable
  // while AI seats take their turns.
  const viewer = game.players.find((p) => !p.isAI) ?? game.players[0]!
  const isViewerTurn = player.id === viewer.id && !player.isAI

  const [confirmingResign, setConfirmingResign] = useState(false)
  const [selectedCaptainId, setSelectedCaptainId] = useState<string | null>(null)
  const [attackTargetId, setAttackTargetId] = useState<string | null>(null)
  const [encounterId, setEncounterId] = useState<string | null>(null)
  // Naval targeting (#376): when a target was engaged from beyond adjacency,
  // the approach leg the selected captain must sail first — `findApproachPath`'s
  // full inclusive path, or `null` when already adjacent (no leg needed). Set
  // alongside whichever of attackTargetId/assaultCityId/encounterId opened the
  // confirm sheet, and consumed by that sheet's confirm handler (a `moveCaptain`
  // dispatched just before the attack/assault/encounter action).
  const [pendingApproach, setPendingApproach] = useState<Coord[] | null>(null)
  const [boarding, setBoarding] = useState<BoardingState | null>(null)
  const [tacticalRound, setTacticalRound] = useState<TacticalRoundState | null>(null)
  // Enemy-city assault (#344): the city awaiting the assault-confirm sheet, the
  // in-progress land melee, and the read-only enemy-city info view.
  const [assaultCityId, setAssaultCityId] = useState<string | null>(null)
  const [assaultBoarding, setAssaultBoarding] = useState<AssaultBoardingState | null>(null)
  const [enemyCityInfoId, setEnemyCityInfoId] = useState<string | null>(null)
  // Landing parties (#465): the selected party, the disembark sheet (target
  // tile + per-unit counts, defaulting to everything aboard), and the pending
  // party-attack / land-assault confirm sheets.
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null)
  const [disembarkTile, setDisembarkTile] = useState<Coord | null>(null)
  const [disembarkCounts, setDisembarkCounts] = useState<Record<string, number>>({})
  const [partyAttackTargetId, setPartyAttackTargetId] = useState<string | null>(null)
  const [partyAssaultCityId, setPartyAssaultCityId] = useState<string | null>(null)
  // Land encounter (#466) a selected party is about to resolve.
  const [landEncounterId, setLandEncounterId] = useState<string | null>(null)
  const [cityOpen, setCityOpen] = useState(false)
  const [savesOpen, setSavesOpen] = useState(false)
  // The city the roster/City button currently targets (#373). Null falls back to
  // the first owned city, preserving single-city behavior with zero footprint.
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)
  // Live map camera controls (#346) so the city roster can recenter the map.
  const mapControlsRef = useRef<MapControls | null>(null)

  // Ambient during normal play, battle theme while a battle report, boarding
  // melee, or Tactical-mode round sheet is open.
  useBackgroundMusic(
    selectGameplayMusicContext({
      battleReportOpen: !!battleReport,
      boardingOpen: !!boarding || !!tacticalRound || !!assaultBoarding,
    }),
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

  // Turn-event feed (#346): a lightweight "what happened" log so activity
  // outside the viewport (AI moves, captures, new sightings) is ascertainable.
  // Derived entirely from observable state diffs — no new engine state.
  const [eventFeed, setEventFeed] = useState<{ id: number; text: string }[]>([])
  const feedSeqRef = useRef(0)
  const pushEvent = useCallback((text: string) => {
    setEventFeed((feed) => [{ id: feedSeqRef.current++, text }, ...feed].slice(0, 6))
  }, [])
  const prevSnapshotRef = useRef<{
    round: number
    sighted: Set<string>
    cityOwners: Record<string, string>
  } | null>(null)

  useEffect(() => {
    const sighted = new Set(
      game.captains
        .filter(
          (c) => c.ownerId !== viewer.id && visibleKeys.has(`${c.position.x},${c.position.y}`),
        )
        .map((c) => c.id),
    )
    const cityOwners: Record<string, string> = {}
    for (const c of game.cities) cityOwners[c.id] = c.ownerId
    const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? id

    const prev = prevSnapshotRef.current
    if (prev) {
      if (game.round > prev.round) pushEvent(`Round ${game.round} begins`)
      for (const id of sighted) {
        if (!prev.sighted.has(id)) {
          const cap = game.captains.find((c) => c.id === id)
          if (cap) pushEvent(`Enemy fleet sighted at ${cap.position.x},${cap.position.y}`)
        }
      }
      for (const c of game.cities) {
        const was = prev.cityOwners[c.id]
        if (was && was !== c.ownerId) pushEvent(`${c.name} captured by ${nameOf(c.ownerId)}`)
      }
    }
    prevSnapshotRef.current = { round: game.round, sighted, cityOwners }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, visibleKeys, viewer.id, pushEvent])

  useEffect(() => {
    if (!battleReport) return
    const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? id
    pushEvent(
      battleReport.escapedId
        ? `${nameOf(battleReport.escapedId)} broke off the battle`
        : `${nameOf(battleReport.winnerId)} defeated ${nameOf(battleReport.loserId)}`,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleReport])

  const selectedCaptain = selectedCaptainId
    ? (game.captains.find((c) => c.id === selectedCaptainId) ?? null)
    : null
  const selectedParty = selectedPartyId
    ? (game.parties.find((p) => p.id === selectedPartyId) ?? null)
    : null
  const partyAttackTarget = partyAttackTargetId
    ? (game.parties.find((p) => p.id === partyAttackTargetId) ?? null)
    : null
  const partyAssaultCity = partyAssaultCityId
    ? (game.cities.find((c) => c.id === partyAssaultCityId) ?? null)
    : null
  const attackTarget = attackTargetId
    ? (game.captains.find((c) => c.id === attackTargetId) ?? null)
    : null
  const assaultCity = assaultCityId
    ? (game.cities.find((c) => c.id === assaultCityId) ?? null)
    : null
  const enemyCityInfo = enemyCityInfoId
    ? (game.cities.find((c) => c.id === enemyCityInfoId) ?? null)
    : null
  const encounter = encounterId
    ? (game.encounters.find((e) => e.id === encounterId && e.active) ?? null)
    : null
  const encounterChoices = encounter
    ? Object.keys(game.config.content?.encounters?.[encounter.kind]?.choices ?? {})
    : []
  const landEncounter = landEncounterId
    ? (game.landEncounters.find((e) => e.id === landEncounterId && e.active) ?? null)
    : null
  const landEncounterChoices = landEncounter
    ? Object.keys(game.config.content?.landEncounters?.[landEncounter.kind]?.choices ?? {})
    : []

  const isEncounterAudioPlaying = useEncounterAudio(encounterId, encounter?.kind)

  // Taunt bark when a target is lined up for battle (#28/#75); stops if the
  // player backs out without attacking.
  useEffect(() => {
    if (!attackTargetId) return
    audioManager.play(DIALOGUE.battleTaunt, { key: BATTLE_TAUNT_KEY })
    return () => audioManager.stop(BATTLE_TAUNT_KEY)
  }, [attackTargetId])

  // Every city the viewer owns (#373) — the engine has always allowed more than
  // one; the HUD roster and city sheet now honor that instead of always acting
  // on whichever city sorts first.
  const viewerCities = useMemo(
    () => game.cities.filter((c) => c.ownerId === viewer.id),
    [game.cities, viewer.id],
  )
  const viewerCity =
    viewerCities.find((c) => c.id === selectedCityId) ?? viewerCities[0] ?? undefined
  const viewerCaptainAtCity = viewerCity
    ? findViewerCaptainAtCity(game.captains, game.map, viewer.id, viewerCity.position)
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

  /**
   * Naval targeting (#376): can `selectedCaptain` engage `targetPos` *this
   * turn*, from any distance? Already-adjacent is just the zero-cost case of
   * the same approach-path query (`findApproachPath` returns the single-tile
   * `[from]` path when `from` is already a neighbor of the target), so there's
   * one code path instead of a separate adjacency special-case. `+ 1` reserves
   * the movement point the attack/assault/encounter action itself spends —
   * the same `movementPoints >= 1` gate the old adjacency-only checks used.
   * Returns the approach leg to sail first (`null` if none needed) or
   * `undefined` if the target can't be reached this turn at all.
   */
  function approachToEngage(targetPos: Coord): Coord[] | null | undefined {
    if (!selectedCaptain) return undefined
    const approach = findApproachPath(game.map, selectedCaptain.position, targetPos)
    if (!approach) return undefined
    const cost = approach.length - 1
    if (cost + 1 > selectedCaptain.movementPoints) return undefined
    return cost > 0 ? approach : null
  }

  /**
   * Set an intercept course (#376/#372) toward a target that's out of reach
   * this turn: the ship closes over the following turns and halts adjacent,
   * pausing on any new fog-of-war contact. No-op when no water approach exists
   * at all (island-locked target) — the engine would reject that, so there's
   * nothing honest to offer. Selection is kept so the destination flag shows.
   */
  function setInterceptCourse(
    targetPos: Coord,
    targetId: string,
    targetKind: 'captain' | 'city' | 'encounter',
  ) {
    if (!selectedCaptain) return
    // The engine rejects an intercept onto a target already within reach, and
    // there's nothing to chase if no water approach exists at all.
    if (mapDistance(game.map, selectedCaptain.position, targetPos) <= 1) return
    if (!findApproachPath(game.map, selectedCaptain.position, targetPos)) return
    shipMoveFeedback()
    onAction({
      type: 'setSailOrder',
      playerId: viewer.id,
      captainId: selectedCaptain.id,
      destination: targetPos,
      targetId,
      targetKind,
    })
  }

  // Movement-range shading (#371): the reachable-water / engageable-target
  // overlay for the selected ship, rebuilt only when the selection or state
  // changes. Fog rules match the renderer — enemies/encounters must be currently
  // visible, enemy cities explored — so nothing hidden is ever shaded.
  const rangeOverlay = useMemo<RangeOverlay | undefined>(() => {
    if (!selectedCaptain) return undefined
    return classifyRangeOverlay({
      map: game.map,
      from: selectedCaptain.position,
      movementPoints: selectedCaptain.movementPoints,
      hasTroops: selectedCaptain.troops.reduce((sum, t) => sum + t.count, 0) > 0,
      enemies: game.captains
        .filter(
          (c) => c.ownerId !== viewer.id && visibleKeys.has(`${c.position.x},${c.position.y}`),
        )
        .map((c) => c.position),
      enemyCities: game.cities
        .filter(
          (c) => c.ownerId !== viewer.id && exploredKeys.has(`${c.position.x},${c.position.y}`),
        )
        .map((c) => c.position),
      encounters: game.encounters
        .filter((e) => e.active && visibleKeys.has(`${e.position.x},${e.position.y}`))
        .map((e) => e.position),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCaptain, game, viewer.id, visibleKeys, exploredKeys])

  // Paused sail orders (#372): own ships halted on a new sighting, awaiting the
  // player's Resume (re-issue the order, refreshing the seen-contacts baseline)
  // or Cancel (drop it).
  const interruptedCaptains = game.captains.filter(
    (c) => c.ownerId === viewer.id && c.sailOrder?.interrupted,
  )

  function resumeSailOrder(captainId: string) {
    const cap = game.captains.find((c) => c.id === captainId)
    const order = cap?.sailOrder
    if (!order) return
    tapFeedback()
    onAction({
      type: 'setSailOrder',
      playerId: viewer.id,
      captainId,
      destination: order.destination,
      ...(order.targetId && order.targetKind
        ? { targetId: order.targetId, targetKind: order.targetKind }
        : {}),
    })
  }

  function cancelSailOrder(captainId: string) {
    tapFeedback()
    onAction({ type: 'clearSailOrder', playerId: viewer.id, captainId })
  }

  // Roster tap (#373): focus a city — select it, recenter the map on it (reusing
  // the #346 camera controls), and open its sheet.
  function openCity(cityId: string) {
    tapFeedback()
    setSelectedCityId(cityId)
    const city = game.cities.find((c) => c.id === cityId)
    if (city) mapControlsRef.current?.centerOn(city.position)
    setCityOpen(true)
  }

  // End-turn nudge (#373): a subtle, non-blocking hint that an owned city hasn't
  // built this round and can still afford a building — so a second city isn't
  // silently left idle. Counts only cities that can actually build something now.
  const idleCityHint = useMemo(() => {
    if (!isViewerTurn) return null
    const content = game.config.content
    if (!content) return null
    const buildableIdle = viewerCities.filter(
      (city) =>
        !city.builtThisRound &&
        Object.entries(content.buildings).some(
          ([id, def]) =>
            !city.buildings.includes(id) &&
            (!def.requires || city.buildings.includes(def.requires)) &&
            canAfford(viewer.resources, def.cost),
        ),
    )
    if (buildableIdle.length === 0) return null
    const n = buildableIdle.length
    return `${n} idle ${n === 1 ? 'city' : 'cities'} can still build`
  }, [isViewerTurn, game.config.content, viewerCities, viewer.resources])

  function handleTileClick(x: number, y: number) {
    if (!isViewerTurn || game.status !== 'active') return
    const ownHere = game.captains.find(
      (c) => c.ownerId === viewer.id && c.position.x === x && c.position.y === y,
    )
    if (ownHere) {
      // Embark (#465): with a party selected, tapping an adjacent own ship
      // re-boards it (partial if the hold can't take everyone).
      if (
        selectedParty &&
        mapDistance(game.map, selectedParty.position, ownHere.position) === 1 &&
        !ownHere.captured
      ) {
        tapFeedback()
        onAction({
          type: 'embark',
          playerId: viewer.id,
          partyId: selectedParty.id,
          captainId: ownHere.id,
        })
        setSelectedPartyId(null)
        return
      }
      setSelectedCaptainId(ownHere.id)
      setSelectedPartyId(null)
      setAttackTargetId(null)
      setPendingApproach(null)
      return
    }
    const ownPartyHere = game.parties.find(
      (p) => p.ownerId === viewer.id && p.position.x === x && p.position.y === y,
    )
    if (ownPartyHere) {
      setSelectedPartyId(ownPartyHere.id)
      setSelectedCaptainId(null)
      setAttackTargetId(null)
      setPendingApproach(null)
      return
    }
    if (selectedParty) {
      handlePartyTileClick(x, y, selectedParty)
      return
    }
    if (!selectedCaptain) return
    const key = `${x},${y}`

    // Fog rules unchanged (#376): a target is only tappable while currently
    // visible, same as the map itself only ever renders a captain/encounter
    // sprite for a currently-visible tile (MapCanvas's `visibleKeys` check).
    // Cities are exempt — they're static, explored landmarks the map already
    // shows from outside current vision, so the read-only info fallback below
    // keeps working exactly as before.
    const enemyHere = visibleKeys.has(key)
      ? game.captains.find(
          (c) => c.ownerId !== viewer.id && c.position.x === x && c.position.y === y,
        )
      : undefined
    if (enemyHere) {
      const approach = approachToEngage(enemyHere.position)
      if (approach !== undefined) {
        setPendingApproach(approach)
        setAttackTargetId(enemyHere.id)
      } else {
        // Out of range this turn (#376): set an intercept course toward it.
        setInterceptCourse(enemyHere.position, enemyHere.id, 'captain')
      }
      return
    }

    // Enemy city (#344): a landing force that can reach it this turn opens the
    // assault confirm; otherwise (unreachable, or no troops aboard) the
    // read-only enemy-city info.
    const cityHere = game.cities.find((c) => c.position.x === x && c.position.y === y)
    if (cityHere && cityHere.ownerId !== viewer.id) {
      const hasTroops = selectedCaptain.troops.reduce((sum, t) => sum + t.count, 0) > 0
      const approach = hasTroops ? approachToEngage(cityHere.position) : undefined
      if (approach !== undefined) {
        setPendingApproach(approach)
        setAssaultCityId(cityHere.id)
      } else if (
        hasTroops &&
        findApproachPath(game.map, selectedCaptain.position, cityHere.position)
      ) {
        // Troops aboard but the city is beyond this turn's reach (#376): sail an
        // intercept course toward it and assault on arrival.
        setInterceptCourse(cityHere.position, cityHere.id, 'city')
      } else {
        // No troops, or no sea approach at all: the read-only enemy-city info.
        setEnemyCityInfoId(cityHere.id)
      }
      return
    }

    const encounterHere = visibleKeys.has(key)
      ? game.encounters.find((e) => e.active && e.position.x === x && e.position.y === y)
      : undefined
    if (encounterHere) {
      const approach = approachToEngage(encounterHere.position)
      if (approach !== undefined) {
        setPendingApproach(approach)
        setEncounterId(encounterHere.id)
      } else {
        setInterceptCourse(encounterHere.position, encounterHere.id, 'encounter')
      }
      return
    }

    // Put a landing party ashore (#465): an adjacent empty land tile, with
    // troops aboard and a movement point to spend, opens the disembark sheet.
    if (
      tileAt(game.map, { x, y })?.type === 'land' &&
      mapDistance(game.map, selectedCaptain.position, { x, y }) === 1 &&
      selectedCaptain.movementPoints >= 1 &&
      selectedCaptain.troops.some((t) => t.count > 0) &&
      !game.parties.some((p) => p.position.x === x && p.position.y === y)
    ) {
      tapFeedback()
      setDisembarkTile({ x, y })
      setDisembarkCounts(Object.fromEntries(selectedCaptain.troops.map((t) => [t.unitId, t.count])))
      return
    }

    // Empty tile: move there if reachable this turn; if it's reachable by sea
    // but beyond this turn's movement, set a multi-turn sail order instead (#372)
    // so one click sends the ship on the whole voyage.
    const cost = pathCost(game.map, selectedCaptain.position, { x, y })
    if (cost === null) return
    if (cost <= selectedCaptain.movementPoints) {
      shipMoveFeedback()
      onAction({
        type: 'moveCaptain',
        playerId: viewer.id,
        captainId: selectedCaptain.id,
        to: { x, y },
      })
    } else {
      shipMoveFeedback()
      onAction({
        type: 'setSailOrder',
        playerId: viewer.id,
        captainId: selectedCaptain.id,
        destination: { x, y },
      })
    }
  }

  /**
   * A tap while a landing party is selected (#465): attack an adjacent enemy
   * party, open the land-assault confirm on an adjacent enemy city, or march
   * to a reachable land tile. No multi-turn march orders yet — a destination
   * beyond this turn's movement simply doesn't move (follow-up UX work).
   */
  function handlePartyTileClick(x: number, y: number, party: LandingParty) {
    const key = `${x},${y}`
    const enemyPartyHere = visibleKeys.has(key)
      ? game.parties.find(
          (p) => p.ownerId !== viewer.id && p.position.x === x && p.position.y === y,
        )
      : undefined
    if (enemyPartyHere) {
      if (
        mapDistance(game.map, party.position, enemyPartyHere.position) <= 1 &&
        party.movementPoints >= 1
      ) {
        setPartyAttackTargetId(enemyPartyHere.id)
      }
      return
    }
    const cityHere = game.cities.find((c) => c.position.x === x && c.position.y === y)
    if (cityHere && cityHere.ownerId !== viewer.id) {
      if (
        mapDistance(game.map, party.position, cityHere.position) <= 1 &&
        party.movementPoints >= 1
      ) {
        setPartyAssaultCityId(cityHere.id)
      } else {
        setEnemyCityInfoId(cityHere.id)
      }
      return
    }
    // Capture a land resource site (#466) the party is standing on.
    const siteHere = game.landSites.find(
      (s) => s.active && s.position.x === x && s.position.y === y,
    )
    if (
      siteHere &&
      party.position.x === x &&
      party.position.y === y &&
      party.movementPoints >= 1 &&
      siteHere.claimedBy !== viewer.id
    ) {
      tapFeedback()
      onAction({ type: 'captureSite', playerId: viewer.id, partyId: party.id, siteId: siteHere.id })
      return
    }
    // Resolve an adjacent land encounter (#466): open its choice sheet.
    const landEncHere = visibleKeys.has(key)
      ? game.landEncounters.find((e) => e.active && e.position.x === x && e.position.y === y)
      : undefined
    if (
      landEncHere &&
      mapDistance(game.map, party.position, landEncHere.position) <= 1 &&
      party.movementPoints >= 1
    ) {
      setLandEncounterId(landEncHere.id)
      return
    }
    // March: the engine's own land route (around every other party), only if it
    // fits this turn's remaining movement.
    const blocked = new Set(
      game.parties
        .filter((p) => p.id !== party.id)
        .map((p) => tileIndex(game.map, p.position.x, p.position.y)),
    )
    const path = findLandPath(game.map, party.position, { x, y }, blocked)
    if (!path || path.length - 1 > party.movementPoints || path.length < 2) return
    shipMoveFeedback()
    onAction({ type: 'moveParty', playerId: viewer.id, partyId: party.id, to: { x, y } })
  }

  function confirmDisembark() {
    if (!selectedCaptain || !disembarkTile) return
    const troops = selectedCaptain.troops
      .map((t) => ({ unitId: t.unitId, count: Math.min(disembarkCounts[t.unitId] ?? 0, t.count) }))
      .filter((t) => t.count > 0)
    if (troops.length === 0) return
    impactFeedback()
    onAction({
      type: 'disembark',
      playerId: viewer.id,
      captainId: selectedCaptain.id,
      to: disembarkTile,
      troops,
    })
    setDisembarkTile(null)
    setSelectedCaptainId(null)
  }

  function confirmPartyAttack() {
    if (!selectedParty || !partyAttackTarget) return
    impactFeedback()
    audioManager.play(DIALOGUE.battleCharge)
    onAction({
      type: 'attackParty',
      playerId: viewer.id,
      partyId: selectedParty.id,
      targetPartyId: partyAttackTarget.id,
    })
    setPartyAttackTargetId(null)
    setSelectedPartyId(null)
  }

  function confirmPartyAssault() {
    if (!selectedParty || !partyAssaultCity) return
    impactFeedback()
    audioManager.play(DIALOGUE.battleCharge)
    onAction({
      type: 'partyAssaultCity',
      playerId: viewer.id,
      partyId: selectedParty.id,
      targetCityId: partyAssaultCity.id,
    })
    setPartyAssaultCityId(null)
    setSelectedPartyId(null)
  }

  /**
   * Sail the recorded approach leg (#376), if any, before dispatching the
   * attack/assault/encounter action that follows. Relies on `handleAction`
   * (App.tsx) keeping its `game` ref current synchronously, so the very next
   * `onAction` call in the same handler validates against the post-move
   * position instead of a stale pre-move snapshot.
   */
  function dispatchApproach(captainId: string) {
    if (!pendingApproach) return
    onAction({
      type: 'moveCaptain',
      playerId: viewer.id,
      captainId,
      to: pendingApproach.at(-1)!,
    })
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

  // Assault strength preview (#344): the landing force vs the garrison, walls
  // included (cityToCombatant folds in the fortification defense bonus).
  const assaultStrength = useMemo(() => {
    if (!selectedCaptain || !assaultCity || !game.config.combatStats) return null
    const stats = createCombatStats(game.config.combatStats)
    return {
      attacker: combatantStrength(captainToCombatant(selectedCaptain, game.config.content), stats),
      garrison: combatantStrength(
        cityToCombatant(
          assaultCity,
          game.config.content,
          game.players.find((p) => p.id === assaultCity.ownerId)?.faction,
        ),
        stats,
      ),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCaptain, assaultCity, game])

  // Land-assault strength preview (#465): the party vs the full city defense —
  // same combatants the reducer resolves, so the preview never lies.
  const partyAssaultStrength = useMemo(() => {
    if (!selectedParty || !partyAssaultCity || !game.config.combatStats) return null
    const stats = createCombatStats(game.config.combatStats)
    return {
      attacker: combatantStrength(partyToCombatant(selectedParty), stats),
      garrison: combatantStrength(
        cityToCombatant(
          partyAssaultCity,
          game.config.content,
          game.players.find((p) => p.id === partyAssaultCity.ownerId)?.faction,
        ),
        stats,
      ),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParty, partyAssaultCity, game])

  /**
   * Engage the target (#93, #305). Auto mode (the default) is unchanged:
   * the battle is simulated locally from the current RNG state, and only a
   * boarding melee stops for the player's hand — a naval decision alone
   * dispatches immediately. Tactical mode instead routes the whole battle
   * through the round-by-round planner first. Committed either way: the
   * deterministic sim already revealed the outcome, so there is no backing
   * out once a probe has run.
   */
  function confirmAttack() {
    if (game.config.setup.battleResolution === 'tactical') {
      startTacticalAttack()
    } else {
      autoResolveAttack()
    }
  }

  /** Auto-resolve: the pre-#305 attack flow, and Tactical mode's own "skip this battle" escape hatch. */
  function autoResolveAttack() {
    if (!selectedCaptain || !attackTarget) return
    impactFeedback()
    audioManager.play(DIALOGUE.battleCharge)
    const captainId = selectedCaptain.id
    const targetCaptainId = attackTarget.id
    dispatchApproach(captainId)
    setAttackTargetId(null)
    setPendingApproach(null)
    setSelectedCaptainId(null)
    setTacticalRound(null)

    let probe: BoardingProbeOutcome | null = null
    try {
      probe = probeBoardingBattle(game, { captainId, targetCaptainId }, [])
    } catch (err) {
      // Fail-safe: a broken local simulation must never block the attack —
      // dispatch without a plan and let the board AI fight the melee.
      console.error('Boarding simulation failed; falling back to auto-resolve', err)
    }
    if (probe?.kind === 'awaitingCommand') {
      setBoarding({
        captainId,
        targetCaptainId,
        gunneryOrders: [],
        commands: [],
        view: probe.view,
        losses: [],
      })
      return
    }
    onAction({ type: 'attackCaptain', playerId: viewer.id, captainId, targetCaptainId })
  }

  /** Tactical mode (#305): probe the first gunnery round instead of resolving outright. */
  function startTacticalAttack() {
    if (!selectedCaptain || !attackTarget) return
    impactFeedback()
    audioManager.play(DIALOGUE.battleCharge)
    const captainId = selectedCaptain.id
    const targetCaptainId = attackTarget.id
    dispatchApproach(captainId)
    setAttackTargetId(null)
    setPendingApproach(null)
    setSelectedCaptainId(null)

    let probe: TacticalProbeOutcome | null = null
    try {
      probe = probeTacticalBattle(game, { captainId, targetCaptainId }, [], [])
    } catch (err) {
      console.error('Tactical simulation failed; falling back to auto-resolve', err)
    }
    if (probe?.kind === 'awaitingTactic') {
      setTacticalRound({ captainId, targetCaptainId, gunneryOrders: [], ctx: probe.ctx })
      return
    }
    if (probe?.kind === 'awaitingCommand') {
      setBoarding({
        captainId,
        targetCaptainId,
        gunneryOrders: [],
        commands: [],
        view: probe.view,
        losses: [],
      })
      return
    }
    onAction({ type: 'attackCaptain', playerId: viewer.id, captainId, targetCaptainId })
  }

  /** One round's tactic, from the Tactical round sheet: extend the plan and re-probe for the next round. */
  function chooseTactic(tactic: TacticId) {
    if (!tacticalRound) return
    const { captainId, targetCaptainId } = tacticalRound
    const gunneryOrders = [...tacticalRound.gunneryOrders, tactic]

    let probe: TacticalProbeOutcome | null = null
    try {
      probe = probeTacticalBattle(game, { captainId, targetCaptainId }, gunneryOrders, [])
    } catch (err) {
      console.error('Tactical simulation failed mid-battle; falling back to auto-resolve', err)
    }
    if (probe?.kind === 'awaitingTactic') {
      setTacticalRound({ ...tacticalRound, gunneryOrders, ctx: probe.ctx })
      return
    }
    setTacticalRound(null)
    if (probe?.kind === 'awaitingCommand') {
      setBoarding({
        captainId,
        targetCaptainId,
        gunneryOrders,
        commands: [],
        view: probe.view,
        losses: [],
      })
      return
    }
    // Resolved with the recorded gunnery plan — or the sim failed, in which
    // case dropping the plan and dispatching plain-auto never blocks the attack.
    onAction({
      type: 'attackCaptain',
      playerId: viewer.id,
      captainId,
      targetCaptainId,
      ...(probe?.kind === 'resolved' && gunneryOrders.length > 0
        ? { attackerOrders: gunneryOrders }
        : {}),
    })
  }

  /**
   * The Tactical round sheet's own auto-resolve (#305, D-002): drop whatever
   * rounds were already picked and dispatch plain — "submit with no orders"
   * is auto-resolve's exact definition, always available mid-battle too.
   */
  function autoResolveTactical() {
    if (!tacticalRound) return
    const { captainId, targetCaptainId } = tacticalRound
    setTacticalRound(null)
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
      ...(current.gunneryOrders.length > 0 ? { attackerOrders: current.gunneryOrders } : {}),
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
        {
          captainId: boarding.captainId,
          targetCaptainId: boarding.targetCaptainId,
          attackerOrders: boarding.gunneryOrders,
        },
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

  /**
   * Assault the pending enemy city (#344). Tactical mode routes the land melee
   * through the interactive board planner (probeCityAssault); Auto mode
   * dispatches straight to the reducer, where the board AI fights the garrison.
   */
  function confirmAssault() {
    if (game.config.setup.battleResolution === 'tactical') startTacticalAssault()
    else autoResolveAssault()
  }

  /** Auto-resolve the assault, and Tactical mode's own "skip this battle" escape hatch. */
  function autoResolveAssault() {
    if (!selectedCaptain || !assaultCity) return
    impactFeedback()
    audioManager.play(DIALOGUE.battleCharge)
    const captainId = selectedCaptain.id
    const targetCityId = assaultCity.id
    dispatchApproach(captainId)
    setAssaultCityId(null)
    setPendingApproach(null)
    setSelectedCaptainId(null)
    setAssaultBoarding(null)
    onAction({ type: 'attackCity', playerId: viewer.id, captainId, targetCityId })
  }

  /** Tactical mode (#344/#305): probe the land board instead of resolving outright. */
  function startTacticalAssault() {
    if (!selectedCaptain || !assaultCity) return
    impactFeedback()
    audioManager.play(DIALOGUE.battleCharge)
    const captainId = selectedCaptain.id
    const targetCityId = assaultCity.id
    dispatchApproach(captainId)
    setAssaultCityId(null)
    setPendingApproach(null)
    setSelectedCaptainId(null)

    let probe: BoardingProbeOutcome | null = null
    try {
      probe = probeCityAssault(game, { captainId, targetCityId }, [])
    } catch (err) {
      console.error('City-assault simulation failed; falling back to auto-resolve', err)
    }
    if (probe?.kind === 'awaitingCommand') {
      setAssaultBoarding({ captainId, targetCityId, commands: [], view: probe.view, losses: [] })
      return
    }
    onAction({ type: 'attackCity', playerId: viewer.id, captainId, targetCityId })
  }

  /** Dispatch the assault with every command recorded so far; the board AI finishes any remainder. */
  function dispatchAssault(current: AssaultBoardingState, commands: BoardCommand[]) {
    setAssaultBoarding(null)
    onAction({
      type: 'attackCity',
      playerId: viewer.id,
      captainId: current.captainId,
      targetCityId: current.targetCityId,
      ...(commands.length > 0 ? { boardCommands: commands } : {}),
    })
  }

  /** One confirmed land-melee order: extend the plan and re-probe for the next activation. */
  function orderAssaultCommand(command: BoardCommand) {
    if (!assaultBoarding) return
    const commands = [...assaultBoarding.commands, command]
    let probe: BoardingProbeOutcome | null = null
    try {
      probe = probeCityAssault(
        game,
        { captainId: assaultBoarding.captainId, targetCityId: assaultBoarding.targetCityId },
        commands,
      )
    } catch (err) {
      console.error('City-assault simulation failed mid-melee; auto-resolving the rest', err)
    }
    if (probe?.kind === 'awaitingCommand') {
      setAssaultBoarding({
        ...assaultBoarding,
        commands,
        view: probe.view,
        losses: stackLosses(assaultBoarding.view, probe.view),
      })
      return
    }
    dispatchAssault(assaultBoarding, commands)
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
    dispatchApproach(selectedCaptain.id)
    onAction({
      type: 'resolveEncounter',
      playerId: viewer.id,
      captainId: selectedCaptain.id,
      encounterId: encounter.id,
      choice: choice as EncounterChoice,
    })
    setEncounterId(null)
    setPendingApproach(null)
    setSelectedCaptainId(null)
  }

  function resolvePartyEncounterChoice(choice: string) {
    if (!selectedParty || !landEncounter) return
    impactFeedback()
    const reward =
      game.config.content?.landEncounters?.[landEncounter.kind]?.choices?.[
        choice as EncounterChoice
      ]?.reward
    if (reward?.gold) coinFeedback()
    onAction({
      type: 'resolvePartyEncounter',
      playerId: viewer.id,
      partyId: selectedParty.id,
      encounterId: landEncounter.id,
      choice: choice as EncounterChoice,
    })
    setLandEncounterId(null)
  }

  function endTurn() {
    tapFeedback()
    setSelectedCaptainId(null)
    setSelectedPartyId(null)
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
    onRecruitCaptain: (captainId?: string) => {
      onAction({
        type: 'recruitCaptain',
        playerId: viewer.id,
        cityId: viewerCity.id,
        ...(captainId ? { captainId } : {}),
      })
    },
    onRansomCaptain: (captainId: string) => {
      onAction({ type: 'ransomCaptain', playerId: viewer.id, captainId })
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
          parties={game.parties}
          encounters={game.encounters}
          landSites={game.landSites}
          landEncounters={game.landEncounters}
          viewerId={viewer.id}
          visibleKeys={visibleKeys}
          exploredKeys={exploredKeys}
          selectedCaptainId={selectedCaptainId}
          selectedPartyId={selectedPartyId}
          onTileClick={handleTileClick}
          rangeOverlay={rangeOverlay}
          onSetCourse={(cell) => {
            if (!selectedCaptain) return
            shipMoveFeedback()
            onAction({
              type: 'setSailOrder',
              playerId: viewer.id,
              captainId: selectedCaptain.id,
              destination: cell,
            })
          }}
          factionOf={factionOf}
          controlsRef={mapControlsRef}
        />
        {eventFeed.length > 0 && (
          <ul className="turn-event-feed" aria-label="Recent events">
            {eventFeed.map((e) => (
              <li key={e.id}>{e.text}</li>
            ))}
          </ul>
        )}
        {/* Paused sail orders (#372): a ship halted on a new sighting waits here
            for Resume (continue, re-baselining the contacts it now sees) or
            Cancel (drop the course). */}
        {isViewerTurn &&
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
        {/* City roster (#373): only when the viewer holds more than one city —
            a single-city game keeps the unchanged "City" button and no strip. */}
        {viewerCities.length > 1 && (
          <ul className="city-roster" aria-label="Your cities">
            {viewerCities.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={
                    c.id === viewerCity?.id ? 'city-roster-entry selected' : 'city-roster-entry'
                  }
                  onClick={() => openCity(c.id)}
                >
                  <span className="city-roster-name">{c.name}</span>
                  <span
                    className={c.builtThisRound ? 'city-roster-built done' : 'city-roster-built'}
                    aria-label={c.builtThisRound ? 'Built this round' : 'Idle this round'}
                    title={c.builtThisRound ? 'Built this round' : 'Idle this round'}
                  >
                    {c.builtThisRound ? '✓' : '•'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Primary actions live in a bottom bar, not the header, so they sit in
          the thumb-reach zone on one-handed phone use (#27). */}
      <div className="bottom-action-bar">
        {idleCityHint && (
          <div className="idle-city-hint" role="status">
            {idleCityHint}
          </div>
        )}
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
      {!isViewerTurn &&
        !attackTarget &&
        !assaultCity &&
        !enemyCityInfo &&
        !encounter &&
        !cityOpen &&
        !savesOpen && <AdSlot placement="between-turns" />}

      {tacticalRound && (
        <TacticalRoundSheet
          key={tacticalRound.gunneryOrders.length}
          ctx={tacticalRound.ctx}
          onChoose={chooseTactic}
          onAutoResolve={autoResolveTactical}
        />
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

      {assaultBoarding && (
        <BoardingCommandSheet
          key={assaultBoarding.commands.length}
          view={assaultBoarding.view}
          losses={assaultBoarding.losses}
          onCommand={orderAssaultCommand}
          onAutoResolve={() => dispatchAssault(assaultBoarding, assaultBoarding.commands)}
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
        <BottomSheet
          title={`Engage ${attackTarget.name}?`}
          onClose={() => {
            setAttackTargetId(null)
            setPendingApproach(null)
          }}
        >
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
            <div className="button-group">
              <button className="primary" onClick={confirmAttack}>
                {UI_ICON.attack && (
                  <img className="button-icon" src={UI_ICON.attack} alt="" aria-hidden />
                )}
                {game.config.setup.battleResolution === 'tactical' ? 'Fight tactically' : 'Attack'}
              </button>
              {/* D-002: auto-resolve stays available from the battle screen even in
                  Tactical mode — in Auto mode, "Attack" already is auto-resolve. */}
              {game.config.setup.battleResolution === 'tactical' && (
                <button className="secondary" onClick={autoResolveAttack}>
                  Auto-resolve
                </button>
              )}
            </div>
          </section>
        </BottomSheet>
      )}

      {assaultCity && selectedCaptain && (
        <BottomSheet
          title={`Assault ${assaultCity.name}?`}
          onClose={() => {
            setAssaultCityId(null)
            setPendingApproach(null)
          }}
        >
          <section>
            <p className="building-option__hint">
              {factionName(
                factionOf(assaultCity.ownerId),
                FACTIONS[factionOf(assaultCity.ownerId)].name,
              )}{' '}
              stronghold. Your landing force storms the garrison — win it and the city is yours;
              lose and your captain is taken captive.
            </p>
            {assaultStrength && (
              <p className="building-option__hint">
                Your force {Math.round(assaultStrength.attacker)} vs garrison{' '}
                {Math.round(assaultStrength.garrison)}
                {assaultCity.buildings.some(
                  (b) => (game.config.content?.buildings[b]?.defenseBonus ?? 0) > 0,
                )
                  ? ' (fortified)'
                  : ''}
              </p>
            )}
            <div className="button-group">
              <button className="primary" onClick={confirmAssault}>
                {UI_ICON.attack && (
                  <img className="button-icon" src={UI_ICON.attack} alt="" aria-hidden />
                )}
                {game.config.setup.battleResolution === 'tactical'
                  ? 'Assault tactically'
                  : 'Assault'}
              </button>
              {game.config.setup.battleResolution === 'tactical' && (
                <button className="secondary" onClick={autoResolveAssault}>
                  Auto-resolve
                </button>
              )}
            </div>
          </section>
        </BottomSheet>
      )}

      {disembarkTile && selectedCaptain && (
        <BottomSheet
          title="Put a landing party ashore?"
          onClose={() => {
            setDisembarkTile(null)
          }}
        >
          <section>
            <p className="building-option__hint">
              Choose the troops to land. The party steps ashore now (one movement point) and can
              march overland from your next turn; a friendly ship alongside can take it back aboard
              later.
            </p>
            {selectedCaptain.troops.map((stack) => {
              const landing = Math.min(disembarkCounts[stack.unitId] ?? 0, stack.count)
              return (
                <div key={stack.unitId} className="garrison-row">
                  <span>
                    {unitName(stack.unitId, stack.unitId)}: landing {landing} of {stack.count}
                  </span>
                  <div className="button-group">
                    <button
                      className="secondary"
                      disabled={landing <= 0}
                      aria-label={`Land one fewer ${unitName(stack.unitId, stack.unitId)}`}
                      onClick={() =>
                        setDisembarkCounts((c) => ({ ...c, [stack.unitId]: landing - 1 }))
                      }
                    >
                      −
                    </button>
                    <button
                      className="secondary"
                      disabled={landing >= stack.count}
                      aria-label={`Land one more ${unitName(stack.unitId, stack.unitId)}`}
                      onClick={() =>
                        setDisembarkCounts((c) => ({ ...c, [stack.unitId]: landing + 1 }))
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}
            <div className="button-group">
              <button
                className="primary"
                disabled={selectedCaptain.troops.every(
                  (t) => Math.min(disembarkCounts[t.unitId] ?? 0, t.count) <= 0,
                )}
                onClick={confirmDisembark}
              >
                Land party
              </button>
            </div>
          </section>
        </BottomSheet>
      )}

      {partyAttackTarget && selectedParty && (
        <BottomSheet
          title={`Attack ${partyAttackTarget.name}?`}
          onClose={() => setPartyAttackTargetId(null)}
        >
          <section>
            <p className="building-option__hint">
              A land battle to the finish — the beaten party is destroyed outright, and the victor
              keeps its survivors.
            </p>
            <div className="button-group">
              <button className="primary" onClick={confirmPartyAttack}>
                {UI_ICON.attack && (
                  <img className="button-icon" src={UI_ICON.attack} alt="" aria-hidden />
                )}
                Attack
              </button>
            </div>
          </section>
        </BottomSheet>
      )}

      {partyAssaultCity && selectedParty && (
        <BottomSheet
          title={`Storm ${partyAssaultCity.name} by land?`}
          onClose={() => setPartyAssaultCityId(null)}
        >
          <section>
            <p className="building-option__hint">
              {factionName(
                factionOf(partyAssaultCity.ownerId),
                FACTIONS[factionOf(partyAssaultCity.ownerId)].name,
              )}{' '}
              stronghold. The city defends at full strength from the land side too — militia and
              turrets included. Win and it is yours; lose and the party is destroyed.
            </p>
            {partyAssaultStrength && (
              <p className="building-option__hint">
                Your party {Math.round(partyAssaultStrength.attacker)} vs garrison{' '}
                {Math.round(partyAssaultStrength.garrison)}
              </p>
            )}
            <div className="button-group">
              <button className="primary" onClick={confirmPartyAssault}>
                {UI_ICON.attack && (
                  <img className="button-icon" src={UI_ICON.attack} alt="" aria-hidden />
                )}
                Assault
              </button>
            </div>
          </section>
        </BottomSheet>
      )}

      {enemyCityInfo && (
        <BottomSheet title={enemyCityInfo.name} onClose={() => setEnemyCityInfoId(null)}>
          <section>
            <p className="building-option__hint">
              Held by{' '}
              {factionName(
                factionOf(enemyCityInfo.ownerId),
                FACTIONS[factionOf(enemyCityInfo.ownerId)].name,
              )}
              .
            </p>
            {visibleKeys.has(`${enemyCityInfo.position.x},${enemyCityInfo.position.y}`) ? (
              <>
                <p className="building-option__hint">
                  Garrison:{' '}
                  {Object.entries(enemyCityInfo.garrison).filter(([, n]) => n > 0).length > 0
                    ? Object.entries(enemyCityInfo.garrison)
                        .filter(([, n]) => n > 0)
                        .map(([unitId, n]) => `${unitName(unitId, unitId)} x${n}`)
                        .join(', ')
                    : 'undefended'}
                </p>
                {enemyCityInfo.buildings.some(
                  (b) => (game.config.content?.buildings[b]?.defenseBonus ?? 0) > 0,
                ) && <p className="building-option__hint">Fortified with walls.</p>}
                <p className="building-option__hint">
                  Sail a captain carrying troops alongside it, then tap it to assault.
                </p>
              </>
            ) : (
              <p className="building-option__hint">
                Out of sight — move a captain closer to scout its garrison.
              </p>
            )}
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
          onClose={() => {
            setEncounterId(null)
            setPendingApproach(null)
          }}
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

      {landEncounter && (
        <BottomSheet
          title={
            landEncounter.kind === 'nativeVillage'
              ? 'A native village inland'
              : landEncounter.kind === 'hermit'
                ? 'A hermit in the hills'
                : 'A bandit camp astride the trail'
          }
          onClose={() => setLandEncounterId(null)}
        >
          <section className="button-group">
            {landEncounterChoices.map((choice) => (
              <button
                key={choice}
                className="secondary"
                onClick={() => resolvePartyEncounterChoice(choice)}
              >
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
          setup={game.config.setup}
          round={game.round}
          playerName={(id) => game.players.find((p) => p.id === id)?.name ?? id}
          cities={viewerCities}
          onSelectCity={openCity}
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
