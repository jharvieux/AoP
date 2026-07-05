import { MAP_VALIDATION_LIMITS } from '@aop/content'
import { validateMapDefinition } from '@aop/engine'
import type { CommunityMapSummary } from '@aop/shared'
import { useState } from 'react'
import { useAuth } from '../auth'
import { resolveSupabaseConfig } from '../auth/config'
import { draftToMapDefinition } from './draft'
import { decodeMapCode, encodeMapCode } from './encode'
import { CommunityLibraryClient } from './libraryClient'
import type { EditorDraft } from './types'

interface CommunityLibraryPanelProps {
  draft: EditorDraft
  /** Whether the current draft passes engine validation — gates Publish. */
  draftValid: boolean
  onImport: (draft: EditorDraft) => void
}

/**
 * The community map library (#63 Tier 2), embedded in the map editor sidebar:
 * publish the current draft, search/browse published maps, download one into
 * the editor, report a bad map, remove your own. All policy is server-side
 * (see the community-map Edge Functions); a downloaded code still goes through
 * the same local decode + engine-validate path as a hand-pasted Tier-1 code
 * before it replaces the draft.
 */
export function CommunityLibraryPanel({ draft, draftValid, onImport }: CommunityLibraryPanelProps) {
  const auth = useAuth()
  const config = resolveSupabaseConfig()
  const [maps, setMaps] = useState<CommunityMapSummary[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (auth.state.status !== 'authenticated' || !config) {
    return (
      <div className="setup-section">
        <label className="section-label">Community Library</label>
        <p className="map-editor-hint">Sign in from Account to browse and publish shared maps.</p>
      </div>
    )
  }
  const session = auth.state.session
  const client = new CommunityLibraryClient(config)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function loadFirstPage() {
    void run(async () => {
      const page = await client.browse(session, { search })
      setMaps(page.maps)
      setNextBefore(page.nextBefore)
      setLoaded(true)
    })
  }

  function loadNextPage() {
    if (nextBefore === null) return
    void run(async () => {
      const page = await client.browse(session, { search, before: nextBefore })
      setMaps((prev) => [...prev, ...page.maps])
      setNextBefore(page.nextBefore)
    })
  }

  function handlePublish() {
    void run(async () => {
      const { mapId } = await client.publish(session, {
        mapCode: encodeMapCode(draft),
        name: draft.name,
      })
      setNotice(`Published "${draft.name}" (${mapId}).`)
    })
  }

  function handleDownload(mapId: string) {
    void run(async () => {
      const downloaded = await client.download(session, mapId)
      const imported = decodeMapCode(downloaded.mapCode)
      const result = validateMapDefinition(draftToMapDefinition(imported), MAP_VALIDATION_LIMITS)
      if (!result.valid) {
        // Should be impossible (publish re-validates server-side) — fail loud, not silent.
        setError(`Downloaded map failed validation: ${result.errors[0]?.message ?? 'unknown'}`)
        return
      }
      onImport(imported)
      setNotice(`Loaded "${imported.name}" into the editor.`)
    })
  }

  function handleReport(mapId: string) {
    const reason = prompt('Why report this map? (optional)')
    if (reason === null) return // cancelled
    void run(async () => {
      await client.report(session, mapId, reason.trim() === '' ? undefined : reason)
      setNotice('Report filed — thanks. Maps with multiple reports are hidden for review.')
    })
  }

  function handleRemove(mapId: string) {
    if (!confirm('Remove this map from the community library?')) return
    void run(async () => {
      await client.remove(session, mapId)
      setMaps((prev) => prev.filter((m) => m.mapId !== mapId))
      setNotice('Map removed from the library.')
    })
  }

  return (
    <div className="setup-section">
      <label className="section-label">Community Library</label>
      <div className="button-group">
        <button
          className="secondary"
          disabled={busy || !draftValid}
          title={draftValid ? undefined : 'Fix validation errors before publishing'}
          onClick={handlePublish}
        >
          Publish Current Map
        </button>
      </div>
      <div className="button-group">
        <input
          className="map-editor-name-input"
          value={search}
          placeholder="Search maps…"
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="secondary" disabled={busy} onClick={loadFirstPage}>
          {loaded ? 'Refresh' : 'Browse'}
        </button>
      </div>
      {error && <p className="map-editor-error">{error}</p>}
      {notice && <p className="map-editor-status">{notice}</p>}
      {loaded && maps.length === 0 && <p className="map-editor-hint">No published maps found.</p>}
      {maps.length > 0 && (
        <ul className="building-list">
          {maps.map((m) => (
            <li key={m.mapId} className="garrison-row">
              <span className="garrison-row__name">
                {m.name} — {m.authorName}
              </span>
              <span className="garrison-row__counts">
                {m.width}×{m.height} · {m.playerCount}p · {m.downloadCount} downloads
              </span>
              <div className="garrison-row__actions">
                <button disabled={busy} onClick={() => handleDownload(m.mapId)}>
                  Download
                </button>
                {m.authorId === session.user.id ? (
                  <button className="danger" disabled={busy} onClick={() => handleRemove(m.mapId)}>
                    Remove
                  </button>
                ) : (
                  <button disabled={busy} onClick={() => handleReport(m.mapId)}>
                    Report
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {nextBefore !== null && (
        <div className="button-group">
          <button className="secondary" disabled={busy} onClick={loadNextPage}>
            Load more
          </button>
        </div>
      )}
    </div>
  )
}
