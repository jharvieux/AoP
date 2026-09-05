import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCS_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(DOCS_DIR, '../../..')
const SOURCE_HEAD = 'a5a8fd5f8c522ebddfb146510b492bcea1c28ee2'
const CAPTURE_SOURCE_HEAD = SOURCE_HEAD
const PRIOR_CAPTURE_SOURCE_HEAD = '45a206f760eacce50dc8dd1dc656c5d4e789cb3c'
const ENGINE_VERSION = '850a9013b70e38a7'
const CAPTURE_ROOT = 'docs/art/city-ui-v2/runtime-captures'
const MAX_CAPTURE_BYTES = 300 * 1024
const PENDING_STATUS = 'captured-pending-direct-operator-approval'
const HISTORICAL_APPROVAL = {
  status: 'historical-source-only',
  sourceHead: PRIOR_CAPTURE_SOURCE_HEAD,
  evidenceHead: 'dc11b60738f4f14b896532bf2db323b2bd054f5c',
  record: 'https://github.com/jharvieux/AoP/issues/612#issuecomment-5551752344',
  reusable: false,
}

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
    23344,
    '3eefd0b416ea2cdcb68715d431a9f9014faf172031f94d3fadebb08e529bee3d',
  ],
  'apps/web/src/screens/MatchScreen.tsx': [
    61775,
    '085a53c54f8c6687452d48fb6afc044e736a3a1431c60dc068b00514bd0e285f',
  ],
  'apps/web/src/styles.css': [
    88328,
    'f58c73f68b341d0a00183c986c8d1a9b6c78ab650593e2088b64a133c54a96f7',
  ],
}

