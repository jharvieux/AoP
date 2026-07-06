import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

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
 * Build output falls into two budget categories: bundled JS/CSS (including sw.js, copied
 * verbatim from public/ but still code) is expected to be denser and is budgeted both raw
 * and gzipped; everything else (images, audio, fonts, ...) is a passthrough static asset
 * from public/ and is budgeted raw only, with per-file exceptions via the allowlist.
 */
export function classifyAsset(relativePath: string): 'script-or-style' | 'static-asset' {
  return /\.(m?js|css)$/i.test(relativePath) ? 'script-or-style' : 'static-asset'
}

export interface AssetFile {
  relativePath: string
  bytes: number
  /** Only computed (by the plugin) for `script-or-style` files — gzip is wasted work on
   * assets that are already compressed (images/audio) or too large to matter (art/audio
   * budgets are enforced on raw size instead). */
  gzipBytes?: number
}

export interface AssetBudgets {
  /** Per-file raw byte ceiling for a public/ passthrough asset (image, audio, font, ...). */
  staticAssetBytes: number
  /** Per-file raw byte ceiling for a built JS/CSS/service-worker chunk. */
  scriptOrStyleRawBytes: number
  /** Per-file gzip byte ceiling for a built JS/CSS/service-worker chunk. */
  scriptOrStyleGzipBytes: number
}

/**
 * Current baseline (see #253): main JS chunk is ~733 KB raw / ~217 KB gzip (no
 * code-splitting yet — pixi.js dominates it). These budgets give ~15-20% headroom above
 * that baseline so a dependency bump or new feature has to be a *meaningful* regression to
 * trip the guard, not a rounding error. The 300 KB static-asset ceiling matches #253's
 * "should ship compressed" bar: every asset in this repo that legitimately needs to be
 * larger is a named exception in asset-size-allowlist.json, not a silent one.
 */
export const DEFAULT_BUDGETS: AssetBudgets = {
  staticAssetBytes: 300 * 1024,
  scriptOrStyleRawBytes: 850 * 1024,
  scriptOrStyleGzipBytes: 260 * 1024,
}

export interface BudgetViolation {
  relativePath: string
  reason: string
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`
}

/**
 * Pure check: given the built output's file list and sizes, which ones bust their budget?
 * Static assets can be exempted per-path via `allowlist` (see
 * apps/web/asset-size-allowlist.json); script/style budgets have no allowlist — they're a
 * single project-wide ceiling.
 */
export function evaluateAssetBudgets(
  files: readonly AssetFile[],
  budgets: AssetBudgets,
  allowlist: ReadonlySet<string> = new Set(),
): BudgetViolation[] {
  const violations: BudgetViolation[] = []
  for (const file of files) {
    if (classifyAsset(file.relativePath) === 'static-asset') {
      if (allowlist.has(file.relativePath)) continue
      if (file.bytes > budgets.staticAssetBytes) {
        violations.push({
          relativePath: file.relativePath,
          reason: `${kb(file.bytes)} exceeds the ${kb(budgets.staticAssetBytes)} static-asset budget (add a reasoned entry to asset-size-allowlist.json if this is intentional)`,
        })
      }
      continue
    }
    if (file.bytes > budgets.scriptOrStyleRawBytes) {
      violations.push({
        relativePath: file.relativePath,
        reason: `${kb(file.bytes)} raw exceeds the ${kb(budgets.scriptOrStyleRawBytes)} bundle budget`,
      })
    }
    if (file.gzipBytes != null && file.gzipBytes > budgets.scriptOrStyleGzipBytes) {
      violations.push({
        relativePath: file.relativePath,
        reason: `${kb(file.gzipBytes)} gzip exceeds the ${kb(budgets.scriptOrStyleGzipBytes)} gzip bundle budget`,
      })
    }
  }
  return violations
}

function loadAllowlist(allowlistUrl: URL): ReadonlySet<string> {
  try {
    const raw = readFileSync(allowlistUrl, 'utf-8')
    return new Set(Object.keys(JSON.parse(raw) as Record<string, string>))
  } catch {
    return new Set()
  }
}

/**
 * Vite plugin (#253): after the build writes `dist/`, checks every emitted file against
 * DEFAULT_BUDGETS and fails the build (`vite build`, which `pnpm build`/CI already runs)
 * if anything is over budget without a named exception. This is the "CI guard" from #253
 * — implemented as a build-time check rather than a separate workflow step, since
 * `.github/workflows/**` is a supervised path (see CLAUDE.md) and `pnpm build` already
 * runs in CI on every push/PR.
 */
export function assetBudgetPlugin(budgets: AssetBudgets = DEFAULT_BUDGETS): Plugin {
  let outDir = 'dist'
  return {
    name: 'aop-asset-budget',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const allowlist = loadAllowlist(new URL('../asset-size-allowlist.json', import.meta.url))
      const files: AssetFile[] = listFilesRecursive(outDir).map((relativePath) => {
        const abs = join(outDir, relativePath)
        const bytes = statSync(abs).size
        if (classifyAsset(relativePath) === 'script-or-style') {
          return { relativePath, bytes, gzipBytes: gzipSync(readFileSync(abs)).length }
        }
        return { relativePath, bytes }
      })
      const violations = evaluateAssetBudgets(files, budgets, allowlist)
      if (violations.length > 0) {
        const lines = violations.map((v) => `  - ${v.relativePath}: ${v.reason}`).join('\n')
        throw new Error(`Asset size budget exceeded (#253):\n${lines}`)
      }
    },
  }
}
