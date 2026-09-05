import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const DOCS_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(DOCS_DIR, '../../..')
const SOURCE_HEAD = 'c1824f22bf14dca6d38f7519fd99affd789a8130'
const CAPTURE_SOURCE_HEAD = SOURCE_HEAD
const PRIOR_CAPTURE_SOURCE_HEAD = 'a5a8fd5f8c522ebddfb146510b492bcea1c28ee2'
const HISTORICAL_APPROVED_SOURCE_HEAD = '45a206f760eacce50dc8dd1dc656c5d4e789cb3c'
const ENGINE_VERSION = '850a9013b70e38a7'
const CAPTURE_ROOT = 'docs/art/city-ui-v2/runtime-captures'
const MAX_CAPTURE_BYTES = 300 * 1024
const PENDING_STATUS = 'captured-pending-direct-operator-approval'
const HISTORICAL_APPROVAL = {
  status: 'historical-source-only',
  sourceHead: HISTORICAL_APPROVED_SOURCE_HEAD,
  evidenceHead: 'dc11b60738f4f14b896532bf2db323b2bd054f5c',
  record: 'https://github.com/jharvieux/AoP/issues/612#issuecomment-5551752344',
  reusable: false,
}
const SUPERSEDED_CAPTURE = {
  sourceHead: PRIOR_CAPTURE_SOURCE_HEAD,
  recordHead: 'b64ae4c02c3c31342e1fbf70f87b9c07203f86d2',
  bindingSha256: 'd2959600f4ded5ea3357990a355e2faec6e167b27928d065a70a4de77c5a66db',
  approval: { status: 'pending-direct-operator-approval', record: null },
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
    32571,
    'cdb358daa73f5f17278a01af0e24477510f1ea17121d475755c7483b22971715',
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
    89210,
    'c7cfcd12b37babcc94944ff764b8d6fcb9ed2a3a90519e598eb557f44f13a3e0',
  ],
}

