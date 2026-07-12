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

import type { FactionId } from '@aop/shared'

/** Theme-pack content id for a map tile type's sprite override. */
export function tileContentId(tileType: string): string {
  return `tile:${tileType}`
}

/**
 * Theme-pack content id for an autotile variant (#354). When autotile art is
 * added, theme packs can override per-variant edge sprites keyed like
 * `tile:land:edge:1`, `tile:land:edge:2`, etc. (variant 0 is the base tile,
 * variants 1-15 represent edge patterns from marching squares).
 * If the pack doesn't define a specific variant, the base tile is used.
 */
export function tileAutotileId(tileType: string, variant: number): string {
  return variant > 0 ? `tile:${tileType}:edge:${variant}` : `tile:${tileType}`
}

/** Theme-pack content id for a city sprite override, split by ownership. */
export function cityContentId(own: boolean): string {
  return own ? 'city:own' : 'city:enemy'
}

/** Theme-pack content id for an encounter kind's sprite override. */
export function encounterContentId(kind: string): string {
  return `encounter:${kind}`
}

/** Theme-pack content id for a city building's sprite override (#447). */
export function buildingContentId(buildingId: string): string {
  return `building:${buildingId}`
}

/** Theme-pack content id for the city scene's backdrop image override (#447). */
export function cityBackdropContentId(): string {
  return 'cityScene:backdrop'
}

/**
 * Theme-pack content id for a faction's flag sprite override (#459). Faction
 * ids are already the sprite-override key the Theme Packs editor uses for
 * faction art (`ThemePackEditor`'s "Factions" section, #64), so this follows
 * the unnamespaced convention ship sprites use (keyed directly by
 * SHIP_CLASSES id) rather than the `tile:`/`city:`/`encounter:`/`building:`
 * namespaced ids above.
 */
export function factionFlagContentId(factionId: FactionId): string {
  return factionId
}

/**
 * Theme-pack content id for a landing party's map-token sprite override (#482).
 * Namespaced (unlike `factionFlagContentId`) because a faction's flag and its party
 * token are two different pieces of art that both key off the same faction id — an
 * unnamespaced id would collide the two override slots.
 */
export function partyContentId(factionId: FactionId): string {
  return `party:${factionId}`
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
