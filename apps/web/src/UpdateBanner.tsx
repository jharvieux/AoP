import { useEffect, useState } from 'react'
import { registerServiceWorker } from './registerServiceWorker'

/** Prompts the player to reload when a new deployed version is ready offline. */
export function UpdateBanner() {
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null)

  useEffect(() => {
    registerServiceWorker((apply) => setApplyUpdate(() => apply))
  }, [])

  if (!applyUpdate) return null

  return (
    <div className="update-banner">
      <span>A new version is ready.</span>
      <button onClick={applyUpdate}>Reload</button>
    </div>
  )
}
