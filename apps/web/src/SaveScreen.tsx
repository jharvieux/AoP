import { useEffect, useState } from 'react'
import { listSaves, type SaveRecord } from './storage'
import { BottomSheet } from './components/BottomSheet'
import { hapticTap } from './haptics'

const MANUAL_SLOTS = ['slot-1', 'slot-2', 'slot-3']

interface SaveScreenProps {
  onClose: () => void
  onSave: (slotId: string) => Promise<void>
  onLoad: (slotId: string) => void
  /** Opens the #146 replay viewer over a saved slot's action log, without
   * disturbing the game currently in progress. */
  onWatch: (slotId: string) => void
}

function formatSlot(record: SaveRecord | undefined): string {
  if (!record) return 'Empty'
  return `Round ${record.round} — ${new Date(record.savedAt).toLocaleString()}`
}

/** Bottom-sheet save/load menu: one autosave slot plus three manual slots. */
export function SaveScreen({ onClose, onSave, onLoad, onWatch }: SaveScreenProps) {
  const [records, setRecords] = useState<Record<string, SaveRecord>>({})

  function refresh() {
    listSaves().then((saves) => {
      setRecords(Object.fromEntries(saves.map((s) => [s.slotId, s])))
    })
  }

  useEffect(refresh, [])

  async function handleSave(slotId: string) {
    hapticTap()
    await onSave(slotId)
    refresh()
  }

  function handleLoad(slotId: string) {
    hapticTap()
    onLoad(slotId)
  }

  function handleWatch(slotId: string) {
    hapticTap()
    onWatch(slotId)
  }

  function slotRow(slotId: string, title: string, saveable: boolean) {
    const record = records[slotId]
    return (
      <li key={slotId} className="garrison-row">
        <span className="garrison-row__name">{title}</span>
        <span className="garrison-row__counts">{formatSlot(record)}</span>
        <div className="garrison-row__actions">
          {saveable && <button onClick={() => handleSave(slotId)}>Save</button>}
          <button disabled={!record} onClick={() => handleLoad(slotId)}>
            Load
          </button>
          <button disabled={!record} onClick={() => handleWatch(slotId)}>
            Watch
          </button>
        </div>
      </li>
    )
  }

  return (
    <BottomSheet title="Save & Load" onClose={onClose}>
      <section>
        <ul className="building-list">
          {slotRow('autosave', 'Autosave (end of every turn)', false)}
          {MANUAL_SLOTS.map((id, i) => slotRow(id, `Slot ${i + 1}`, true))}
        </ul>
      </section>
    </BottomSheet>
  )
}
