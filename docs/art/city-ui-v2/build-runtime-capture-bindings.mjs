import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { format, resolveConfig } = require('prettier')

const docsDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(docsDir, '../../..')
const bindingPath = resolve(docsDir, 'RUNTIME-CAPTURE-BINDINGS.json')
const receiptPath = resolve(docsDir, 'RUNTIME-CAPTURE-RECEIPT.json')
const recordPath = resolve(docsDir, 'RUNTIME-CAPTURES.md')
const sourceHead = 'c1824f22bf14dca6d38f7519fd99affd789a8130'
const priorCaptureSourceHead = 'a5a8fd5f8c522ebddfb146510b492bcea1c28ee2'
const historicalApprovedSourceHead = '45a206f760eacce50dc8dd1dc656c5d4e789cb3c'
const pendingStatus = 'captured-pending-direct-operator-approval'
const historicalApproval = {
  status: 'historical-source-only',
  sourceHead: historicalApprovedSourceHead,
  evidenceHead: 'dc11b60738f4f14b896532bf2db323b2bd054f5c',
  record: 'https://github.com/jharvieux/AoP/issues/612#issuecomment-5551752344',
  reusable: false,
}
const supersededCapture = {
  sourceHead: priorCaptureSourceHead,
  recordHead: 'b64ae4c02c3c31342e1fbf70f87b9c07203f86d2',
  bindingSha256: 'd2959600f4ded5ea3357990a355e2faec6e167b27928d065a70a4de77c5a66db',
  approval: { status: 'pending-direct-operator-approval', record: null },
  reusable: false,
}

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function readRegular(path) {
  const details = lstatSync(path)
  assert(details.isFile() && !details.isSymbolicLink(), `expected regular file: ${path}`)
  return readFileSync(path)
}

function repoPath(path) {
  const absolute = resolve(repoRoot, path)
  assert(absolute.startsWith(`${repoRoot}${sep}`), `path escapes repository: ${path}`)
  return absolute
}

function record(path) {
  const bytes = readRegular(repoPath(path))
  return { bytes: bytes.length, sha256: sha256(bytes) }
}

function parseArgs(args) {
  assert(
    args.length === 4 && args[0] === '--proposal' && args[2] === '--inspection-confirmation',
    'usage: --proposal /absolute/proposal.json --inspection-confirmation INTEGRATION_OWNER_INSPECTED_EXACT_CITY_PIXELS',
  )
  assert(resolve(args[1]) === args[1], 'proposal path must be absolute and canonical')
  assert(
    args[3] === 'INTEGRATION_OWNER_INSPECTED_EXACT_CITY_PIXELS',
    'inspection confirmation mismatch',
  )
  return JSON.parse(readRegular(args[1]))
}

const proposal = parseArgs(process.argv.slice(2))
assert(proposal.schema === 1, 'unexpected proposal schema')
assert(proposal.kind === 'unapproved-city-runtime-evidence-proposal', 'unexpected proposal kind')
assert(proposal.sourceHead === sourceHead, 'proposal source head drift')
assert(proposal.supersededCaptureHead === sourceHead, 'proposal superseded capture head drift')
assert(proposal.targetCount === 28 && proposal.uniqueBrowserFrames === 22, 'proposal count drift')
assert(
  proposal.approval?.status === 'pending-direct-operator-approval' &&
    proposal.approval.record === null,
  'proposal must remain unapproved',
)

const proposalCaptures = new Map(proposal.captures.map((entry) => [entry.path, entry]))
const binding = JSON.parse(readRegular(bindingPath))
const receipt = JSON.parse(readRegular(receiptPath))

execFileSync('git', ['merge-base', '--is-ancestor', sourceHead, 'HEAD'], { cwd: repoRoot })
for (const entry of binding.sourceFiles) {
  const committed = execFileSync('git', ['show', `${sourceHead}:${entry.path}`], {
    cwd: repoRoot,
    encoding: 'buffer',
  })
  const worktree = readRegular(repoPath(entry.path))
  assert(committed.equals(worktree), `${entry.path}: worktree differs from target source`)
}

