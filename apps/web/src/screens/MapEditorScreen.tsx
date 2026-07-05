import { AI_TUNING, GAME_SETUP, MAP_VALIDATION_LIMITS, combatStatsData } from '@aop/content'
import { validateMapDefinition, type EncounterKind, type TileType } from '@aop/engine'
import type { Coord, MapSize } from '@aop/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { buildCatalog } from '../catalog'
import { MapEditorCanvas } from '../mapEditor/MapEditorCanvas'
import {
  addStartPosition,
  blankDraft,
  draftFromGenerated,
  draftToMapDefinition,
  eraseEntityAt,
  floodFillTile,
  nearestMapSize,
  paintTile,
  placeEncounter,
  placeResourceMarker,
  renameDraft,
} from '../mapEditor/draft'
import { decodeMapCode, encodeMapCode, MAP_FILE_EXTENSION } from '../mapEditor/encode'
import {
  deleteDraft,
  listDrafts,
  loadDraft,
  saveDraft,
  type MapDraftRecord,
} from '../mapEditor/storage'
import {
  ENCOUNTER_KINDS,
  RESOURCE_MARKER_KINDS,
  TILE_TYPES,
  type EditorDraft,
  type EditorMode,
  type EntityPaletteItem,
  type ResourceMarkerKind,
  type TileTool,
} from '../mapEditor/types'
import { createDefaultPlayer, starterTroops } from '../players'
import type { GameSetupConfig } from '../types'

interface MapEditorScreenProps {
  onBack: () => void
  onTestPlay: (config: GameSetupConfig) => void
}