const EXPECTED_CAPTURES = {
  'full-desktop-1440x900-3x-townhall.jpg': [
    221797,
    '704a3449008342fa57cf3d6ea5879d7096c046ebce4c3495b9e122c72ce2e6e0',
    1440,
    900,
    'full',
    3,
    null,
  ],
  'full-desktop-1440x900.jpg': [
    241364,
    'da8e255f134f82135bd97bfc1e6a6f49ba5fcd0591ad80a78661804c6e006928',
    1440,
    900,
    'full',
    1,
    null,
  ],
  'full-landscape-844x390.jpg': [
    52781,
    '895d4625963f4ee8a1ce6e99f38c03e49cecedbce0807c7506b402a25dd30f84',
    844,
    390,
    'full',
    1,
    null,
  ],
  'full-phone-320x568.jpg': [
    38621,
    '3f5e41425d7e1142f70cce767ed6fba616595fc671034168430f52b26767a264',
    320,
    568,
    'full',
    1,
    null,
  ],
  'full-phone-375x812.jpg': [
    50981,
    '0fe1503c04391be42c00424e7d9483e50727f78d3ddb73704dd509baf5206661',
    375,
    812,
    'full',
    1,
    null,
  ],
  'full-phone-390x844-3x-shipyard.jpg': [
    40114,
    'b698c7a907aa11c04aa118448cc9cf99b2cde71ea71a509163a3ec6a7d541cc2',
    390,
    844,
    'full',
    3,
    null,
  ],
  'full-phone-390x844-3x-townhall.jpg': [
    51196,
    'd50a451d33471ab40a195301f0fb362e45be2d6b3c32b881b7082daa7330ef22',
    390,
    844,
    'full',
    3,
    null,
  ],
  'full-phone-430x932.jpg': [
    62789,
    '0dc33f5afebc093e12af527308e14a9dfebb5733c1c68c914d232f976cf05f17',
    430,
    932,
    'full',
    1,
    null,
  ],
  'full-tablet-768x1024.jpg': [
    153542,
    '3d480fb6d46bbe08a3241e7122fc810579448dcd64c4bbd611f9b2f5ce45922d',
    768,
    1024,
    'full',
    1,
    null,
  ],
  'midgame-desktop-1440x900.jpg': [
    237477,
    'cbc12a310450ab6c85641df6e6b28983fa87143020a447d54e29fef365b11af7',
    1440,
    900,
    'midgame',
    1,
    null,
  ],
  'midgame-phone-375x812.jpg': [
    50191,
    'fa7dbb0c601dcdc909d3ba9649a32e2fc3fcb718ee6989685435a1dbacba3f63',
    375,
    812,
    'midgame',
    1,
    null,
  ],
  'panel-build-phone-375x812.jpg': [
    51780,
    '0169a94304e2b290bb16cfb2c17d1f23a77e69b8c9ad1dc34af81212bee43ece',
    375,
    812,
    'starting',
    1,
    'build',
  ],
  'panel-recruit-tablet-768x1024.jpg': [
    160632,
    '5d9987ddb9ab1aa78f0381f6ee32f623942b105f22da2b9aa731843714a9afd1',
    768,
    1024,
    'full',
    1,
    'recruit',
  ],
  'panel-tavern-desktop-1440x900.jpg': [
    272056,
    '2cc5987466b3de6e3606373b8ce78c5ef4f0c67b5388e34d9ff6393b36bb4951',
    1440,
    900,
    'full',
    1,
    'tavern',
  ],
  'starting-desktop-1440x900.jpg': [
    237116,
    'b5cae3bfd07ab97c8aa6eaba53162d2bdaa49c8eeef3921254350e112b523678',
    1440,
    900,
    'starting',
    1,
    null,
  ],
  'starting-landscape-844x390.jpg': [
    52166,
    'd91261606e2dc8d6329fee5a577f3868c9948c06a39eae13980ff9fe8e299684',
    844,
    390,
    'starting',
    1,
    null,
  ],
  'starting-phone-320x568.jpg': [
    39234,
    '937a41c847e8381a3d192626f9cf59953280ea6a7a56dc2a823fd07d9bffb66c',
    320,
    568,
    'starting',
    1,
    null,
  ],
  'starting-phone-375x812.jpg': [
    49774,
    'c04ae7255cd87ce24d672a448c3585c2820bf8854d8ccc24e5d523392f7c062a',
    375,
    812,
    'starting',
    1,
    null,
  ],
  'starting-phone-430x932.jpg': [
    61707,
    'e16c1a0eb2523638cbb937ecb95a36d701b5fe755b1514206b3e9a5562637dde',
    430,
    932,
    'starting',
    1,
    null,
  ],
  'starting-tablet-768x1024.jpg': [
    151148,
    'c2360bb976eebfbbf65a4d4836fd75f57427c9fe2e0a28ff1c6a868689ab81b2',
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
assert(binding.captureStatus === PENDING_STATUS, 'capture status drift')
assert(receipt.schema === 1 && receipt.issue === 612, 'unexpected receipt identity')
assert(receipt.sourceHead === SOURCE_HEAD, 'receipt source head drift')
assert(receipt.captureStatus === PENDING_STATUS, 'receipt capture status drift')
assert(receipt.captureOrigin.sourceHead === CAPTURE_SOURCE_HEAD, 'receipt capture origin drift')
assert(
  binding.sourceTransition.classification === 'exact-source-recaptured-pending-approval' &&
    binding.sourceTransition.renderedMarkupChanged === true &&
    binding.sourceTransition.stylesChanged === true &&
    binding.sourceTransition.artChanged === false &&
    binding.sourceTransition.recaptured === true,
  'binding source transition drift',
)
assert(
  receipt.sourceTransition.from === PRIOR_CAPTURE_SOURCE_HEAD &&
    receipt.sourceTransition.to === SOURCE_HEAD &&
    receipt.sourceTransition.classification === 'exact-source-recaptured-pending-approval' &&
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

assert(
  receipt.captureOrigin.workflow ===
    'truthful shipping-component import harness with visible shipping controls',
  'capture workflow drift',
)
assert(
  receipt.captureOrigin.harness === 'docs/art/city-ui-v2/tools/runtime-harness',
  'capture harness drift',
)
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
assert(
  receipt.checkpoints.checkpoint2.status === 'pending-direct-operator-approval',
  'checkpoint 2 status drift',
)
assert(
  binding.approval.status === 'pending-direct-operator-approval' &&
    binding.approval.evidenceHead === null &&
    binding.approval.record === null &&
    receipt.checkpoints.checkpoint2.evidenceHead === null &&
    receipt.checkpoints.checkpoint2.record === null &&
    stable(binding.historicalApproval) === stable(HISTORICAL_APPROVAL) &&
    stable(receipt.checkpoints.checkpoint2.historicalApproval) === stable(HISTORICAL_APPROVAL),
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
  /pending\s+direct\s+operator\s+approval/.test(record),
  'capture record checkpoint status drift',
)
for (const name of captureNames)
  assert(record.includes(`\`${name}\``), `capture missing from record: ${name}`)

console.log(
  `City UI v2 archive valid: ${binding.sourceFiles.length} current source anchors and ${binding.captures.length} exact-source RGB/JFIF captures; native inspection complete and direct operator approval pending.`,
)