binding.sourceHead = sourceHead
binding.captureSourceHead = sourceHead
binding.captureStatus = pendingStatus
binding.approval = { status: 'pending-direct-operator-approval', evidenceHead: null, record: null }
binding.historicalApproval = historicalApproval
binding.supersededCapture = supersededCapture
binding.sourceTransition = {
  classification: 'exact-source-recaptured-pending-approval',
  renderedMarkupChanged: true,
  stylesChanged: true,
  artChanged: false,
  recaptured: true,
}
binding.sourceFiles = binding.sourceFiles.map((entry) => ({ ...entry, ...record(entry.path) }))
binding.captures = binding.captures.map((entry) => {
  const proposalEntry = proposalCaptures.get(entry.path)
  assert(proposalEntry, `proposal omitted ${entry.path}`)
  const observed = record(entry.path)
  assert(
    proposalEntry.bytes === observed.bytes && proposalEntry.sha256 === observed.sha256,
    `${entry.path}: retained capture differs from proposal`,
  )
  return {
    ...entry,
    ...observed,
    requiredVisibleText: proposalEntry.requiredVisibleText,
    requireNoSemanticTextOverflow: proposalEntry.requireNoSemanticTextOverflow,
  }
})

receipt.sourceHead = sourceHead
receipt.captureStatus = pendingStatus
receipt.capturedOn = proposal.capturedOn
receipt.captureOrigin = {
  ...proposal.captureOrigin,
  sourceHead,
  visualSettleInspection: 'completed-by-integration-owner',
  nativeSizeInspection: 'completed-by-integration-owner',
}
receipt.sourceTransition = {
  from: priorCaptureSourceHead,
  to: sourceHead,
  classification: 'exact-source-recaptured-pending-approval',
  changedBehavior:
    'Final narrow-phone Defense status wrapping and command-dock containment changed shared city presentation after the superseded unapproved capture wave.',
  renderedMarkupChanged: true,
  stylesChanged: true,
  artChanged: false,
  recaptured: true,
}
receipt.checkpoints.checkpoint2 = {
  status: 'pending-direct-operator-approval',
  scope:
    'Exact-source recapture and native-size review complete; direct approval for these pixels pending',
  evidenceHead: null,
  record: null,
  historicalApproval,
  supersededCapture,
}
receipt.coverage.semanticTextEvidence = proposal.captures
  .filter((entry) => entry.requireNoSemanticTextOverflow)
  .map((entry) => ({
    path: entry.path,
    requiredVisibleText: entry.requiredVisibleText,
    requireNoSemanticTextOverflow: true,
  }))

const bindingConfig = (await resolveConfig(bindingPath)) ?? {}
writeFileSync(
  bindingPath,
  await format(JSON.stringify(binding), { ...bindingConfig, filepath: bindingPath }),
)
const receiptConfig = (await resolveConfig(receiptPath)) ?? {}
writeFileSync(
  receiptPath,
  await format(JSON.stringify(receipt), { ...receiptConfig, filepath: receiptPath }),
)

const captureRecords = new Map(
  binding.captures.map((entry) => [entry.path.split('/').at(-1), entry]),
)
const report = readRegular(recordPath)
  .toString('utf8')
  .replaceAll(priorCaptureSourceHead, sourceHead)
  .replace(
    /^(\| `([^`]+\.jpg)`\s+\|.*?\|\s*)([\d,]+)(\s+\|\s+`)([a-f0-9]{64})(`\s+\|)$/gm,
    (line, prefix, name, _bytes, separator, _digest, suffix) => {
      const entry = captureRecords.get(name)
      if (!entry) throw new Error(`capture table contains undeclared file: ${name}`)
      return `${prefix}${entry.bytes.toLocaleString('en-US')}${separator}${entry.sha256}${suffix}`
    },
  )
assert(
  [...captureRecords.keys()].every((name) => report.includes(`\`${name}\``)),
  'capture table is missing a declared file',
)
const reportConfig = (await resolveConfig(recordPath)) ?? {}
writeFileSync(recordPath, await format(report, { ...reportConfig, filepath: recordPath }))

console.log(
  `bound ${binding.captures.length} exact-source captures and ${binding.sourceFiles.length} source files; direct operator approval remains pending`,
)
