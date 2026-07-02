#!/usr/bin/env node
// PreToolUse hook (Edit|Write): enforces MEMORY.md append-only.
// New content may only PREPEND above existing entries: an Edit's new_string must end
// with its old_string verbatim; a Write's content must end with the current file
// content verbatim. Fails closed: any unexpected error blocks the edit (exit 2).
import { readFileSync } from 'node:fs'

function block(msg) {
  process.stderr.write(msg)
  process.exit(2)
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const filePath = input.tool_input?.file_path ?? ''
  if (!filePath.endsWith('/MEMORY.md') && filePath !== 'MEMORY.md') process.exit(0)

  if (input.tool_name === 'Edit') {
    const { old_string = '', new_string = '' } = input.tool_input
    if (input.tool_input.replace_all) {
      block('MEMORY.md is append-only: replace_all is not permitted.')
    }
    if (!new_string.endsWith(old_string)) {
      block(
        'MEMORY.md is append-only: new_string must end with old_string verbatim ' +
          '(prepend your new entry above the current newest entry header). ' +
          'Prior entries may not be edited without explicit user permission.',
      )
    }
  } else {
    // Write (or NotebookEdit fallthrough): full overwrite must preserve existing tail
    let existing = ''
    try {
      existing = readFileSync(filePath, 'utf8')
    } catch {
      process.exit(0) // file does not exist yet — initial creation is allowed
    }
    const content = input.tool_input?.content ?? ''
    if (!content.trimEnd().endsWith(existing.trimEnd())) {
      block(
        'MEMORY.md is append-only: written content must end with the current file ' +
          'content verbatim. Use Edit to prepend a new entry instead.',
      )
    }
  }
  process.exit(0)
} catch (err) {
  block(`MEMORY.md append-guard failed closed: ${err?.message ?? err}`)
}
