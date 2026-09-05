import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const harnessRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(harnessRoot, '../../../../..')
const bindingPath = join(harnessRoot, 'BINDING.json')

export const sourceHead = 'c1824f22bf14dca6d38f7519fd99affd789a8130'
export const sourceTree = '68b5529d91f15cdbfeeb0f612da5ee0c7ebd547d'
export const harnessPrefix = 'docs/art/map-ux-v2/tools/touch-recording/'

const shippingRoots = [
  'apps/web/src',
  'apps/web/public',
  'packages/content/src',
  'packages/engine/src',
  'packages/shared/src',
]

const buildInputPaths = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'apps/web/index.html',
  'apps/web/package.json',
  'apps/web/tsconfig.json',
]

export const harnessPaths = [
  `${harnessPrefix}README.md`,
  `${harnessPrefix}TouchRecordingUITests.swift`,
  `${harnessPrefix}check.mjs`,
  `${harnessPrefix}fixtureData.ts`,
  `${harnessPrefix}index.html`,
  `${harnessPrefix}runtime.tsx`,
  `${harnessPrefix}styles.d.ts`,
  `${harnessPrefix}styles.css`,
  `${harnessPrefix}tsconfig.json`,
  `${harnessPrefix}vite.config.ts`,
]

const fixture = {
  version: 'aop-613-touch-recording-v1',
  topology: 'square',
  dimensions: [12, 12],
  tile_size: 32,
  terrain: 'all-water-deep-and-shallows',
  captain: {
    id: 'captain-touch-recorder',
    owner_id: 'touch-recorder',
    position: [2, 7],
    movement_points: 1,
    max_movement_points: 4,
    preselected: true,
  },
  target: {
    position: [9, 7],
    one_based_label: 'column 10, row 8',
    empty: true,
    water_path_steps: 7,
    out_of_range: true,
    dom_label: 'Known course target at column 10, row 8',
    coordinate_policy:
      'After the real Fit to map control settles, shipping fitMapCamera and cellCenter compute the reticle centre; XCUITest derives its XCUIElement-normalized map coordinate from the reticle and map DOM frames.',
  },
}

function git(args, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding,
    maxBuffer: 64 * 1024 * 1024,
  })
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function regularFile(path) {
  const absolute = join(repoRoot, path)
  const details = lstatSync(absolute)
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`not a regular file: ${path}`)
  }
  return readFileSync(absolute)
}

function record(path) {
  const bytes = regularFile(path)
  return { path, bytes: bytes.length, sha256: sha256(bytes) }
}

function descriptor(files) {
  const serialized = JSON.stringify(files)
  return {
    algorithm: 'sha256',
    sha256: sha256(serialized),
    bytes: Buffer.byteLength(serialized),
  }
}

function listTarget(roots) {
  const output = git(['ls-tree', '-r', '--name-only', sourceHead, '--', ...roots]).trim()
  return output ? output.split('\n').sort() : []
}

function assertSourceBytes() {
  const drift = git([
    'diff',
    '--name-only',
    sourceHead,
    '--',
    ...shippingRoots,
    ...buildInputPaths,
  ]).trim()
  if (drift) throw new Error(`shipping/build bytes differ from source head:\n${drift}`)
}

function parseStatusPath(line) {
  const raw = line.slice(3)
  if (raw.includes(' -> ')) return raw.split(' -> ').at(-1).replace(/^"|"$/g, '')
  return raw.replace(/^"|"$/g, '')
}

function assertScope() {
  const committed = git(['diff', '--name-only', sourceHead, 'HEAD']).trim()
  const working = git(['status', '--porcelain=v1', '--untracked-files=all']).trimEnd()
  const paths = [
    ...(committed ? committed.split('\n') : []),
    ...(working ? working.split('\n').map(parseStatusPath) : []),
  ]
  const escaped = [...new Set(paths)].filter((path) => !path.startsWith(harnessPrefix))
  if (escaped.length)
    throw new Error(`worktree write escaped touch-harness scope:\n${escaped.join('\n')}`)
}

function assertFixtureContract() {
  const data = regularFile(`${harnessPrefix}fixtureData.ts`).toString('utf8')
  const runtime = regularFile(`${harnessPrefix}runtime.tsx`).toString('utf8')
  const xctest = regularFile(`${harnessPrefix}TouchRecordingUITests.swift`).toString('utf8')
  for (const expected of [sourceHead, sourceTree, fixture.version]) {
    if (!data.includes(expected)) throw new Error(`fixtureData.ts is missing binding ${expected}`)
  }
  for (const expected of [
    'MAP_WIDTH = 12',
    'MAP_HEIGHT = 12',
    'CAPTAIN_POSITION: Coord = { x: 2, y: 7 }',
    'COURSE_TARGET: Coord = { x: 9, y: 7 }',
    "topology: 'square'",
    "? 'shallows' : 'deep'",
    "id: 'captain-touch-recorder'",
    "VIEWER_ID = 'touch-recorder'",
    'ownerId: VIEWER_ID',
    'movementPoints: 1',
    'maxMovementPoints: 4',
    'findPath(MAP, CAPTAIN_POSITION, COURSE_TARGET)',
  ]) {
    if (!data.includes(expected)) throw new Error(`fixture data contract missing ${expected}`)
  }
  for (const expected of [
    'cities={[]}',
    'encounters={[]}',
    'parties={[]}',
    'landSites={[]}',
    'landEncounters={[]}',
    'selectedCaptainId={SELECTED_CAPTAIN.id}',
    'onSetCourse={(cell)',
    'cell.x !== COURSE_TARGET.x || cell.y !== COURSE_TARGET.y',
    'fitMapCamera({',
    "cellCenter('square', COURSE_TARGET.x, COURSE_TARGET.y, TILE_SIZE)",
    'data-canvas-normalized-x=',
    'data-canvas-normalized-y=',
  ]) {
    if (!runtime.includes(expected)) throw new Error(`fixture runtime contract missing ${expected}`)
  }
  for (const forbidden of ['applyAction(', 'createGame(', 'dispatchEvent(', 'PointerEvent(']) {
    if (runtime.includes(forbidden))
      throw new Error(`fixture runtime contains forbidden ${forbidden}`)
  }
  if (!xctest.includes('press(forDuration: 0.18, thenDragTo: dragEnd)')) {
    throw new Error('XCUITest is missing native press/drag')
  }
  if (!xctest.includes('map.pinch(withScale: 1.35, velocity: 1.0)')) {
    throw new Error('XCUITest is missing XCUIElement.pinch')
  }
  if ((xctest.match(/coursePoint\.tap\(\)/g) ?? []).length !== 2) {
    throw new Error('XCUITest must tap the mechanically derived course point exactly twice')
  }
  for (const expected of [
    'Course preview — tap again to set course',
    'Queued course confirmed — column 10, row 8',
  ]) {
    if (!xctest.includes(expected)) throw new Error(`XCUITest is missing assertion ${expected}`)
  }
  for (const forbidden of ['evaluateJavaScript(', 'dispatchEvent(', 'PointerEvent(']) {
    if (xctest.includes(forbidden)) throw new Error(`XCUITest contains forbidden ${forbidden}`)
  }
  if (fixture.captain.position.join(',') === fixture.target.position.join(',')) {
    throw new Error('course target is occupied by the selected captain')
  }
  if (fixture.target.water_path_steps <= fixture.captain.movement_points) {
    throw new Error('course target is not out of range')
  }
}

