import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/** Placeholder in public/sw.js that gets replaced with the real build hash at build time. */
export const SW_VERSION_PLACEHOLDER = '__AOP_BUILD_HASH__'

/** Lists every file under `dir` (recursively), relative to `dir`, in a stable sorted order. */
export function listFilesRecursive(dir: string): string[] {
  const out: string[] = []
  const walk = (sub: string) => {
    for (const entry of readdirSync(join(dir, sub))) {
      const rel = sub ? `${sub}/${entry}` : entry
      const abs = join(dir, rel)
      if (statSync(abs).isDirectory()) walk(rel)
      else out.push(rel)
    }
  }
  walk('')
  return out.sort()
}

/**
 * Deterministic short hash derived from the set of built output filenames. Vite already
 * content-hashes JS/CSS chunk names, so hashing the sorted file list changes whenever the
 * build output changes — new deploy, new hash, new service-worker cache name — without
 * needing to read every file's bytes.
 */
export function computeBuildHash(files: readonly string[]): string {
  return createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 10)
}

/** Replaces the version placeholder in the service worker source with the real build hash. */
export function injectBuildHash(swSource: string, hash: string): string {
  if (!swSource.includes(SW_VERSION_PLACEHOLDER)) {
    throw new Error(`sw.js is missing the ${SW_VERSION_PLACEHOLDER} placeholder`)
  }
  return swSource.replaceAll(SW_VERSION_PLACEHOLDER, hash)
}

/**
 * Vite plugin: after the build writes dist/sw.js (copied verbatim from public/ since Vite
 * doesn't fingerprint publicDir files), stamps it with a hash of the build output. That
 * gives every deploy a fresh cache name, which makes the existing activate-handler cleanup
 * prune the previous deploy's cache and lets UpdateBanner's updatefound flow fire — both of
 * which previously only happened on a manual CACHE_VERSION bump. See sw.js and #242.
 */
export function swVersionPlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'aop-sw-version',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const swPath = join(outDir, 'sw.js')
      let source: string
      try {
        source = readFileSync(swPath, 'utf-8')
      } catch {
        return // no sw.js emitted in this build — nothing to stamp
      }
      const files = listFilesRecursive(outDir).filter((f) => f !== 'sw.js')
      const hash = computeBuildHash(files)
      writeFileSync(swPath, injectBuildHash(source, hash), 'utf-8')
    },
  }
}
