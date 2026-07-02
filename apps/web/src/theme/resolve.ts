import type { FactionId } from '@aop/shared'
import { assetKey, type ThemeAssetKind, type ThemePack } from './types'

/**
 * Pure name/asset resolution: contentId -> override -> default. These never
 * touch the DOM or IndexedDB, so they're safe to call on every render.
 */

function overrideOrFallback(override: string | undefined, fallback: string): string {
  const trimmed = override?.trim()
  return trimmed ? trimmed : fallback
}

export function resolveFactionName(
  pack: ThemePack | null,
  factionId: FactionId,
  fallback: string,
): string {
  return overrideOrFallback(pack?.factionNames[factionId], fallback)
}

export function resolveUnitName(pack: ThemePack | null, unitId: string, fallback: string): string {
  return overrideOrFallback(pack?.unitNames[unitId], fallback)
}

export function resolveShipName(pack: ThemePack | null, shipId: string, fallback: string): string {
  return overrideOrFallback(pack?.shipNames[shipId], fallback)
}

/** The overridden sprite/audio data URL for a content id, or undefined to fall back to default art. */
export function resolveAssetUrl(
  pack: ThemePack | null,
  kind: ThemeAssetKind,
  contentId: string,
): string | undefined {
  return pack?.assets[assetKey(kind, contentId)]?.dataUrl
}
