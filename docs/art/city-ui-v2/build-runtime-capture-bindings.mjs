import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'

const docsDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(docsDir, '../../..')
const bindingPath = resolve(docsDir, 'RUNTIME-CAPTURE-BINDINGS.json')
const recordPath = resolve(docsDir, 'RUNTIME-CAPTURES.md')
const sourceHead = '45a206f760eacce50dc8dd1dc656c5d4e789cb3c'

const record = (path) => {
  const bytes = readFileSync(resolve(root, path))
  return {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

const binding = JSON.parse(readFileSync(bindingPath, 'utf8'))
binding.sourceHead = sourceHead
binding.captureSourceHead = sourceHead
binding.captureStatus = 'approved'
binding.sourceTransition = {
  ...binding.sourceTransition,
  classification: 'exact-source-recaptured-approved',
  recaptured: true,
}
binding.sourceFiles = binding.sourceFiles.map((entry) => ({
  ...entry,
  ...record(entry.path),
}))
binding.captures = binding.captures.map((entry) => ({
  ...entry,
  ...record(entry.path),
}))

const prettierConfig = (await resolveConfig(bindingPath)) ?? {}
writeFileSync(
  bindingPath,
  await format(JSON.stringify(binding), { ...prettierConfig, filepath: bindingPath }),
)

const captureRecords = new Map(
  binding.captures.map((entry) => [entry.path.split('/').at(-1), entry]),
)
const report = readFileSync(recordPath, 'utf8').replace(
  /^(\| `([^`]+\.jpg)`\s+\|.*?\|\s*)([\d,]+)(\s+\|\s+`)([a-f0-9]{64})(`\s+\|)$/gm,
  (line, prefix, name, _bytes, separator, _digest, suffix) => {
    const entry = captureRecords.get(name)
    if (!entry) throw new Error(`capture table contains undeclared file: ${name}`)
    return `${prefix}${entry.bytes.toLocaleString('en-US')}${separator}${entry.sha256}${suffix}`
  },
)
if ([...captureRecords.keys()].some((name) => !report.includes(`\`${name}\``))) {
  throw new Error('capture table is missing a declared file')
}
const reportConfig = (await resolveConfig(recordPath)) ?? {}
writeFileSync(recordPath, await format(report, { ...reportConfig, filepath: recordPath }))
console.log(
  `bound ${binding.captures.length} captures to ${binding.sourceFiles.length} exact-source files`,
)
