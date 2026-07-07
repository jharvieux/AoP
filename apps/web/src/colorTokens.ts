/**
 * Bridges the CSS custom-property design tokens declared in styles.css
 * `:root` into contexts that can't consume `var(...)` directly — Pixi's
 * canvas/WebGL renderer (MapCanvas.tsx) and the map editor's Canvas2D
 * context both need a resolved color string up front, not a live CSS
 * reference (#301).
 *
 * Read once at module-init time so those render layers stay sourced from
 * the same palette as the DOM instead of maintaining their own hardcoded
 * hex fork. The fallback is the value that was hardcoded here before the
 * token migration, so behavior is unchanged wherever the stylesheet hasn't
 * loaded yet (e.g. plain `vitest run` in a node environment with no
 * `document`).
 */
export function cssToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}
