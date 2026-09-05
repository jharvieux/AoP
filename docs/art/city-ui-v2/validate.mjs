import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCS_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(DOCS_DIR, '../../..')
const SOURCE_HEAD = '45a206f760eacce50dc8dd1dc656c5d4e789cb3c'
const CAPTURE_SOURCE_HEAD = SOURCE_HEAD
const PRIOR_CAPTURE_SOURCE_HEAD = '59c82c623dc046c68cec53548903e69af09456a8'
const ENGINE_VERSION = '850a9013b70e38a7'
const CAPTURE_ROOT = 'docs/art/city-ui-v2/runtime-captures'
const MAX_CAPTURE_BYTES = 300 * 1024

const EXPECTED_STATES = [
  { id: 'starting', round: 1, visibleBuildings: 2 },
  { id: 'midgame', round: 13, visibleBuildings: 8 },
  { id: 'full', round: 54, visibleBuildings: 14 },
]

const EXPECTED_BREAKPOINTS = [
  { id: 'phone-320', width: 320, height: 568 },
  { id: 'phone-375', width: 375, height: 812 },
  { id: 'phone-430', width: 430, height: 932 },
  { id: 'tablet-768', width: 768, height: 1024 },
  { id: 'landscape-844', width: 844, height: 390 },
  { id: 'desktop-1440', width: 1440, height: 900 },
]

const EXPECTED_SOURCES = {
  'apps/web/src/App.test.ts': [
    4125,
    'fa7b1e07500689d1ec7ca2996cc290cace370cd98c9b1afce5f7febd08964cb5',
  ],
  'apps/web/src/App.tsx': [
    18715,
    '127da1e279878d3176ea78dfb13309391f077bfa999df9dc6be759dbec913762',
  ],
  'apps/web/src/CityScene.test.tsx': [
    29321,
    'a12d568b4789c810421219bac84408902e7f208f719d66e9c62776bf2b642be1',
  ],
  'apps/web/src/CityScene.tsx': [
    16568,
    '552d1e21d28573b4070b588480911224d97b00cf80364d526959b5ea56fa42a2',
  ],
  'apps/web/src/CityScreen.tsx': [
    14893,
    'cc0a30af02bb29735f561956ec0038f027647ac1764f93bee7870d05e22e95fe',
  ],
  'apps/web/src/cityArtAssets.test.ts': [
    6918,
    '7f9559468bbd36067cf7493caf84bf00d59d2d4d54423527711bb39313f8d0be',
  ],
  'apps/web/src/cityArtRegistry.ts': [
    1475,
    '92d0fd188a3f24800404c096475148e2bbc94817c9bfa1fc7f88e89606686398',
  ],
  'apps/web/src/cityDocking.ts': [
    713,
    '8fe001856dcb7a98f89f7cf6108c6522c35de7b82834e9b8a07f4eb8afbc1bfe',
  ],
  'apps/web/src/cityModals.test.tsx': [
    7941,
    'c668407c8bf94314b4ec9d447a0fff4a299de187f7cee12e4ff218a2c433bfa6',
  ],
  'apps/web/src/cityModals.tsx': [
    37375,
    '30a05428054db5a2e3fd4f91d0717afa09ee6d937b8b01a86af9438d58a82596',
  ],
  'apps/web/src/screens/MatchScreen.test.ts': [
    7167,
    'e670d76a35831abc96634c9afa0caecc127ffcd4ce400d7cbbee113be7ba62c8',
  ],
  'apps/web/src/screens/MatchScreen.tsx': [
    59590,
    '85a049ef89fda9c6508b0264e73e9081f1660e611ff78aad8939fafd901a0cfe',
  ],
  'apps/web/src/styles.css': [
    81187,
    '4b0aa5ae77339cb2977605573eeca91d8ce7a850dee72391ecd45c27c2e7f35c',
  ],
}

