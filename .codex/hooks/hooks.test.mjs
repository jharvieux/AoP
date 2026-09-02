import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parsePorcelainZ } from './git-changes.mjs'
import { typecheckChangedWorkspaces } from './typecheck-changed-workspaces.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const memoryHook = join(repoRoot, '.codex/hooks/block-memory-edits.mjs')

function runHook(script, input) {
  return spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
  })
}

function memoryPatch(body) {
  return `*** Begin Patch\n*** Update File: MEMORY.md\n@@\n${body}\n*** End Patch`
}

test('MEMORY guard accepts only a prepend anchored at the first existing line', () => {
  const firstLine = readFileSync(join(repoRoot, 'MEMORY.md'), 'utf8').split('\n')[0]
  const result = runHook(memoryHook, {
    cwd: repoRoot,
    tool_name: 'apply_patch',
    tool_input: {
      command: memoryPatch(`+## D-999 — test\n+\n+---\n+\n ${firstLine}`),
    },
  })

  assert.equal(result.status, 0, result.stderr)
})

test('MEMORY guard rejects insertion before a historical entry', () => {
  const result = runHook(memoryHook, {
    cwd: repoRoot,
    tool_name: 'apply_patch',
    tool_input: {
      command: memoryPatch(
        '+injected historical text\n ## D-001 — 2026-07-01 — Match-based async turns',
      ),
    },
  })

  assert.equal(result.status, 2)
  assert.match(result.stderr, /not anchored at the first existing line/)
})

test('MEMORY guard rejects historical trailing-whitespace changes', () => {
  const firstLine = readFileSync(join(repoRoot, 'MEMORY.md'), 'utf8').split('\n')[0]
  const result = runHook(memoryHook, {
    cwd: repoRoot,
    tool_name: 'apply_patch',
    tool_input: {
      command: memoryPatch(`+## D-999 — test\n ${firstLine}\n-old tail  \n+old tail`),
    },
  })

  assert.equal(result.status, 2)
  assert.match(result.stderr, /historical MEMORY\.md text may not be removed/)
})

test('MEMORY guard fails closed for malformed and obsolete hook input', () => {
  const malformed = runHook(memoryHook, '{')
  assert.equal(malformed.status, 2)

  const obsoleteEditShape = runHook(memoryHook, {
    tool_name: 'Edit',
    tool_input: {
      file_path: 'MEMORY.md',
      old_string: '## D-001',
      new_string: 'injected historical text\n## D-001',
    },
  })
  assert.equal(obsoleteEditShape.status, 2)
})

test('MEMORY guard blocks shell writes and permits simple read-only inspection', () => {
  const write = runHook(memoryHook, {
    tool_name: 'Bash',
    tool_input: { command: "printf 'replacement' > 'MEMORY.md'" },
  })
  assert.equal(write.status, 2)

  const scriptedWrite = runHook(memoryHook, {
    tool_name: 'Bash',
    tool_input: { command: `node -e "require('fs').writeFileSync('MEMORY.md','x')"` },
  })
  assert.equal(scriptedWrite.status, 2)

  const read = runHook(memoryHook, {
    tool_name: 'Bash',
    tool_input: { command: "rg '^## D-001' 'MEMORY.md'" },
  })
  assert.equal(read.status, 0, read.stderr)
})

test('porcelain -z parser preserves spaces and rename paths without Git quoting', () => {
  const paths = parsePorcelainZ(
    ' M packages/engine/src/a b.ts\0R  apps/web/src/new name.ts\0apps/web/src/old name.ts\0',
  )
  assert.deepEqual(paths, [
    'packages/engine/src/a b.ts',
    'apps/web/src/new name.ts',
    'apps/web/src/old name.ts',
  ])
})

test('workspace names are passed to pnpm as inert argument values', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'aop-hook-test-'))
  const workspace = join(cwd, 'packages/example')
  mkdirSync(workspace, { recursive: true })
  const packageName = '@aop/example; touch SHOULD_NOT_EXIST'
  writeFileSync(join(workspace, 'package.json'), JSON.stringify({ name: packageName }))

  const calls = []
  const failures = typecheckChangedWorkspaces({
    cwd,
    paths: ['packages/example/src/a b.ts'],
    spawn(file, args, options) {
      calls.push({ file, args, options })
      return { status: 0, stdout: '', stderr: '' }
    },
  })

  assert.deepEqual(failures, [])
  assert.equal(calls[0].file, 'pnpm')
  assert.deepEqual(calls[0].args, ['--filter', packageName, 'typecheck'])
  assert.equal(calls[0].options.cwd, cwd)
})

test('Stop hooks emit valid JSON and skip feedback loops', () => {
  for (const name of ['typecheck-changed-workspaces.mjs', 'run-affected-tests.mjs']) {
    const result = runHook(join(repoRoot, '.codex/hooks', name), { stop_hook_active: true })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {})
  }
})

test('hooks config uses supported canonical matcher names', () => {
  const config = JSON.parse(readFileSync(join(repoRoot, '.codex/hooks.json'), 'utf8'))
  assert.equal(config.hooks.PreToolUse[0].matcher, '^(Bash|apply_patch)$')
})
