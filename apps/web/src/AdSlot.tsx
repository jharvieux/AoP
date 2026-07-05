import { useEffect, useRef, useState } from 'react'
import { resolveAdNetworkConfig } from './monetization/adConfig'
import { isNativePlatform } from './monetization/iap'
import { useRemoveAds } from './monetization/useRemoveAds'

export type AdPlacement = 'between-turns' | 'match-end'

interface AdSlotProps {
  /**
   * Where this slot is mounted. Per docs/ARCHITECTURE.md §9, ad placements are
   * limited to between turns and the match-end screen — never mount this
   * inside a combat/encounter sheet or any mid-combat UI.
   */
  placement: AdPlacement
}

/**
 * The single ad-integration point for the whole app (docs/ARCHITECTURE.md §9):
 * every other screen renders `<AdSlot placement="…">` and never talks to an ad
 * SDK directly, so integrating a real network later touches this one file.
 *
 * Renders nothing when:
 * - the viewer holds the `remove_ads` entitlement,
 * - running natively until AdMob is wired in via Capacitor (#42 hasn't landed
 *   a native project or plugin yet), or
 * - running on web with no ad network configured, or the loader script fails.
 *
 * Every failure mode is "render nothing" — never a broken placeholder box.
 */
export function AdSlot({ placement }: AdSlotProps) {
  const removeAds = useRemoveAds()
  const native = isNativePlatform()
  const adConfig = resolveAdNetworkConfig()
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (removeAds || native || !adConfig || failed) return
    const container = containerRef.current
    if (!container) return

    const script = document.createElement('script')
    script.src = adConfig.scriptUrl
    script.async = true
    script.dataset.adSlot = adConfig.slotId
    script.onerror = () => setFailed(true)
    container.appendChild(script)
    return () => {
      script.remove()
    }
    // native/adConfig/failed only ever change identity when their underlying
    // value changes (adConfig is a fresh object per render, but its fields are
    // stable for a given build), so this stays a mount-time effect in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removeAds, native, failed])

  if (removeAds || failed) return null
  // AdMob banner wiring lands once #42's Capacitor project + plugin exist.
  if (native) return null
  if (!adConfig) return null

  return (
    <div
      ref={containerRef}
      className={`ad-slot ad-slot--${placement}`}
      data-ad-slot={adConfig.slotId}
      aria-hidden="true"
    />
  )
}
