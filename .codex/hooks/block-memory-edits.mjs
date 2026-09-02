#!/usr/bin/env node
// PreToolUse guardrail for the repository-root MEMORY.md.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { basename, isAbsolute, join, normalize, resolve } from 'node:path'

const BLOCK_MESSAGE =
  'MEMORY.md is append-only. Prepend a complete entry at the start with apply_patch; ' +
  'do not edit historical text or write MEMORY.md through the shell.'

function deny(message = BLOCK_MESSAGE) {
  process.stderr.write(message)
  process.exit(2)
}

function repositoryRoot(cwd) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function unquotePath(value) {
  const path = value.trim()
  const quote = path[0]
  if ((quote === '"' || quote === "'") && path.at(-1) === quote) return path.slice(1, -1)
  return path
}

function isRootMemoryPath(value, cwd, root) {
  const path = unquotePath(value)
  const absolute = normalize(isAbsolute(path) ? path : resolve(cwd, path))
  return absolute === normalize(join(root, 'MEMORY.md'))
}

function splitPatchSections(command) {
  const lines = command.split('\n').map((line) => line.replace(/\r$/, ''))
  if (lines[0] !== '*** Begin Patch' || lines.at(-1) !== '*** End Patch') {
    throw new Error('malformed apply_patch envelope')
  }

  const sections = []
  let section
  for (const line of lines.slice(1, -1)) {
    const header = line.match(/^\*\*\* (Update|Add|Delete) File: (.+)$/)
    if (header) {
      section = { operation: header[1], path: header[2], lines: [] }
      sections.push(section)
      continue
    }
    if (/^\*\*\* (Move to|End of File)/.test(line)) {
      if (!section) throw new Error('patch directive appears before a file header')
      section.lines.push(line)
      continue
    }
    if (!section) throw new Error('patch content appears before a file header')
    section.lines.push(line)
  }
  return sections
}

function validateRootPrepend(section, existing) {
  if (section.operation !== 'Update') throw new Error('MEMORY.md must already exist')

  const hunkMarkers = section.lines.filter((line) => line.startsWith('@@'))
  if (hunkMarkers.length !== 1 || hunkMarkers[0] !== '@@') {
    throw new Error('MEMORY.md updates require one hunk anchored at the file start')
  }

  const markerIndex = section.lines.indexOf('@@')
  const body = section.lines.slice(markerIndex + 1)
  if (markerIndex !== 0 || body.length === 0) throw new Error('invalid MEMORY.md prepend hunk')

  let sawAddition = false
  let sawContext = false
  const context = []
  for (const line of body) {
    if (line.startsWith('-')) throw new Error('historical MEMORY.md text may not be removed')
    if (line.startsWith('+')) {
      if (sawContext) throw new Error('new MEMORY.md text may only appear before existing text')
      sawAddition = true
      continue
    }
    if (!line.startsWith(' ')) throw new Error('unsupported MEMORY.md patch directive')
    sawContext = true
    context.push(line.slice(1))
  }

  if (!sawAddition || !sawContext) throw new Error('prepend must add text before existing text')
  const existingLines = existing.split('\n').map((line) => line.replace(/\r$/, ''))
  if (context[0] !== existingLines[0]) {
    throw new Error('MEMORY.md prepend is not anchored at the first existing line')
  }
  for (let index = 0; index < context.length; index += 1) {
    if (context[index] !== existingLines[index]) {
      throw new Error('MEMORY.md context must preserve the existing prefix verbatim')
    }
  }
}

function tokenizeReadOnlyCommand(command) {
  const tokens = []
  let token = ''
  let quote = ''

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (quote) {
      if (char === quote) {
        quote = ''
      } else {
        if (quote === '"' && (char === '$' || char === '`')) return null
        token += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (token) tokens.push(token)
      token = ''
      continue
    }
    if ('|&;<>()$`'.includes(char) || char === '\\') return null
    token += char
  }
  if (quote) return null
  if (token) tokens.push(token)
  return tokens
}

function isClearlyReadOnlyMemoryCommand(command) {
  const tokens = tokenizeReadOnlyCommand(command)
  if (!tokens?.length) return false

  const executable = basename(tokens[0])
  if (['cat', 'grep', 'head', 'nl', 'rg', 'tail', 'wc'].includes(executable)) return true
  if (executable === 'sed') {
    return (
      tokens.some((token) => /^-[A-Za-z]*n[A-Za-z]*$/.test(token)) &&
      !tokens.some((token) => token === '-i' || token.startsWith('--in-place'))
    )
  }
  if (executable !== 'git') return false

  const subcommand = tokens.slice(1).find((token) => !token.startsWith('-'))
  return ['diff', 'grep', 'log', 'show', 'status'].includes(subcommand)
}

function commandReferencesMemory(command) {
  return /(?:^|[\s'"=/:])MEMORY\.md(?:$|[\s'"<>|;&])/.test(command)
}

export function checkHookInput(input) {
  const toolName = input?.tool_name
  const command = input?.tool_input?.command
  if (typeof toolName !== 'string' || typeof command !== 'string') {
    throw new Error('expected tool_name and tool_input.command strings')
  }

  if (toolName === 'Bash') {
    if (commandReferencesMemory(command) && !isClearlyReadOnlyMemoryCommand(command)) {
      throw new Error(BLOCK_MESSAGE)
    }
    return
  }
  if (toolName !== 'apply_patch') return

  const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd()
  const root = repositoryRoot(cwd)
  const sections = splitPatchSections(command)
  const memorySections = sections.filter((section) => isRootMemoryPath(section.path, cwd, root))
  if (memorySections.length === 0) return
  if (memorySections.length !== 1) throw new Error('MEMORY.md may appear only once per patch')

  const existing = readFileSync(join(root, 'MEMORY.md'), 'utf8')
  validateRootPrepend(memorySections[0], existing)
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  checkHookInput(input)
  process.exit(0)
} catch (error) {
  deny(`MEMORY.md append guard blocked the tool call: ${error?.message ?? error}`)
}
