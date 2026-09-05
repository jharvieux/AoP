import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const harnessRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(harnessRoot, '../../../../..')
const fixtures = JSON.parse(readFileSync(join(harnessRoot, 'fixtures.json'), 'utf8'))
const renewal = JSON.parse(
  readFileSync(join(repoRoot, 'docs/art/city-ui-v2/RUNTIME-EVIDENCE-RENEWAL.json'), 'utf8'),
)
const maxCaptureBytes = 300 * 1024
const historicalRecordHeads = new Map(
  renewal.sets
    .filter((set) => ['city-ui-v2', 'city-harbor-v2'].includes(set.id))
    .map((set) => [set.id, set.historicalBinding.recordHead]),
)

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function outsideRepository(path, label) {
  assert(isAbsolute(path), `${label} must be absolute`)
  const absolute = resolve(path)
  assert(
    absolute !== repoRoot && !absolute.startsWith(`${repoRoot}${sep}`),
    `${label} must remain outside the repository`,
  )
  return absolute
}

function regularBytes(path) {
  const details = lstatSync(path)
  assert(details.isFile() && !details.isSymbolicLink(), `expected regular file: ${path}`)
  return readFileSync(path)
}

function inspectJpeg(bytes, label) {
  assert(bytes.length <= maxCaptureBytes, `${label}: exceeds 300 KiB`)
  assert(bytes[0] === 0xff && bytes[1] === 0xd8, `${label}: missing JPEG SOI`)
  assert(bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9, `${label}: missing JPEG EOI`)
  let offset = 2
  let jfif = false
  let frame
  while (offset + 4 <= bytes.length) {
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const length = bytes.readUInt16BE(offset)
    assert(length >= 2 && offset + length <= bytes.length, `${label}: invalid JPEG segment`)
    if (marker === 0xe0 && bytes.subarray(offset + 2, offset + 7).toString() === 'JFIF\0') {
      jfif = true
    }
    if (marker === 0xc0) {
      frame = {
        precision: bytes[offset + 2],
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
        components: bytes[offset + 7],
      }
      break
    }
    offset += length
  }
  assert(jfif && frame, `${label}: expected baseline JFIF`)
  assert(frame.precision === 8 && frame.components === 3, `${label}: expected 8-bit RGB JPEG`)
  return frame
}

function parseArgs(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    assert(flag?.startsWith('--') && value !== undefined, `invalid argument: ${flag}`)
    assert(!values.has(flag), `duplicate argument: ${flag}`)
    values.set(flag, value)
  }
  const expected = ['--stage-root', '--output', '--captured-on', '--confirmation']
  assert(
    values.size === expected.length && expected.every((flag) => values.has(flag)),
    `required arguments: ${expected.join(', ')}`,
  )
  assert(/^\d{4}-\d{2}-\d{2}$/.test(values.get('--captured-on')), 'invalid capture date')
  assert(
    values.get('--confirmation') === 'VALIDATE_UNAPPROVED_CITY_RUNTIME_EVIDENCE',
    'confirmation mismatch',
  )
  return values
}

const values = parseArgs(process.argv.slice(2))
const stageRoot = outsideRepository(values.get('--stage-root'), 'stage root')
const output = outsideRepository(values.get('--output'), 'output')
assert(realpathSync(stageRoot) === stageRoot, 'stage root must be canonical')

const expectedBySet = new Map([
  ['city-ui-v2', new Set()],
  ['city-harbor-v2', new Set()],
])
for (const capture of fixtures.captures) {
  for (const target of capture.targets) {
    const match = target.match(
      /^docs\/art\/(city-ui-v2|city-harbor-v2)\/runtime-captures\/([^/]+)$/,
    )
    assert(match, `${capture.id}: invalid target`)
    expectedBySet.get(match[1]).add(match[2])
  }
}
for (const [setId, expected] of expectedBySet) {
  const actual = readdirSync(join(stageRoot, setId, 'runtime-captures')).sort()
  assert(
    JSON.stringify(actual) === JSON.stringify([...expected].sort()),
    `${setId}: staged inventory drift`,
  )
}

const entries = []
const byTarget = new Map()
for (const capture of fixtures.captures) {
  const [width, height] = capture.viewport
  const sharedBytes = []
  for (const target of capture.targets) {
    const match = target.match(
      /^docs\/art\/(city-ui-v2|city-harbor-v2)\/runtime-captures\/([^/]+)$/,
    )
    const stagedPath = join(stageRoot, match[1], 'runtime-captures', match[2])
    const bytes = regularBytes(stagedPath)
    const frame = inspectJpeg(bytes, stagedPath)
    assert(
      frame.width === width && frame.height === height,
      `${capture.id}: expected ${width}x${height}, got ${frame.width}x${frame.height}`,
    )
    const historical = execFileSync(
      'git',
      ['show', `${historicalRecordHeads.get(match[1])}:${target}`],
      { cwd: repoRoot, encoding: 'buffer' },
    )
    assert(
      sha256(bytes) !== sha256(historical),
      `${capture.id}: staged bytes equal the historical capture; historical bytes cannot be reused`,
    )
    const entry = {
      captureId: capture.id,
      path: target,
      bytes: bytes.length,
      sha256: sha256(bytes),
      dimensions: [width, height],
      encoding: 'jpeg-rgb-jfif-baseline',
      state: capture.state,
      zoom: capture.zoom,
      panel: capture.panel,
      focus: capture.focus,
    }
    entries.push(entry)
    byTarget.set(target, entry)
    sharedBytes.push(bytes)
  }
  if (sharedBytes.length === 2) {
    assert(sharedBytes[0].equals(sharedBytes[1]), `${capture.id}: cross-set copies differ`)
  }
}

const proposal = {
  schema: 1,
  kind: 'unapproved-city-runtime-evidence-proposal',
  issue: 613,
  sourceHead: fixtures.targetSourceHead,
  capturedOn: values.get('--captured-on'),
  uniqueBrowserFrames: fixtures.captures.length,
  targetCount: entries.length,
  sharedCrossSetCopies: fixtures.captures.filter((capture) => capture.targets.length === 2).length,
  captures: [...byTarget.values()].sort((a, b) => a.path.localeCompare(b.path)),
  captureOrigin: {
    workflow: 'truthful shipping-component import harness with visible shipping controls',
    harness: 'docs/art/city-ui-v2/tools/runtime-harness',
    browser: 'Codex in-app Browser (Chromium version not exposed)',
    faction: 'pirates',
    programmaticFontOrImageAwaitClaimed: false,
    visualSettleInspection: 'pending-integration-owner-confirmation',
    nativeSizeInspection: 'pending-integration-owner-confirmation',
  },
  approval: { status: 'pending-direct-operator-approval', record: null },
}
assert(proposal.targetCount === 28, 'proposal target count drift')
writeFileSync(output, `${JSON.stringify(proposal, null, 2)}\n`, { flag: 'wx' })
console.log(
  `PASS staged city evidence: ${proposal.uniqueBrowserFrames} fresh frames -> ${proposal.targetCount} RGB/JFIF targets; wrote ${output}`,
)