const EXPECTED_CAPTURES = {
  'full-desktop-1440x900-3x-townhall.jpg': [
    259691,
    '1a4d19074ed92035e3bbdc80916bb04b381ebc759f35902fa9670e42d4252b3a',
    1440,
    900,
    'full',
    3,
    null,
  ],
  'full-desktop-1440x900.jpg': [
    284730,
    '77b19a10b843d00bc5c40850d940e4b16575e2964b89c6d6042fb39c2bba9eb7',
    1440,
    900,
    'full',
    1,
    null,
  ],
  'full-landscape-844x390.jpg': [
    61706,
    'ccdcb81ed7d93bf1a3d72407e82222b95202371e0a24415ee7cd44b0e51146c2',
    844,
    390,
    'full',
    1,
    null,
  ],
  'full-phone-320x568.jpg': [
    45447,
    'eecf942501ac8411154a0fcd2a438ce24aacd905c183b0090954c9685e1f869d',
    320,
    568,
    'full',
    1,
    null,
  ],
  'full-phone-375x812.jpg': [
    59002,
    'bb42082cd65a63068d3571bad2fde4e02c1e2587e73b1c5ebe0ee216b126a562',
    375,
    812,
    'full',
    1,
    null,
  ],
  'full-phone-390x844-3x-shipyard.jpg': [
    48222,
    '3d0c90a5d59cf7ed4e44702188246a431451924bdeb6f1ea43549c65a4d3cc2d',
    390,
    844,
    'full',
    3,
    null,
  ],
  'full-phone-390x844-3x-townhall.jpg': [
    61467,
    '16eaaef6d6782417a9d55456bb9c9d80fecb46f5d81904d390591066ed5f3254',
    390,
    844,
    'full',
    3,
    null,
  ],
  'full-phone-430x932.jpg': [
    72025,
    '4a077ecaabc417ca929fc963544e9f46493685a90db2334a174e56351eeba176',
    430,
    932,
    'full',
    1,
    null,
  ],
  'full-tablet-768x1024.jpg': [
    182744,
    '1c76b528702b68e455fd998870a484fe332f52ac52f5e9508fd97535498b336a',
    768,
    1024,
    'full',
    1,
    null,
  ],
  'midgame-desktop-1440x900.jpg': [
    280020,
    'a422de677228c6b8de6dadc9c8dec306b45af369c0b8f369237d1420e58e7c40',
    1440,
    900,
    'midgame',
    1,
    null,
  ],
  'midgame-phone-375x812.jpg': [
    58483,
    '03bea6f04ab0d9bf194d81790fa9dccb96b7c6b4bde249d870564b33a5905205',
    375,
    812,
    'midgame',
    1,
    null,
  ],
  'panel-build-phone-375x812.jpg': [
    61635,
    '61e92d7b81d7ad3cb7099a520ce7cf358daab2ec45f16a8e1240bfec9203796a',
    375,
    812,
    'starting',
    1,
    'build',
  ],
  'panel-recruit-tablet-768x1024.jpg': [
    193802,
    'c11d27874c39a3abcd5f8d0e35bbdc3573038ea255d9d1f4982143b6d1f8d1f4',
    768,
    1024,
    'full',
    1,
    'recruit',
  ],
  'panel-tavern-desktop-1440x900.jpg': [
    297671,
    'ec3c39d93583561d843b7f87bc8966a3ff210106917a0ced435c0f950800d04d',
    1440,
    900,
    'full',
    1,
    'tavern',
  ],
  'starting-desktop-1440x900.jpg': [
    279096,
    '6b8f8fdca0cc81de38db160cd4684837645057ceb77db15374c7c387a3c271c8',
    1440,
    900,
    'starting',
    1,
    null,
  ],
  'starting-landscape-844x390.jpg': [
    60791,
    'e3a8fad32144fc86f85bb7596f13fc255904f3a2a1e2171b851bdf474fbcc2d9',
    844,
    390,
    'starting',
    1,
    null,
  ],
  'starting-phone-320x568.jpg': [
    44355,
    'c134773ef86a8d6b3cf89bdaa0e6d5f2342d98f56f1396b8d0ed19d9aaa37916',
    320,
    568,
    'starting',
    1,
    null,
  ],
  'starting-phone-375x812.jpg': [
    57484,
    '5ceeb1714c979d3e9481288d0c237aa2200cd250c5be66bda2161b4c841c717d',
    375,
    812,
    'starting',
    1,
    null,
  ],
  'starting-phone-430x932.jpg': [
    70325,
    'f4c28d02163c144dc141ac9c76dfe9fa5764a38432eedd581d45030ed766520a',
    430,
    932,
    'starting',
    1,
    null,
  ],
  'starting-tablet-768x1024.jpg': [
    177147,
    '25ca80b639df0d144f00b7e15ffa8e5094d7bd5196c1be0750d1dc87eba94d27',
    768,
    1024,
    'starting',
    1,
    null,
  ],
}

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function stable(value) {
  return JSON.stringify(value)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function repoPath(path) {
  const absolute = resolve(REPO_ROOT, path)
  assert(
    absolute === REPO_ROOT || absolute.startsWith(`${REPO_ROOT}${sep}`),
    `path escapes repository: ${path}`,
  )
  return absolute
}

function readRegular(path) {
  const absolute = repoPath(path)
  const link = lstatSync(absolute)
  assert(link.isFile() && !link.isSymbolicLink(), `expected regular file: ${path}`)
  return readFileSync(absolute)
}

function inspectJpeg(bytes, name) {
  assert(bytes[0] === 0xff && bytes[1] === 0xd8, `${name}: missing JPEG SOI magic`)
  assert(
    bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9,
    `${name}: missing JPEG EOI magic`,
  )
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
    assert(length >= 2 && offset + length <= bytes.length, `${name}: invalid JPEG segment`)
    if (marker === 0xe0 && bytes.subarray(offset + 2, offset + 7).toString() === 'JFIF\u0000') {
      jfif = true
    }
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      frame = {
        marker,
        precision: bytes[offset + 2],
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
        components: bytes[offset + 7],
      }
      break
    }
    offset += length
  }
  assert(jfif, `${name}: expected JFIF application marker`)
  assert(frame, `${name}: missing JPEG frame header`)
  return frame
}

