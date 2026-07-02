#!/usr/bin/env node
// Stop hook: run the engine test suite when engine-affecting code changed this session.
// The engine's determinism/replay tests are the repo's core contract and run in <1s,
// so any change under packages/{engine,shared,content} triggers the full suite.
// Exit 2 (with stderr) blocks the stop and feeds failures back to the agent.
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

if (!/packages\/(engine|shared|content)\/.*\.tsx?/.test(changed)) process.exit(0)

try {
  execSync('pnpm --filter @aop/engine test', { encoding: 'utf8', stdio: 'pipe' })
} catch (err) {
  process.stderr.write(
    `Engine tests failed after engine-affecting changes:\n${err.stdout ?? ''}${err.stderr ?? ''}`,
  )
  process.exit(2)
}
process.exit(0)
