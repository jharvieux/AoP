import type { FactionId } from '@aop/shared'

export type ThemeAssetKind = 'sprite' | 'audio'

/** A stored, size-capped override asset, inlined as a data URL for IndexedDB storage. */
export interface ThemeAsset {
  kind: ThemeAssetKind
  dataUrl: string
  mimeType: string
  /** Original file name, kept only for display in the editor. */
  fileName: string
}

/**
 * A cosmetic overlay keyed by @aop/content ids (#64). Purely additive: any
 * id not present here falls back to the default @aop/content name/asset.
 * The engine never sees this — it's resolved at render time in this UI layer
 * only, so it can never affect determinism, replays, saves, or multiplayer
 * authority.
 */
export interface ThemePack {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** Faction display-name overrides, keyed by FactionId. */
  factionNames: Partial<Record<FactionId, string>>
  /** Troop-type display-name overrides, keyed by unit id (@aop/content FACTIONS[x].units). */
  unitNames: Record<string, string>
  /** Ship-class display-name overrides, keyed by ship class id (@aop/content SHIP_CLASSES). */
  shipNames: Record<string, string>
  /** Sprite/audio overrides, keyed by {@link assetKey}. */
  assets: Record<string, ThemeAsset>
}

/** Build the `assets` lookup key for a given content id + asset kind. */
export function assetKey(kind: ThemeAssetKind, contentId: string): string {
  return `${kind}:${contentId}`
}

export function createEmptyThemePack(name: string, id: string, now: number): ThemePack {
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    factionNames: {},
    unitNames: {},
    shipNames: {},
    assets: {},
  }
}