const binding = JSON.parse(readFileSync(resolve(DOCS_DIR, 'RUNTIME-CAPTURE-BINDINGS.json')))
const receipt = JSON.parse(readFileSync(resolve(DOCS_DIR, 'RUNTIME-CAPTURE-RECEIPT.json')))
const record = readFileSync(resolve(DOCS_DIR, 'RUNTIME-CAPTURES.md'), 'utf8')

assert(binding.schema === 1 && binding.issue === 612, 'unexpected binding identity')
assert(binding.sourceHead === SOURCE_HEAD, 'binding source head drift')
assert(binding.captureSourceHead === CAPTURE_SOURCE_HEAD, 'capture source head drift')
assert(binding.captureStatus === 'approved', 'capture status drift')
assert(receipt.schema === 1 && receipt.issue === 612, 'unexpected receipt identity')
assert(receipt.sourceHead === SOURCE_HEAD, 'receipt source head drift')
assert(receipt.captureStatus === 'approved', 'receipt capture status drift')
assert(receipt.captureOrigin.sourceHead === CAPTURE_SOURCE_HEAD, 'receipt capture origin drift')
assert(
  binding.sourceTransition.classification === 'exact-source-recaptured-approved' &&
    binding.sourceTransition.renderedMarkupChanged === true &&
    binding.sourceTransition.stylesChanged === true &&
    binding.sourceTransition.artChanged === false &&
    binding.sourceTransition.recaptured === true,
  'binding source transition drift',
)
assert(
  receipt.sourceTransition.from === PRIOR_CAPTURE_SOURCE_HEAD &&
    receipt.sourceTransition.to === SOURCE_HEAD &&
    receipt.sourceTransition.classification === 'exact-source-recaptured-approved' &&
    receipt.sourceTransition.renderedMarkupChanged === true &&
    receipt.sourceTransition.stylesChanged === true &&
    receipt.sourceTransition.artChanged === false &&
    receipt.sourceTransition.recaptured === true,
  'receipt source transition drift',
)
assert(stable(binding.states) === stable(EXPECTED_STATES), 'binding state metadata drift')
assert(stable(receipt.states) === stable(EXPECTED_STATES), 'receipt state metadata drift')
assert(
  stable(binding.requiredBreakpoints) === stable(EXPECTED_BREAKPOINTS),
  'required breakpoint inventory drift',
)

