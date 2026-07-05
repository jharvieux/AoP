/**
 * Pure helpers for MapCanvas's default-art vs. theme-pack-override sprite
 * resolution (#73). Kept separate from MapCanvas so this logic — which
 * content id a given tile/city/encounter/ship maps to, and which URL wins —
 * is unit-testable without a Pixi/canvas environment.
 *
 * A theme pack override always wins when present; otherwise the caller's
 * default-art URL is used (which may itself be undefined, e.g. tile types
 * with no default art yet — #108). Ship sprites are keyed by SHIP_CLASSES id
 * to match the content id the Theme Packs editor already uses for ship name
 * and sprite overrides (apps/web/src/screens/ThemePackEditor.tsx); tiles,
 * cities, and encounters have no existing override convention yet, so they
 * get a namespaced id here to avoid ever colliding with a faction/unit/ship id.
 */

/** Theme-pack content id for a map tile type's sprite override. */
export function tileContentId(tileType: string): string {
  return `tile:${tileType}`
}

/** Theme-pack content id for a city sprite override, split by ownership. */
export function cityContentId(own: boolean): string {
  return own ? 'city:own' : 'city:enemy'
}

/** Theme-pack content id for an encounter kind's sprite override. */
export function encounterContentId(kind: string): string {
  return `encounter:${kind}`
}

/**
 * Resolve the sprite URL to actually render for one content id: the theme
 * pack's override (via `spriteUrl`, i.e. `useTheme().spriteUrl`) wins when
 * set, otherwise `defaultUrl`. Both an override and a default may be absent,
 * in which case the caller's flat-color Graphics fallback keeps rendering.
 */
export function resolveSpriteUrl(
  spriteUrl: (contentId: string) => string | undefined,
  contentId: string,
  defaultUrl: string | undefined,
): string | undefined {
  return spriteUrl(contentId) ?? defaultUrl
}
