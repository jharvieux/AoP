#!/usr/bin/env node
// Stop hook: run the engine test suite when engine-affecting code changed this session.
// The engine's determinism/replay tests are the repo's core contract and run in <1s,
// so any change under packages/{engine,shared,content} triggers the full suite.
// Exit 2 (with stderr) blocks the stop and feeds failures back to the agent.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listChangedPaths } from './git-changes.mjs'

function finish() {
  process.stdout.write('{}')
  process.exit(0)
}

function main() {
  let input = {}
  try {
    const text = readFileSync(0, 'utf8')
    if (text) input = JSON.parse(text)
  } catch {
    // A manually invoked hook may not have stdin; verification still runs.
  }
  if (input.stop_hook_active) finish()

  try {
    const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd()
    const changed = listChangedPaths(cwd)
    if (!changed.some((path) => /^packages\/(engine|shared|content)\/.*\.tsx?$/.test(path))) {
      finish()
    }

    const result = spawnSync('pnpm', ['--filter', '@aop/engine', 'test'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (!result.error && result.status === 0) finish()
    process.stderr.write(
      `Engine tests failed after engine-affecting changes:\n${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`,
    )
  } catch (error) {
    process.stderr.write(`Affected-test hook failed: ${error?.message ?? error}`)
  }
  process.exit(2)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
}
