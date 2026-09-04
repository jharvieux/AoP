/**
 * Non-DOM values for every color bridged into Pixi or Canvas2D. Literal types
 * make a mismatched call-site fallback a compile error; colorTokens.test.ts
 * separately proves that these values equal the `:root` declarations.
 */
export const CSS_TOKEN_FALLBACKS = {
  '--color-alert-border': '#e23b3b',
  '--color-brass': '#c9a227',
  '--color-deep-water': '#1b4a6b',
  '--color-fog': '#0b1a26',
  '--color-merchant': '#e0b64f',
  '--color-success': '#3be2a1',
  '--color-text-on-gold': '#1a1408',
  '--color-white': '#ffffff',
  '--map-course-later': '#5c7a94',
  '--map-course-now': '#e0b64f',
  '--map-cursor': '#ffe66d',
  '--map-encounter-natives': '#6fbf73',
  '--map-encounter-settlers': '#c98bdb',
  '--map-enemy-city': '#9aa0a6',
  '--map-land': '#4a7c3f',
  '--map-land-encounter-bandit': '#c2603a',
  '--map-land-encounter-hermit': '#8f7fd0',
  '--map-land-encounter-village': '#7fae5a',
  '--map-land-site-lumber': '#6f8f4a',
  '--map-land-site-mine': '#d9b64a',
  '--map-land-site-ruins': '#b8a98f',
  '--map-land-site-sawmill': '#8a9b58',
  '--map-range-ally': '#3f7d54',
  '--map-range-enemy': '#a6402f',
  '--map-range-neutral': '#b8912f',
  '--map-resource-rum': '#b23bd8',
  '--map-resource-timber': '#8a5a2b',
  '--map-sand': '#cdb87e',
  '--map-shallows': '#2a6a8f',
  '--map-shore': '#2c4a33',
  '--map-surf': '#bfe6f2',
} as const

export type CssTokenName = keyof typeof CSS_TOKEN_FALLBACKS

/** Resolve a CSS color for a renderer that cannot consume `var(...)`. */
export function cssToken<Name extends CssTokenName>(
  name: Name,
  fallback: (typeof CSS_TOKEN_FALLBACKS)[Name],
): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}
