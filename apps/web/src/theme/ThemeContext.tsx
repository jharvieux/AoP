import type { FactionId } from '@aop/shared'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { resolveAssetUrl, resolveFactionName, resolveShipName, resolveUnitName } from './resolve'
import { getActiveThemePackId, getThemePack, LOCAL_PROFILE_ID } from './storage'
import type { ThemePack } from './types'

interface ThemeContextValue {
  /** The active theme pack, or null if none is applied (pure default @aop/content presentation). */
  pack: ThemePack | null
  /** Apply (or clear, with `null`) a pack for the rest of this session — callers persist separately. */
  setActivePack: (pack: ThemePack | null) => void
  factionName: (id: FactionId, fallback: string) => string
  unitName: (id: string, fallback: string) => string
  shipName: (id: string, fallback: string) => string
  spriteUrl: (contentId: string) => string | undefined
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Loads whichever theme pack is active for the local profile (#64) on mount
 * and exposes name/asset resolvers to the rest of the tree. Purely
 * client-side presentation — nothing here reaches @aop/engine.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pack, setPack] = useState<ThemePack | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const activeId = await getActiveThemePackId(LOCAL_PROFILE_ID)
      if (!activeId) return
      const loaded = await getThemePack(activeId)
      if (!cancelled && loaded) setPack(loaded)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      pack,
      setActivePack: setPack,
      factionName: (id, fallback) => resolveFactionName(pack, id, fallback),
      unitName: (id, fallback) => resolveUnitName(pack, id, fallback),
      shipName: (id, fallback) => resolveShipName(pack, id, fallback),
      spriteUrl: (contentId) => resolveAssetUrl(pack, 'sprite', contentId),
    }),
    [pack],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