assert(receipt.captureOrigin.workflow === 'normal UI only', 'capture workflow drift')
assert(receipt.captureOrigin.faction === 'pirates', 'capture faction drift')
assert(
  receipt.captureOrigin.programmaticFontOrImageAwaitClaimed === false,
  'unsupported programmatic settle claim',
)
assert(
  receipt.captureOrigin.visualSettleInspection === 'completed-by-integration-owner' &&
    receipt.captureOrigin.nativeSizeInspection === 'completed-by-integration-owner',
  'integration-owner visual inspection record drift',
)
assert(receipt.checkpoints.checkpoint1.status === 'approved', 'checkpoint 1 status drift')
assert(receipt.checkpoints.checkpoint2.status === 'approved', 'checkpoint 2 status drift')
assert(
  binding.approval.status === 'approved' &&
    binding.approval.evidenceHead === 'dc11b60738f4f14b896532bf2db323b2bd054f5c' &&
    binding.approval.record ===
      'https://github.com/jharvieux/AoP/issues/612#issuecomment-5551752344' &&
    receipt.checkpoints.checkpoint2.evidenceHead === binding.approval.evidenceHead &&
    receipt.checkpoints.checkpoint2.record === binding.approval.record,
  'checkpoint 2 approval binding drift',
)
assert(
  receipt.replayCompatibility.decision === 'accept-current-engine-version' &&
    receipt.replayCompatibility.engineVersion === ENGINE_VERSION &&
    receipt.replayCompatibility.preArtReplayCompatibilityRequired === false &&
    receipt.replayCompatibility.contentBuildingUrlsRetained === true &&
    receipt.replayCompatibility.runtimeCityDefaults === 'web-owned-registry',
  'replay compatibility decision drift',
)
assert(receipt.coverage.captureCount === 20, 'receipt capture count drift')
assert(
  receipt.artifacts.record === 'docs/art/city-ui-v2/RUNTIME-CAPTURES.md' &&
    receipt.artifacts.binding === 'docs/art/city-ui-v2/RUNTIME-CAPTURE-BINDINGS.json' &&
    receipt.artifacts.captureDirectory === CAPTURE_ROOT,
  'receipt artifact paths drift',
)
assert(stable(receipt.coverage.zoomLevels) === stable([1, 3]), 'zoom coverage drift')
assert(
  stable(receipt.coverage.managementPanels) === stable(['build', 'recruit', 'tavern']),
  'management panel coverage drift',
)
assert(
  stable(receipt.coverage.requiredBreakpoints) ===
    stable(EXPECTED_BREAKPOINTS.map(({ width, height }) => `${width}x${height}`)),
  'receipt breakpoint inventory drift',
)

assert(
  binding.sourceFiles.length === Object.keys(EXPECTED_SOURCES).length,
  'source inventory count drift',
)
const sourceRecords = new Map(binding.sourceFiles.map((entry) => [entry.path, entry]))
assert(sourceRecords.size === binding.sourceFiles.length, 'duplicate source binding')
for (const [path, expected] of Object.entries(EXPECTED_SOURCES)) {
  const entry = sourceRecords.get(path)
  assert(entry, `missing source binding: ${path}`)
  const [bytes, hash] = expected
  assert(entry.bytes === bytes && entry.sha256 === hash, `${path}: source anchor drift`)
  const contents = readRegular(path)
  assert(contents.length === bytes, `${path}: byte count drift`)
  assert(sha256(contents) === hash, `${path}: SHA-256 drift`)
}

