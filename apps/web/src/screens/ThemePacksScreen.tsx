import { useEffect, useRef, useState } from 'react'
import type { FactionId } from '@aop/shared'
import { processThemeAsset, ThemeAssetError } from '../theme/assets'
import { useTheme } from '../theme/ThemeContext'
import {
  deleteThemePack,
  exportThemePack,
  getActiveThemePackId,
  importThemePackFromFile,
  listThemePacks,
  LOCAL_PROFILE_ID,
  newThemePack,
  saveThemePack,
  setActiveThemePack,
} from '../theme/storage'
import { assetKey, type ThemeAssetKind, type ThemePack } from '../theme/types'
import { ThemePackEditor } from './ThemePackEditor'

interface ThemePacksScreenProps {
  onBack: () => void
}

/**
 * Theme pack management (#64, Tier 1 — local-only): create/rename/delete
 * packs, edit their faction/troop/ship display names and sprite/audio
 * overrides, apply one to the local profile, and export/import as a file
 * for manual sharing. Everything here is client-side and IndexedDB-backed —
 * @aop/engine never sees a theme pack.
 */
export function ThemePacksScreen({ onBack }: ThemePacksScreenProps) {
  const { pack: activePack, setActivePack } = useTheme()
  const [packs, setPacks] = useState<ThemePack[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ThemePack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh() {
    const [list, active] = await Promise.all([
      listThemePacks(),
      getActiveThemePackId(LOCAL_PROFILE_ID),
    ])
    setPacks(list)
    setActiveId(active)
  }

  async function handleCreate() {
    const pack = newThemePack(`Theme ${packs.length + 1}`)
    await saveThemePack(pack)
    await refresh()
    setEditing(pack)
  }

  async function handleDelete(id: string) {
    await deleteThemePack(id)
    if (activePack?.id === id) setActivePack(null)
    if (editing?.id === id) setEditing(null)
    await refresh()
  }

  async function handleApply(pack: ThemePack | null) {
    await setActiveThemePack(LOCAL_PROFILE_ID, pack?.id ?? null)
    setActivePack(pack)
    setActiveId(pack?.id ?? null)
  }

  function handleExport(pack: ThemePack) {
    const blob = exportThemePack(pack)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pack.name.trim().replace(/\s+/g, '-').toLowerCase() || 'theme'}.aop-theme.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(file: File) {
    try {
      const pack = await importThemePackFromFile(file)
      await saveThemePack(pack)
      await refresh()
      setEditing(pack)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import theme pack')
    }
  }

  /** Persist an edit and, if it's the active pack, push the update live. */
  async function persist(next: ThemePack) {
    setEditing(next)
    const saved = await saveThemePack(next)
    if (activeId === saved.id) setActivePack(saved)
    setPacks((prev) => prev.map((p) => (p.id === saved.id ? saved : p)))
  }

  async function handleAssetUpload(
    pack: ThemePack,
    kind: ThemeAssetKind,
    contentId: string,
    file: File,
  ) {
    try {
      const asset = await processThemeAsset(file, kind)
      await persist({ ...pack, assets: { ...pack.assets, [assetKey(kind, contentId)]: asset } })
      setError(null)
    } catch (err) {
      setError(err instanceof ThemeAssetError ? err.message : 'Could not process file')
    }
  }

  function handleAssetClear(pack: ThemePack, kind: ThemeAssetKind, contentId: string) {
    const assets = { ...pack.assets }
    delete assets[assetKey(kind, contentId)]
    void persist({ ...pack, assets })
  }

  return (
    <div className="screen theme-screen">
      <div className="setup-content">
        <div className="setup-header">
          <h2>Theme Packs</h2>
          <button className="back-button" onClick={onBack}>
            ← Back
          </button>
        </div>

        {error && <p className="theme-error">{error}</p>}

        <div className="setup-section">
          <label className="section-label">Your Packs</label>
          <ul className="building-list">
            <li className="garrison-row">
              <span className="garrison-row__name">Default (no overrides)</span>
              <div className="garrison-row__actions">
                <button disabled={activeId === null} onClick={() => void handleApply(null)}>
                  {activeId === null ? 'Active' : 'Apply'}
                </button>
              </div>
            </li>
            {packs.map((p) => (
              <li key={p.id} className="garrison-row">
                <span className="garrison-row__name">{p.name}</span>
                <div className="garrison-row__actions">
                  <button disabled={activeId === p.id} onClick={() => void handleApply(p)}>
                    {activeId === p.id ? 'Active' : 'Apply'}
                  </button>
                  <button onClick={() => setEditing(p)}>Edit</button>
                  <button onClick={() => handleExport(p)}>Export</button>
                  <button className="danger" onClick={() => void handleDelete(p.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="button-group">
            <button className="secondary" onClick={() => void handleCreate()}>
              New Pack
            </button>
            <button className="secondary" onClick={() => importInputRef.current?.click()}>
              Import
            </button>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void handleImportFile(file)
            }}
          />
        </div>

        {editing && (
          <ThemePackEditor
            pack={editing}
            onRename={(name) => void persist({ ...editing, name })}
            onFactionName={(id: FactionId, value) =>
              void persist({ ...editing, factionNames: { ...editing.factionNames, [id]: value } })
            }
            onUnitName={(id, value) =>
              void persist({ ...editing, unitNames: { ...editing.unitNames, [id]: value } })
            }
            onShipName={(id, value) =>
              void persist({ ...editing, shipNames: { ...editing.shipNames, [id]: value } })
            }
            onAssetUpload={(kind, id, file) => void handleAssetUpload(editing, kind, id, file)}
            onAssetClear={(kind, id) => handleAssetClear(editing, kind, id)}
          />
        )}
      </div>
    </div>
  )
}
