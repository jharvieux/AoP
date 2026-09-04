// @ts-expect-error Vitest runs in Node; the browser app intentionally excludes Node ambient types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CSS_TOKEN_FALLBACKS } from './colorTokens'
import mapCanvasSource from './MapCanvas.tsx?raw'
import minimapSource from './Minimap.tsx?raw'
import mapEditorSource from './mapEditor/MapEditorCanvas.tsx?raw'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8') as string
const root = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? ''
const tokenConsumers = {
  'MapCanvas.tsx': mapCanvasSource,
  'Minimap.tsx': minimapSource,
  'mapEditor/MapEditorCanvas.tsx': mapEditorSource,
}

function rootValue(name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return root.match(new RegExp(`^\\s*${escaped}\\s*:\\s*([^;]+);`, 'm'))?.[1]?.trim()
}

describe('CSS-to-canvas color contract', () => {
  it('declares every bridged token with exactly its typed non-DOM fallback', () => {
    for (const [name, fallback] of Object.entries(CSS_TOKEN_FALLBACKS)) {
      expect(rootValue(name), name).toBe(fallback)
    }
  })

  it('keeps every literal cssToken call declared and equal to the typed fallback table', () => {
    const calls: Array<{ name: string; fallback: string; file: string }> = []
    for (const [file, source] of Object.entries(tokenConsumers)) {
      for (const match of source.matchAll(
        /cssToken\(\s*['"](?<name>--[^'"]+)['"]\s*,\s*['"](?<fallback>#[0-9a-f]+)['"]\s*\)/gi,
      )) {
        calls.push({
          name: match.groups?.name ?? '',
          fallback: match.groups?.fallback ?? '',
          file,
        })
      }
    }

    expect(calls).toHaveLength(40)
    for (const call of calls) {
      const expected = CSS_TOKEN_FALLBACKS[call.name as keyof typeof CSS_TOKEN_FALLBACKS]
      expect(expected, `${call.name} in ${call.file}`).toBe(call.fallback)
      expect(rootValue(call.name), `${call.name} in ${call.file}`).toBe(call.fallback)
    }
    expect(new Set(calls.map((call) => call.name))).toEqual(
      new Set(Object.keys(CSS_TOKEN_FALLBACKS)),
    )
  })

  it('locks the approved action, brass, highlight, and semantic-success roles', () => {
    expect(rootValue('--color-action')).toBe('#c8962c')
    expect(rootValue('--stroke-focus')).toBe('#c8962c')
    expect(rootValue('--color-brass')).toBe('#c9a227')
    expect(rootValue('--stroke-selected')).toBe('#c9a227')
    expect(rootValue('--color-highlight')).toBe('#f0cb66')
    expect(rootValue('--color-success')).toBe('#477447')
    expect(rootValue('--text-success')).toBe('#b8dab2')
    expect(rootValue('--map-own-unit')).toBe('#3be2a1')
    expect(CSS_TOKEN_FALLBACKS['--map-own-unit']).toBe('#3be2a1')
    expect(Object.hasOwn(CSS_TOKEN_FALLBACKS, '--color-success')).toBe(false)
    expect(rootValue('--accent')).toBeUndefined()
    expect(rootValue('--color-gold')).toBeUndefined()
  })

  it('declares the complete semantic scale families required by gameplay chrome', () => {
    for (const name of [
      '--surface-canvas',
      '--surface-panel',
      '--surface-raised',
      '--surface-inset',
      '--surface-overlay',
      '--surface-scrim',
      '--text-primary',
      '--text-secondary',
      '--text-muted',
      '--text-inverse',
      '--text-danger',
      '--text-warning',
      '--text-success',
      '--stroke-standard',
      '--stroke-emphasized',
      '--stroke-selected',
      '--stroke-focus',
      '--stroke-disabled',
      '--stroke-danger',
      '--color-rust',
      '--color-faction-emphasis',
      '--elevation-1',
      '--elevation-2',
      '--elevation-3',
      '--space-1',
      '--space-6',
      '--radius-1',
      '--radius-pill',
      '--type-display-size',
      '--type-title-size',
      '--type-body-size',
      '--type-label-size',
      '--type-caption-size',
      '--type-numeric-size',
      '--motion-fast',
      '--motion-standard',
      '--motion-emphasized',
      '--ease-standard',
      '--ease-emphasized',
    ]) {
      expect(rootValue(name), name).toBeDefined()
    }
  })
})
