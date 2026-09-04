/** Verify and print a capture-baseline proposal without changing repository files. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  assertRuntimeCaptureProposalRepository,
  bindingPath,
  materialBaselinePath,
  prepareRuntimeCaptureBaselineProposal,
  repoRoot,
} from './runtime-capture-bindings.mjs'

const values = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index]
  const value = process.argv[index + 1]
  if (!flag?.startsWith('--') || value === undefined) throw new Error(`invalid argument: ${flag}`)
  values.set(flag, value)
}
const expectedFlags = ['--source-head', '--capture-record', '--captured-on', '--confirmation']
if (
  values.size !== expectedFlags.length ||
  expectedFlags.some((flag) => !values.has(flag)) ||
  [...values.keys()].some((flag) => !expectedFlags.includes(flag))
) {
  throw new Error(
    `usage: node renew-runtime-capture-baseline.mjs ${expectedFlags.map((flag) => `${flag} <value>`).join(' ')}`,
  )
}
if (values.get('--confirmation') !== 'VERIFY_CAPTURE_RENEWAL_PROPOSAL') {
  throw new Error('proposal requires --confirmation VERIFY_CAPTURE_RENEWAL_PROPOSAL')
}

const requestedHead = values.get('--source-head')
const captureRecord = values.get('--capture-record')
const commentMatch = captureRecord.match(
  /^https:\/\/github\.com\/jharvieux\/AoP\/issues\/610#issuecomment-(\d+)$/,
)
if (!commentMatch) {
  throw new Error('proposal requires a canonical github.com/jharvieux/AoP issue #610 comment URL')
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const fileDigests = () => ({
  baseline: sha256(readFileSync(materialBaselinePath)),
  binding: sha256(readFileSync(bindingPath)),
})
const runGit = (args, options = {}) =>
  execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  }).trim()
const readRepositoryState = () => {
  const statusPorcelain = runGit(['status', '--porcelain=v1', '--untracked-files=all'])
  if (statusPorcelain !== '') {
    throw new Error('capture proposal requires a completely clean tracked and untracked worktree')
  }
  let sparseCheckout = false
  try {
    sparseCheckout = runGit(['config', '--bool', '--get', 'core.sparseCheckout']) === 'true'
  } catch {
    // An unset Git boolean means this is a normal, non-sparse checkout.
  }
  if (sparseCheckout) throw new Error('capture proposal does not permit a sparse checkout')
  const currentHead = runGit(['rev-parse', 'HEAD'])
  const branch = runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'])
  const upstreamRef = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
  const upstreamHead = runGit(['rev-parse', '@{upstream}'])
  const originUrl = runGit(['remote', 'get-url', 'origin'])
  const hostedBranchHead = runGit([
    'ls-remote',
    '--exit-code',
    'origin',
    `refs/heads/${branch}`,
  ]).split(/\s+/)[0]
  const pullRequest = JSON.parse(
    execFileSync(
      'gh',
      [
        'pr',
        'view',
        branch,
        '--repo',
        'jharvieux/AoP',
        '--json',
        'headRefName,headRefOid,headRepositoryOwner,state,url',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    ),
  )
  if (
    pullRequest.headRefName !== branch ||
    pullRequest.headRepositoryOwner?.login !== 'jharvieux' ||
    pullRequest.state !== 'OPEN' ||
    !/^https:\/\/github\.com\/jharvieux\/AoP\/pull\/\d+$/.test(pullRequest.url)
  ) {
    throw new Error('capture proposal current branch is not the canonical hosted PR head branch')
  }
  const state = {
    sourceHead: requestedHead,
    currentHead,
    statusPorcelain,
    sparseCheckout,
    branch,
    upstreamRef,
    upstreamHead,
    hostedBranchHead,
    hostedPrHead: pullRequest.headRefOid,
    originUrl,
  }
  assertRuntimeCaptureProposalRepository(state)
  return state
}

const before = fileDigests()
const firstState = readRepositoryState()
let comment
try {
  comment = JSON.parse(
    execFileSync(
      'gh',
      ['api', '--hostname', 'github.com', `repos/jharvieux/AoP/issues/comments/${commentMatch[1]}`],
      { cwd: repoRoot, encoding: 'utf8' },
    ),
  )
} catch (error) {
  throw new Error(`capture proposal comment could not be resolved through GitHub API: ${error}`)
}
const secondState = readRepositoryState()
if (JSON.stringify(firstState) !== JSON.stringify(secondState)) {
  throw new Error('capture proposal repository state changed while resolving external evidence')
}

const proposal = prepareRuntimeCaptureBaselineProposal({
  sourceHead: requestedHead,
  captureRecord,
  capturedOn: values.get('--captured-on'),
  confirmation: values.get('--confirmation'),
  comment,
})
for (const record of proposal.bound_files) {
  let committed
  try {
    committed = execFileSync('git', ['show', `${requestedHead}:${record.path}`], {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    throw new Error(
      `capture proposal bound file is not present at exact HEAD: ${record.path}: ${error}`,
    )
  }
  if (committed.byteLength !== record.bytes || sha256(committed) !== record.sha256) {
    throw new Error(`capture proposal worktree bytes differ from exact HEAD: ${record.path}`)
  }
}
const finalState = readRepositoryState()
if (JSON.stringify(secondState) !== JSON.stringify(finalState)) {
  throw new Error('capture proposal repository state changed while verifying exact committed bytes')
}
const after = fileDigests()
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error('proposal-only utility changed the retained baseline or generated binding')
}
const { bound_files: _boundFiles, ...printedProposal } = proposal
console.log(
  JSON.stringify(
    {
      ...printedProposal,
      repository: {
        branch: finalState.branch,
        local_head: finalState.currentHead,
        upstream_head: finalState.upstreamHead,
        hosted_branch_head: finalState.hostedBranchHead,
        hosted_pr_head: finalState.hostedPrHead,
      },
      no_write_guard: { before, after },
      manual_next_step:
        'Do not treat this output or the opaque comment as autonomous authorization. After direct trusted-user approval, a reviewer must compare the comment body to these facts and apply any baseline change manually with apply_patch.',
    },
    null,
    2,
  ),
)
