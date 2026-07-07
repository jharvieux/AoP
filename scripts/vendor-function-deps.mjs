#!/usr/bin/env node
// `supabase functions deploy` (and the containers behind `supabase start`) can only see
// files under `supabase/functions/`. The `@aop/*` import map in
// `supabase/functions/deno.json` points at `packages/*/src`, which lives outside that
// tree — fine for `supabase start`'s containers (they mount the whole repo) but a hard
// "module not found" for a real deploy, whose bundler (Docker- or API-based) never gets
// those files (#339). This copies the TS sources those functions need into
// `supabase/functions/_vendor/`, which deno.json points at instead, so both paths resolve
// the same files.
//
// Usage: `node scripts/vendor-function-deps.mjs`. Run before `supabase start` and before
// `supabase functions deploy` (wired into both in package.json / deploy.yml).

import { cpSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const VENDOR_ROOT = path.join(REPO_ROOT, 'supabase/functions/_vendor')
const PACKAGES = ['shared', 'engine', 'content']

// Deno requires explicit extensions on relative specifiers; the source packages use the
// bundler-style extensionless imports Vite/tsc resolve elsewhere in the monorepo, so the
// vendored copies get their `from './foo'` specifiers rewritten to `from './foo.ts'`.
function addTsExtensions(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      addTsExtensions(full)
      continue
    }
    if (!entry.endsWith('.ts')) continue
    const rewritten = readFileSync(full, 'utf8').replace(
      /from '(\.\.?\/[^']+)'/g,
      (match, specifier) =>
        /\.(ts|js|mjs|tsx|jsx|json)$/.test(specifier) ? match : `from '${specifier}.ts'`,
    )
    writeFileSync(full, rewritten)
  }
}

rmSync(VENDOR_ROOT, { recursive: true, force: true })

for (const pkg of PACKAGES) {
  cpSync(path.join(REPO_ROOT, 'packages', pkg, 'src'), path.join(VENDOR_ROOT, pkg), {
    recursive: true,
    filter: (src) => !src.endsWith('.test.ts'),
  })
}
addTsExtensions(VENDOR_ROOT)

console.log(`Vendored ${PACKAGES.join(', ')} into supabase/functions/_vendor/`)