export function buildBinding() {
  assertScope()
  if (git(['rev-parse', `${sourceHead}^{commit}`]).trim() !== sourceHead) {
    throw new Error('source commit does not resolve exactly')
  }
  if (git(['rev-parse', `${sourceHead}^{tree}`]).trim() !== sourceTree) {
    throw new Error('source tree drift')
  }
  assertSourceBytes()
  assertFixtureContract()

  const sourcePaths = [...new Set([...listTarget(shippingRoots), ...buildInputPaths])].sort()
  const sourceFiles = sourcePaths.map(record)
  const fixtureFiles = harnessPaths.map(record)
  const result = {
    schema: 'aop-map-ux-touch-recording-harness-v1',
    issue: 613,
    status: 'harness-ready-recording-pending',
    source: {
      head: sourceHead,
      tree: sourceTree,
      policy:
        'All files under apps/web/src, engine/content/shared source, public runtime assets, and build inputs must remain byte-identical to the named source commit.',
      files: sourceFiles,
      material: descriptor(sourceFiles),
    },
    fixture: {
      ...fixture,
      files: fixtureFiles,
      material: descriptor(fixtureFiles),
    },
    server: {
      origin: 'http://127.0.0.1:4613',
      path: '/',
      cache_policy: 'no-store',
    },
    recording: {
      status: 'not-recorded',
      final_integrated_source_binding_required: true,
      test_asset: `${harnessPrefix}TouchRecordingUITests.swift`,
      gesture_authority: 'iPhone Simulator + XCTest public UI APIs',
      required_sequence: [
        'press-and-drag on shipping MapCanvas',
        'XCUIElement.pinch on shipping MapCanvas',
        'tap shipping Minimap',
        'tap shipping Center on fleet',
        'tap shipping Fit to map',
        'tap fit-derived empty out-of-range target twice',
        'assert dynamic shipping preview after tap one',
        'assert observable onSetCourse confirmation after tap two',
      ],
      browser_event_injection: false,
      direct_game_state_mutation: false,
      final_video: null,
    },
  }
  result.binding_sha256 = sha256(JSON.stringify(result))
  return result
}

export function validateBinding(candidate, expected = buildBinding()) {
  if (JSON.stringify(candidate) !== JSON.stringify(expected)) {
    throw new Error('touch-harness binding drift')
  }
  if (candidate.recording.status !== 'not-recorded' || candidate.recording.final_video !== null) {
    throw new Error('binding may not claim a recording')
  }
  if (!candidate.recording.final_integrated_source_binding_required) {
    throw new Error('final integrated source rebind must remain required')
  }
  if (
    candidate.recording.browser_event_injection ||
    candidate.recording.direct_game_state_mutation
  ) {
    throw new Error('recording protocol must use native input without direct game-state mutation')
  }
  return expected
}

function expectRejected(label, expected, mutate) {
  const candidate = structuredClone(expected)
  mutate(candidate)
  try {
    validateBinding(candidate, expected)
  } catch {
    return
  }
  throw new Error(`negative control accepted ${label}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const first = buildBinding()
  const second = buildBinding()
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error('touch-harness binding build is not deterministic')
  }
  if (process.argv.includes('--write')) {
    writeFileSync(bindingPath, `${JSON.stringify(first, null, 2)}\n`)
  } else {
    validateBinding(JSON.parse(readFileSync(bindingPath, 'utf8')), first)
  }
  expectRejected('source hash drift', first, (record) => {
    record.source.files[0].sha256 = '0'.repeat(64)
  })
  expectRejected('target occupation', first, (record) => {
    record.fixture.target.empty = false
  })
  expectRejected('fabricated event claim', first, (record) => {
    record.recording.browser_event_injection = true
  })
  expectRejected('premature recording claim', first, (record) => {
    record.recording.status = 'recorded'
  })
  console.log(
    `touch-harness PASS: ${first.source.files.length} exact-source files, ` +
      `${first.fixture.files.length} fixture files, binding ${first.binding_sha256}; ` +
      'determinism and negative controls PASS; final recording remains pending',
  )
}
