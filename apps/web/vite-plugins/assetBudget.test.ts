import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  classifyAsset,
  evaluateAssetBudgets,
  listFilesRecursive,
  type AssetBudgets,
} from './assetBudget'

const budgets: AssetBudgets = {
  staticAssetBytes: 300,
  scriptOrStyleRawBytes: 800,
  scriptOrStyleGzipBytes: 200,
}

describe('classifyAsset', () => {
  it('treats .js, .mjs, and .css as script-or-style', () => {
    expect(classifyAsset('assets/index-abc123.js')).toBe('script-or-style')
    expect(classifyAsset('assets/vendor-def456.mjs')).toBe('script-or-style')
    expect(classifyAsset('assets/index-ghi789.css')).toBe('script-or-style')
    expect(classifyAsset('sw.js')).toBe('script-or-style')
  })

  it('treats everything else as a static asset', () => {
    expect(classifyAsset('audio/music/menu_theme.ogg')).toBe('static-asset')
    expect(classifyAsset('art/factions/pirates/unit_tier1.png')).toBe('static-asset')
    expect(classifyAsset('index.html')).toBe('static-asset')
  })
})

describe('evaluateAssetBudgets', () => {
  it('flags a static asset over budget', () => {
    const violations = evaluateAssetBudgets(
      [{ relativePath: 'audio/music/menu_theme.wav', bytes: 1_792_044 }],
      budgets,
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].relativePath).toBe('audio/music/menu_theme.wav')
  })

  it('does not flag a static asset over budget if it is allowlisted', () => {
    const violations = evaluateAssetBudgets(
      [{ relativePath: 'audio/music/menu_theme.wav', bytes: 1_792_044 }],
      budgets,
      new Set(['audio/music/menu_theme.wav']),
    )
    expect(violations).toHaveLength(0)
  })

  it('passes a static asset under budget', () => {
    const violations = evaluateAssetBudgets(
      [{ relativePath: 'audio/music/menu_theme.ogg', bytes: 200 }],
      budgets,
    )
    expect(violations).toHaveLength(0)
  })

  it('flags a script/style chunk over the raw budget even without an allowlist entry', () => {
    const violations = evaluateAssetBudgets(
      [{ relativePath: 'assets/index-abc123.js', bytes: 900, gzipBytes: 100 }],
      budgets,
      new Set(['assets/index-abc123.js']), // allowlist only applies to static assets
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].reason).toMatch(/raw exceeds/)
  })

  it('flags a script/style chunk over the gzip budget', () => {
    const violations = evaluateAssetBudgets(
      [{ relativePath: 'assets/index-abc123.js', bytes: 700, gzipBytes: 250 }],
      budgets,
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].reason).toMatch(/gzip exceeds/)
  })

  it('passes a script/style chunk under both budgets', () => {
    const violations = evaluateAssetBudgets(
      [{ relativePath: 'assets/index-abc123.js', bytes: 700, gzipBytes: 150 }],
      budgets,
    )
    expect(violations).toHaveLength(0)
  })
})

describe('listFilesRecursive', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('lists nested files relative to the root, sorted', () => {
    dir = mkdtempSync(join(tmpdir(), 'asset-budget-test-'))
    mkdirSync(join(dir, 'audio'))
    writeFileSync(join(dir, 'index.html'), '')
    writeFileSync(join(dir, 'sw.js'), '')
    writeFileSync(join(dir, 'audio', 'menu_theme.ogg'), '')

    expect(listFilesRecursive(dir)).toEqual(['audio/menu_theme.ogg', 'index.html', 'sw.js'])
  })
})