const MAP_SIZES: MapSize[] = ['small', 'medium', 'large']
const TILE_LABEL: Record<string, string> = {
  deep: 'Sea',
  shallows: 'Shallows',
  land: 'Island',
  port: 'Port',
}
const ENCOUNTER_LABEL: Record<EncounterKind, string> = {
  merchant: 'Merchant',
  natives: 'Natives',
  settlers: 'Settlers',
}
const RESOURCE_LABEL: Record<ResourceMarkerKind, string> = {
  gold: 'Gold',
  timber: 'Timber',
  iron: 'Iron',
  rum: 'Rum',
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

/**
 * In-browser map editor (#41): paint tiles, place start positions/encounters/
 * resource markers, get live engine validation, test-play, and save/export.
 * Random-map generation and validation both delegate to the engine (#62/#6) —
 * this screen only holds UI state and the `EditorDraft` (see mapEditor/).
 */
export function MapEditorScreen({ onBack, onTestPlay }: MapEditorScreenProps) {
  const [draft, setDraft] = useState<EditorDraft>(() => blankDraft('small'))
  const [mode, setMode] = useState<EditorMode>('tile')
  const [tileTool, setTileTool] = useState<TileTool>('brush')
  const [tileBrush, setTileBrush] = useState<TileType>('land')
  const [entityItem, setEntityItem] = useState<EntityPaletteItem>({ kind: 'start' })
  const [genSize, setGenSize] = useState<MapSize>('small')
  const [genPlayerCount, setGenPlayerCount] = useState(2)
  const [seed, setSeed] = useState(randomSeed)
  const [savedDrafts, setSavedDrafts] = useState<MapDraftRecord[]>([])
  const [exportCode, setExportCode] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    refreshSavedDrafts()
  }, [])

  function refreshSavedDrafts() {
    void listDrafts().then(setSavedDrafts)
  }

  const validation = useMemo(
    () => validateMapDefinition(draftToMapDefinition(draft), MAP_VALIDATION_LIMITS),
    [draft],
  )

  function handleTileAt(coord: Coord, isDown: boolean) {
    setDraft((d) => {
      if (mode === 'tile') {
        if (tileTool === 'fill') return isDown ? floodFillTile(d, coord, tileBrush) : d
        const type = tileTool === 'eraser' ? 'deep' : tileBrush
        return paintTile(d, coord, type)
      }
      if (mode === 'erase') return eraseEntityAt(d, coord)
      // mode === 'entity'
      if (entityItem.kind === 'start') return addStartPosition(d, coord)
      if (entityItem.kind === 'encounter') return placeEncounter(d, coord, entityItem.encounterKind)
      return placeResourceMarker(d, coord, entityItem.resourceKind)
    })
  }

  function handleNewBlank() {
    if (!confirm('Start a new blank map? Unsaved changes will be lost.')) return
    setDraft(blankDraft(genSize, 'Untitled map'))
    setExportCode(null)
    setStatus(null)
  }

  function handleGenerateRandom() {
    const nextSeed = randomSeed()
    setSeed(nextSeed)
    setDraft(
      draftFromGenerated(
        nextSeed,
        genSize,
        genPlayerCount,
        GAME_SETUP.homeIslandRadius,
        draft.name,
      ),
    )
    setExportCode(null)
    setStatus(null)
  }

  async function handleSave() {
    await saveDraft(draft)
    refreshSavedDrafts()
    setStatus(`Saved "${draft.name}"`)
  }

  async function handleLoad(id: string) {
    const record = await loadDraft(id)
    if (!record) return
    setDraft(record.draft)
    setExportCode(null)
    setStatus(`Loaded "${record.draft.name}"`)
  }

  async function handleDelete(id: string) {
    await deleteDraft(id)
    refreshSavedDrafts()
  }

  function handleExport() {
    setExportCode(encodeMapCode(draft))
  }

  async function handleCopyCode() {
    if (!exportCode) return
    try {
      await navigator.clipboard.writeText(exportCode)
      setStatus('Map code copied to clipboard')
    } catch {
      setStatus('Copy failed — select the code and copy it manually')
    }
  }

  function handleExportFile() {
    const blob = new Blob([encodeMapCode(draft)], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${draft.name.trim().replace(/\s+/g, '-').toLowerCase() || 'map'}${MAP_FILE_EXTENSION}`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Shared import path for pasted codes and uploaded files: decode, then
   * re-validate through the engine before accepting — a shared code is
   * untrusted input regardless of how it arrived. */
  function importCode(code: string) {
    try {
      const imported = decodeMapCode(code)
      const result = validateMapDefinition(draftToMapDefinition(imported), MAP_VALIDATION_LIMITS)
      if (!result.valid) {
        setImportError(
          `Map code decoded but failed validation: ${result.errors.map((e) => e.message).join('; ')}`,
        )
        return
      }
      setDraft(imported)
      setImportError(null)
      setImportText('')
      setStatus(`Imported "${imported.name}"`)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not import map code')
    }
  }

  async function handleImportFile(file: File) {
    try {
      importCode(await file.text())
    } catch {
      setImportError('Could not read the selected file')
    }
  }

  function handleTestPlay() {
    if (!validation.valid) return
    const playerCount = draft.startPositions.length
    const players = Array.from({ length: playerCount }, (_, i) => {
      const p = createDefaultPlayer(i)
      return { ...p, startingTroops: starterTroops(p.faction) }
    })
    onTestPlay({
      seed,
      mapSize: nearestMapSize(draft.width),
      mapDefinition: draftToMapDefinition(draft),
      players,
      setup: GAME_SETUP,
      combatStats: combatStatsData(),
      content: buildCatalog(),
      aiTuning: AI_TUNING,
    })
  }

  return (
    <div className="screen map-editor-screen">
      <div className="setup-header">
        <h2>Map Editor</h2>
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
      </div>

      <div className="map-editor-body">
        <div className="map-editor-sidebar">
          <div className="setup-section">
            <label className="section-label">Map Name</label>
            <input
              className="map-editor-name-input"
              value={draft.name}
              onChange={(e) => setDraft((d) => renameDraft(d, e.target.value))}
            />
          </div>

          <div className="setup-section">
            <label className="section-label">Tile Tools</label>
            <div className="button-group">
              {(['brush', 'fill', 'eraser'] as TileTool[]).map((tool) => (
                <button
                  key={tool}
                  className={`size-button ${mode === 'tile' && tileTool === tool ? 'active' : ''}`}
                  onClick={() => {
                    setMode('tile')
                    setTileTool(tool)
                  }}
                >
                  {tool.charAt(0).toUpperCase() + tool.slice(1)}
                </button>
              ))}
            </div>
            <div className="button-group">
              {TILE_TYPES.map((type) => (
                <button
                  key={type}
                  className={`size-button ${tileBrush === type ? 'active' : ''}`}
                  disabled={tileTool === 'eraser'}
                  onClick={() => {
                    setMode('tile')
                    setTileBrush(type)
                  }}
                >
                  {TILE_LABEL[type]}
                </button>
              ))}
            </div>
          </div>

          <div className="setup-section">
            <label className="section-label">Entities</label>
            <div className="button-group">
              <button
                className={`size-button ${mode === 'entity' && entityItem.kind === 'start' ? 'active' : ''}`}
                onClick={() => {
                  setMode('entity')
                  setEntityItem({ kind: 'start' })
                }}
              >
                Start ({draft.startPositions.length}/8)
              </button>
              {ENCOUNTER_KINDS.map((kind) => (
                <button
                  key={kind}
                  className={`size-button ${
                    mode === 'entity' &&
                    entityItem.kind === 'encounter' &&
                    entityItem.encounterKind === kind
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => {
                    setMode('entity')
                    setEntityItem({ kind: 'encounter', encounterKind: kind })
                  }}
                >
                  {ENCOUNTER_LABEL[kind]}
                </button>
              ))}
              {RESOURCE_MARKER_KINDS.map((kind) => (
                <button
                  key={kind}
                  className={`size-button ${
                    mode === 'entity' &&
                    entityItem.kind === 'resource' &&
                    entityItem.resourceKind === kind
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => {
                    setMode('entity')
                    setEntityItem({ kind: 'resource', resourceKind: kind })
                  }}
                >
                  {RESOURCE_LABEL[kind]}
                </button>
              ))}
              <button
                className={`size-button ${mode === 'erase' ? 'active' : ''}`}
                onClick={() => setMode('erase')}
              >
                Erase Entity
              </button>
            </div>
            <p className="map-editor-hint">
              Entity tools place on empty tiles only — use Erase Entity to clear one first.
            </p>
          </div>

          <div className="setup-section">
            <label className="section-label">New / Random Map</label>
            <div className="button-group">
              {MAP_SIZES.map((size) => (
                <button
                  key={size}
                  className={`size-button ${genSize === size ? 'active' : ''}`}
                  onClick={() => setGenSize(size)}
                >
                  {size.charAt(0).toUpperCase() + size.slice(1)}
                </button>
              ))}
            </div>
            <div className="button-group">
              {Array.from({ length: 7 }, (_, i) => i + 2).map((count) => (
                <button
                  key={count}
                  className={`player-count-button ${genPlayerCount === count ? 'active' : ''}`}
                  onClick={() => setGenPlayerCount(count)}
                >
                  {count}
                </button>
              ))}
            </div>
            <div className="button-group">
              <button className="secondary" onClick={handleNewBlank}>
                New Blank Map
              </button>
              <button className="secondary" onClick={handleGenerateRandom}>
                Generate / Reroll
              </button>
            </div>
          </div>

          <div className="setup-section">
            <label className="section-label">Save / Load</label>
            <div className="button-group">
              <button className="secondary" onClick={() => void handleSave()}>
                Save
              </button>
              <button className="secondary" onClick={handleExport}>
                Export Code
              </button>
              <button className="secondary" onClick={handleExportFile}>
                Export File
              </button>
            </div>
            {savedDrafts.length > 0 && (
              <ul className="building-list">
                {savedDrafts.map((record) => (
                  <li key={record.draft.id} className="garrison-row">
                    <span className="garrison-row__name">{record.draft.name}</span>
                    <div className="garrison-row__actions">
                      <button onClick={() => void handleLoad(record.draft.id)}>Load</button>
                      <button className="danger" onClick={() => void handleDelete(record.draft.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {exportCode && (
              <>
                <textarea
                  className="map-editor-code-box"
                  readOnly
                  value={exportCode}
                  onFocus={(e) => e.target.select()}
                />
                <button className="secondary" onClick={() => void handleCopyCode()}>
                  Copy Code
                </button>
              </>
            )}
            <label className="section-label">Import</label>
            <textarea
              className="map-editor-code-box"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste an AOPMAP1: code here"
            />
            <div className="button-group">
              <button
                className="secondary"
                onClick={() => importCode(importText)}
                disabled={!importText.trim()}
              >
                Import Code
              </button>
              <button className="secondary" onClick={() => importFileRef.current?.click()}>
                Import File
              </button>
            </div>
            <input
              ref={importFileRef}
              type="file"
              accept={`${MAP_FILE_EXTENSION},text/plain`}
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void handleImportFile(file)
              }}
            />
            {importError && <p className="map-editor-error">{importError}</p>}
            {status && <p className="map-editor-status">{status}</p>}
          </div>

          <button className="primary large" onClick={handleTestPlay} disabled={!validation.valid}>
            Test Play
          </button>
        </div>

        <div className="map-editor-canvas-wrap">
          <MapEditorCanvas draft={draft} onTileAt={handleTileAt} />
        </div>

        <div className="map-editor-validation">
          <label className="section-label">Validation</label>
          {validation.valid ? (
            <p className="map-editor-valid">Map is valid — ready to test-play or export.</p>
          ) : (
            <ul className="map-editor-error-list">
              {validation.errors.map((err) => (
                <li key={err.code}>{err.message}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