const EXPECTED_CAPTURES = {
  'full-desktop-1440x900-3x-townhall.jpg': [
    217395,
    '91b31cfe44465978b82bf85223c0e36d8bc80e83bd88a86f8b00ecbda6d55c17',
    1440,
    900,
    'full',
    3,
    null,
  ],
  'full-desktop-1440x900.jpg': [
    242624,
    '7301275190ff760eb097f67675f65bba6b96ea382c6ec8b18f54b447794e248d',
    1440,
    900,
    'full',
    1,
    null,
  ],
  'full-landscape-844x390.jpg': [
    52941,
    '5777edb860bc7214d246d09a37fd69df3f706f1c527fe5ceb79488aede94c8ed',
    844,
    390,
    'full',
    1,
    null,
  ],
  'full-phone-320x568.jpg': [
    41234,
    'af26aa1abc1f78e6a9c46e1ee2925fffd2d2cec354ff5c33a41598fc6cb4621d',
    320,
    568,
    'full',
    1,
    null,
  ],
  'full-phone-375x812.jpg': [
    51875,
    '1bd5eb07ace624f5111cbf48a4dcc0342806a992bec401ea9c07e387f58c23f9',
    375,
    812,
    'full',
    1,
    null,
  ],
  'full-phone-390x844-3x-shipyard.jpg': [
    41210,
    'b1378c52942f596428efb5f5c3721bf48301756a054d202705fd85a48c4a0b6e',
    390,
    844,
    'full',
    3,
    null,
  ],
  'full-phone-390x844-3x-townhall.jpg': [
    51971,
    'e4460ee838e11a45726195ce6da56f405b0ad153783822c481f224b83fcca696',
    390,
    844,
    'full',
    3,
    null,
  ],
  'full-phone-430x932.jpg': [
    62741,
    '48df14358afb0c7bfa8513a1a6f99ad8aba4526bc511c6cf966200d2a86a0c3c',
    430,
    932,
    'full',
    1,
    null,
  ],
  'full-tablet-768x1024.jpg': [
    154597,
    '82b5e7067c838bbee6da44f34110f366f4ddc3d6823f9f5a18eab4dbc5833dc4',
    768,
    1024,
    'full',
    1,
    null,
  ],
  'midgame-desktop-1440x900.jpg': [
    238547,
    '3fc99f09f5ba9449e8e93fe2345938116078e1f2b185a69390e0da33ee885ca3',
    1440,
    900,
    'midgame',
    1,
    null,
  ],
  'midgame-phone-375x812.jpg': [
    51080,
    '6d8764361e4bd49ebacc17e96d38153d6c237229bbd81fa3a419f472d45c5ea1',
    375,
    812,
    'midgame',
    1,
    null,
  ],
  'panel-build-phone-375x812.jpg': [
    51810,
    '95b66e9f5cf758ea22aca524f800dcb5cc13937947e2e196eaf116af34e91003',
    375,
    812,
    'starting',
    1,
    'build',
  ],
  'panel-recruit-tablet-768x1024.jpg': [
    161810,
    '7eb0c29c3a28105f190ad99c8da9b56cf7ee23b781a3335ae698fc1d5f402896',
    768,
    1024,
    'full',
    1,
    'recruit',
  ],
  'panel-tavern-desktop-1440x900.jpg': [
    273475,
    '852b20ae172701347a21879c9bec7b063107d1c32ca62c9e9157cd690afa484a',
    1440,
    900,
    'full',
    1,
    'tavern',
  ],
  'starting-desktop-1440x900.jpg': [
    238120,
    'fc53d522de957fa8aa97e22abb2e2db6c11842e07e5923f147952f73fc233fd4',
    1440,
    900,
    'starting',
    1,
    null,
  ],
  'starting-landscape-844x390.jpg': [
    52280,
    '258ed3e62bcca2dc98e48ce3ede239989031083ad6807f8bbd31512a51b24b5e',
    844,
    390,
    'starting',
    1,
    null,
  ],
  'starting-phone-320x568.jpg': [
    40314,
    '80d349d1330e45c40fd73f81c1b2d2478d1cd04db2217a14b92dd5ba65b08cc8',
    320,
    568,
    'starting',
    1,
    null,
  ],
  'starting-phone-375x812.jpg': [
    49178,
    '5f7e9bbddd49a7542885a6b8a1e6c4d96f787c29e83705b8e9961053c9b0224b',
    375,
    812,
    'starting',
    1,
    null,
  ],
  'starting-phone-430x932.jpg': [
    61637,
    '64ec58c5d2766a8d3b77d819aeb2cca0809aea09baacd533414826db3c2c0810',
    430,
    932,
    'starting',
    1,
    null,
  ],
  'starting-tablet-768x1024.jpg': [
    152108,
    '3f736acb8cbdbe8265f5cf0d386ef23bfd2a87f5bf7f2c6ad3ed16c749c8b6ae',
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
    stable(receipt.checkpoints.checkpoint2.historicalApproval) === stable(HISTORICAL_APPROVAL) &&
    stable(binding.supersededCapture) === stable(SUPERSEDED_CAPTURE) &&
    stable(receipt.checkpoints.checkpoint2.supersededCapture) === stable(SUPERSEDED_CAPTURE),
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
const semanticTextEvidence = [
  'docs/art/city-ui-v2/runtime-captures/full-phone-320x568.jpg',
  'docs/art/city-ui-v2/runtime-captures/full-phone-375x812.jpg',
].map((path) => ({
  path,
  requiredVisibleText: ['Defense', 'No garrison captain', '1 ship in port'],
  requireNoSemanticTextOverflow: true,
}))
assert(
  stable(receipt.coverage.semanticTextEvidence) === stable(semanticTextEvidence),
  'narrow-phone semantic text evidence drift',
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
  const semanticRequirement = semanticTextEvidence.find((item) => item.path === entry.path)
  if (semanticRequirement) {
    assert(
      stable(entry.requiredVisibleText) === stable(semanticRequirement.requiredVisibleText) &&
        entry.requireNoSemanticTextOverflow === true,
      `${name}: semantic text requirement drift`,
    )
  } else {
    assert(
      stable(entry.requiredVisibleText) === stable([]) &&
        entry.requireNoSemanticTextOverflow === false,
      `${name}: unexpected semantic text requirement`,
    )
  }

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
