import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  computeBuildHash,
  injectBuildHash,
  listFilesRecursive,
  SW_VERSION_PLACEHOLDER,
} from './swVersion'

describe('computeBuildHash', () => {
  it('is deterministic for the same file list', () => {
    const files = ['assets/index-abc123.js', 'assets/index-def456.css', 'index.html']
    expect(computeBuildHash(files)).toBe(computeBuildHash(files))
  })

  it('changes when the build output changes (new deploy -> new cache name)', () => {
    const before = ['assets/index-abc123.js', 'index.html']
    const after = ['assets/index-xyz789.js', 'index.html']
    expect(computeBuildHash(before)).not.toBe(computeBuildHash(after))
  })

  it('is order-sensitive so callers must pass a stable order', () => {
    const a = computeBuildHash(['a.js', 'b.js'])
    const b = computeBuildHash(['b.js', 'a.js'])
    expect(a).not.toBe(b)
  })
})

describe('injectBuildHash', () => {
  it('replaces every occurrence of the placeholder with the hash', () => {
    const source = `const CACHE_VERSION = '${SW_VERSION_PLACEHOLDER}'\n// ${SW_VERSION_PLACEHOLDER}`
    const out = injectBuildHash(source, 'deadbeef01')
    expect(out).toBe("const CACHE_VERSION = 'deadbeef01'\n// deadbeef01")
    expect(out).not.toContain(SW_VERSION_PLACEHOLDER)
  })

  it('throws if sw.js is missing the placeholder, so a bad edit fails the build loudly', () => {
    expect(() => injectBuildHash('const CACHE_VERSION = "v1"', 'deadbeef01')).toThrow(
      /missing the .* placeholder/,
    )
  })
})

describe('listFilesRecursive', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('lists nested files relative to the root, sorted', () => {
    dir = mkdtempSync(join(tmpdir(), 'sw-version-test-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), '')
    writeFileSync(join(dir, 'sw.js'), '')
    writeFileSync(join(dir, 'assets', 'index-abc.js'), '')

    expect(listFilesRecursive(dir)).toEqual(['assets/index-abc.js', 'index.html', 'sw.js'])
  })
})
