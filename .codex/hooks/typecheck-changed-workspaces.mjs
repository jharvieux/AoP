#!/usr/bin/env node
// Stop hook: typecheck only the workspaces whose TypeScript files changed this session.
// Exit 2 (with stderr) blocks the stop and feeds the errors back to the agent.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

try {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  if (input.stop_hook_active) process.exit(0) // prevent feedback loops
} catch {
  /* no stdin — run anyway */
}

const changed = execSync('git status --porcelain && git diff --name-only HEAD', {
  encoding: 'utf8',
})
  .split('\n')
  .map((l) => l.replace(/^[ MADRCU?!]{2,3}/, '').trim())
  .filter((f) => /\.(ts|tsx)$/.test(f))

const dirs = new Set()
for (const f of changed) {
  const m = f.match(/^(packages|apps)\/([^/]+)\//)
  if (m) dirs.add(`${m[1]}/${m[2]}`)
}
if (dirs.size === 0) process.exit(0)

const failures = []
for (const dir of dirs) {
  let name
  try {
    name = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')).name
  } catch {
    continue
  }
  try {
    execSync(`pnpm --filter ${name} typecheck`, { encoding: 'utf8', stdio: 'pipe' })
  } catch (err) {
    failures.push(`--- ${name} ---\n${err.stdout ?? ''}${err.stderr ?? ''}`)
  }
}

if (failures.length > 0) {
  process.stderr.write(`Typecheck failed in changed workspaces:\n${failures.join('\n')}`)
  process.exit(2)
}
process.exit(0)
