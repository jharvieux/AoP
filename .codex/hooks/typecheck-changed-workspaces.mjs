#!/usr/bin/env node
// Stop hook: typecheck only the workspaces whose TypeScript files changed this session.
// Exit 2 (with stderr) blocks the stop and feeds the errors back to the agent.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listChangedPaths } from './git-changes.mjs'

function finish() {
  process.stdout.write('{}')
  process.exit(0)
}

export function changedWorkspaceDirs(paths) {
  const dirs = new Set()
  for (const path of paths) {
    if (!/\.tsx?$/.test(path)) continue
    const match = path.match(/^(packages|apps)\/([^/]+)\//)
    if (match) dirs.add(`${match[1]}/${match[2]}`)
  }
  return [...dirs]
}

export function typecheckChangedWorkspaces({ cwd, paths, spawn = spawnSync }) {
  const failures = []
  for (const dir of changedWorkspaceDirs(paths)) {
    let name = dir
    try {
      name = JSON.parse(readFileSync(resolve(cwd, dir, 'package.json'), 'utf8')).name
      if (typeof name !== 'string' || name.length === 0) throw new Error('missing package name')
    } catch (error) {
      failures.push(`--- ${dir} ---\nCould not read package metadata: ${error.message}`)
      continue
    }

    const result = spawn('pnpm', ['--filter', name, 'typecheck'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (result.error || result.status !== 0) {
      failures.push(
        `--- ${name} ---\n${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`,
      )
    }
  }
  return failures
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
    const failures = typecheckChangedWorkspaces({ cwd, paths: listChangedPaths(cwd) })
    if (failures.length === 0) finish()
    process.stderr.write(`Typecheck failed in changed workspaces:\n${failures.join('\n')}`)
  } catch (error) {
    process.stderr.write(`Changed-workspace typecheck hook failed: ${error?.message ?? error}`)
  }
  process.exit(2)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