const captureNames = readdirSync(repoPath(CAPTURE_ROOT)).sort()
assert(
  stable(captureNames) === stable(Object.keys(EXPECTED_CAPTURES).sort()),
  'capture directory inventory drift',
)
const captureRecords = new Map(
  binding.captures.map((entry) => [entry.path.split('/').at(-1), entry]),
)
assert(binding.captures.length === captureNames.length, 'capture binding count drift')
assert(captureRecords.size === binding.captures.length, 'duplicate capture binding')
const states = new Map(EXPECTED_STATES.map((state) => [state.id, state]))

for (const [name, expected] of Object.entries(EXPECTED_CAPTURES)) {
  const entry = captureRecords.get(name)
  assert(entry, `missing capture binding: ${name}`)
  const [bytes, hash, width, height, stateId, zoom, panel] = expected
  const state = states.get(stateId)
  assert(state, `${name}: unknown state`)
  assert(entry.path === `${CAPTURE_ROOT}/${name}`, `${name}: capture path drift`)
  assert(entry.bytes === bytes && entry.sha256 === hash, `${name}: capture anchor drift`)
  assert(entry.width === width && entry.height === height, `${name}: dimension metadata drift`)
  assert(entry.encoding === 'JPEG/JFIF' && entry.colorMode === 'RGB', `${name}: format drift`)
  assert(entry.state === stateId, `${name}: state drift`)
  assert(entry.round === state.round, `${name}: round drift`)
  assert(entry.visibleBuildings === state.visibleBuildings, `${name}: building count drift`)
  assert(entry.zoom === zoom && entry.panel === panel, `${name}: coverage metadata drift`)

  const contents = readRegular(entry.path)
  assert(statSync(repoPath(entry.path)).size === bytes, `${name}: byte count drift`)
  assert(bytes <= MAX_CAPTURE_BYTES, `${name}: exceeds 300 KiB ceiling`)
  assert(sha256(contents) === hash, `${name}: SHA-256 drift`)
  const jpeg = inspectJpeg(contents, name)
  assert(jpeg.marker === 0xc0, `${name}: expected baseline JPEG`)
  assert(jpeg.precision === 8, `${name}: expected 8-bit JPEG precision`)
  assert(jpeg.components === 3, `${name}: expected three-component RGB JPEG`)
  assert(jpeg.width === width && jpeg.height === height, `${name}: encoded dimensions drift`)
}

for (const stateId of ['starting', 'full']) {
  for (const { width, height } of EXPECTED_BREAKPOINTS) {
    assert(
      binding.captures.some(
        (capture) =>
          capture.state === stateId &&
          capture.width === width &&
          capture.height === height &&
          capture.zoom === 1 &&
          capture.panel === null,
      ),
      `missing ${stateId} 1x breakpoint capture: ${width}x${height}`,
    )
  }
}
assert(
  binding.captures.filter((capture) => capture.state === 'midgame' && capture.panel === null)
    .length === 2,
  'midgame desktop/phone coverage drift',
)
assert(
  binding.captures.filter((capture) => capture.zoom === 3).length === 3,
  '3x phone/desktop coverage drift',
)
assert(
  stable(
    binding.captures
      .map((capture) => capture.panel)
      .filter(Boolean)
      .sort(),
  ) === stable(['build', 'recruit', 'tavern']),
  'panel capture coverage drift',
)

assert(record.includes(SOURCE_HEAD), 'capture record source head drift')
assert(
  record.includes('operator approved') && record.includes(binding.approval.record),
  'capture record checkpoint status drift',
)
for (const name of captureNames)
  assert(record.includes(`\`${name}\``), `capture missing from record: ${name}`)

console.log(
  `City UI v2 archive valid: ${binding.sourceFiles.length} current source anchors and ${binding.captures.length} exact-source RGB/JFIF captures; checkpoint 2 approved and exact-bound.`,
)
