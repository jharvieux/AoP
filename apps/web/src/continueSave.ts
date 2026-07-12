import type { SaveRecord } from './storage'

/**
 * The save Continue on the main menu should resume (#451) — whichever save,
 * autosave or a manual slot, has the newest `savedAt`. A player who manually
 * saved after the last autosave expects Continue to pick that one up, not
 * always default to the autosave slot.
 */
export function mostRecentSave(saves: SaveRecord[]): SaveRecord | undefined {
  return saves.reduce<SaveRecord | undefined>(
    (latest, save) => (!latest || save.savedAt > latest.savedAt ? save : latest),
    undefined,
  )
}
