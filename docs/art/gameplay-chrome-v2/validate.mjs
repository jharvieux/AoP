/** Fail-loud validation for the #610 review package. Usage: node validate.mjs */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  acceptanceProjection,
  assertRuntimeCaptureProposalRepository,
  bindingPath,
  buildInputPaths,
  buildRuntimeCaptureBindings,
  captureSpecs,
  frozenCaptureState,
  inspectRuntimeCaptureProposalComment,
  materialBaselineRelativePath,
  materialProjection,
  prepareRuntimeCaptureBaselineProposal,
  receiptPaths,
  sourceTreePolicies,
  stylesheetPath,
} from './runtime-capture-bindings.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(root, '..', '..', '..')
const required = [
  ['mockups/phone-world-map-375x812.svg', 375, 812],
  ['mockups/city-inspector-desktop-1440x900.svg', 1440, 900],
  ['mockups/token-type-icon-sheet-1440x960.svg', 1440, 960],
]
const runtimeCaptureSpecs = [
  ['runtime-phone-world-375x812.png', 375, 812],
  ['runtime-city-inspector-1440x900.png', 1440, 900],
  ['runtime-interaction-states-1440x960.png', 1440, 960],
]
let failures = 0
for (const [rel, w, h] of required) {
  const file = join(root, rel)
  const source = readFileSync(file, 'utf8')
  const bytes = statSync(file).size
  const dimension = new RegExp(`<svg[^>]+width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"`).test(
    source,
  )
  const needsBackdrop = rel !== 'mockups/token-type-icon-sheet-1440x960.svg'
  const embedded = !needsBackdrop || source.includes('data:image/webp;base64,')
  const authoredIcons =
    source.includes('stroke-linecap="round"') && source.includes('stroke-linejoin="round"')
  const budget = bytes <= 300 * 1024
  for (const [label, pass] of [
    ['dimensions', dimension],
    ['embedded Direction B backdrop', embedded],
    ['vector geometry', authoredIcons],
    ['300 KiB review budget', budget],
  ]) {
    if (!pass) {
      console.error(`FAIL ${rel}: ${label}`)
      failures++
    }
  }
  console.log(`PASS ${rel}: ${w}×${h}, ${bytes.toLocaleString()} bytes`)
}
const runtimeCaptureRoot = join(root, 'runtime-captures')
const runtimeCaptureNames = readdirSync(runtimeCaptureRoot)
if (
  runtimeCaptureNames.length !== runtimeCaptureSpecs.length ||
  runtimeCaptureSpecs.some(([name]) => !runtimeCaptureNames.includes(name))
) {
  console.error(`FAIL runtime capture inventory: ${runtimeCaptureNames.join(', ')}`)
  failures++
}
const runtimeReport = readFileSync(join(root, 'RUNTIME-VERIFICATION.md'), 'utf8')
for (const [name, width, height] of runtimeCaptureSpecs) {
  const relative = `runtime-captures/${name}`
  const file = join(root, relative)
  const source = readFileSync(file)
  const bytes = source.byteLength
  const png = source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const dimensions = png && source.readUInt32BE(16) === width && source.readUInt32BE(20) === height
  const rgb = png && [2, 6].includes(source[25])
  const budget = bytes <= 300 * 1024
  const digest = createHash('sha256').update(source).digest('hex')
  const recorded = runtimeReport.includes(name) && runtimeReport.includes(digest)
  for (const [label, pass] of [
    ['PNG payload', png],
    ['dimensions', dimensions],
    ['RGB/RGBA pixels', rgb],
    ['300 KiB review budget', budget],
    ['runtime report binding', recorded],
  ]) {
    if (!pass) {
      console.error(`FAIL ${relative}: ${label}`)
      failures++
    }
  }
  console.log(
    `PASS ${relative}: ${width}×${height}, ${bytes.toLocaleString()} bytes, sha256 ${digest}`,
  )
}

const retainedBinding = JSON.parse(readFileSync(bindingPath, 'utf8'))
const expectedBinding = buildRuntimeCaptureBindings()
const projectBinding = (binding) => JSON.stringify(acceptanceProjection(binding))
const bindingMatches = (candidate) => projectBinding(candidate) === projectBinding(expectedBinding)
const exactBindingMatches = (candidate) =>
  JSON.stringify(candidate) === JSON.stringify(expectedBinding)
const expectedCaptureIds = captureSpecs.map((capture) => capture.id)
const retainedCaptureIds = retainedBinding.captures.map((capture) => capture.id)
const expectedTopLevelKeys = [
  'binding_boundary',
  'build_inputs',
  'canvas_token_census',
  'capture_baseline',
  'captures',
  'diagnostics',
  'frozen_capture_state',
  'material_baseline',
  'runtime_assets',
  'schema',
  'shipping_sources',
  'stylesheet_source',
]
const exactInventory =
  retainedBinding.schema === 3 &&
  JSON.stringify(Object.keys(retainedBinding).sort()) === JSON.stringify(expectedTopLevelKeys) &&
  JSON.stringify(retainedCaptureIds) === JSON.stringify(expectedCaptureIds) &&
  JSON.stringify(retainedBinding.build_inputs.map((item) => item.path)) ===
    JSON.stringify(buildInputPaths) &&
  JSON.stringify(retainedBinding.runtime_assets.receipts.map((item) => item.path)) ===
    JSON.stringify(receiptPaths) &&
  JSON.stringify(retainedBinding.frozen_capture_state) === JSON.stringify(frozenCaptureState) &&
  retainedBinding.material_baseline.path === materialBaselineRelativePath &&
  retainedBinding.material_baseline.capture_head === retainedBinding.capture_baseline.source_head &&
  JSON.stringify(retainedBinding.binding_boundary.source_tree_policies) ===
    JSON.stringify(sourceTreePolicies.map(({ id, root, policy }) => ({ id, root, policy })))
if (!exactInventory) {
  console.error('FAIL runtime source binding inventory equality')
  failures++
}
if (!bindingMatches(retainedBinding) || !exactBindingMatches(retainedBinding)) {
  console.error('FAIL runtime captures are stale for their schema-v3 bound inventory or bytes')
  failures++
}
const materialBaselineBuffer = readFileSync(join(repoRoot, materialBaselineRelativePath))
const retainedMaterialBaseline = JSON.parse(materialBaselineBuffer.toString('utf8'))
const materialSerialised = JSON.stringify(materialProjection(retainedBinding))
const materialDigest = createHash('sha256').update(materialSerialised).digest('hex')
const captureRecord = runtimeReport.match(
  /https:\/\/github\.com\/jharvieux\/AoP\/issues\/610#issuecomment-\d+/,
)?.[0]
if (
  retainedMaterialBaseline.schema !== 1 ||
  retainedMaterialBaseline.kind !== 'gameplay-runtime-material-baseline' ||
  retainedMaterialBaseline.material.sha256 !== materialDigest ||
  retainedMaterialBaseline.material.bytes !== Buffer.byteLength(materialSerialised) ||
  retainedBinding.material_baseline.sha256 !==
    createHash('sha256').update(materialBaselineBuffer).digest('hex') ||
  retainedBinding.material_baseline.material_sha256 !== materialDigest ||
  retainedMaterialBaseline.capture_head !== retainedBinding.capture_baseline.source_head ||
  retainedMaterialBaseline.captured_on !== retainedBinding.capture_baseline.captured_on ||
  !captureRecord ||
  retainedMaterialBaseline.capture_record_sha256 !==
    createHash('sha256').update(captureRecord).digest('hex')
) {
  console.error('FAIL immutable runtime material-baseline anchor')
  failures++
}
if (
  retainedBinding.stylesheet_source.path !== stylesheetPath ||
  !/^[0-9a-f]{64}$/.test(retainedBinding.stylesheet_source.sha256) ||
  retainedBinding.stylesheet_source.sha256 !==
    retainedBinding.shipping_sources.find((item) => item.path === stylesheetPath)?.sha256
) {
  console.error('FAIL full stylesheet acceptance hash is absent or inconsistent')
  failures++
}
const sourcePaths = retainedBinding.shipping_sources.map((item) => item.path)
const assetPaths = retainedBinding.runtime_assets.files.map((item) => item.path)
if (
  new Set(sourcePaths).size !== sourcePaths.length ||
  new Set(assetPaths).size !== assetPaths.length ||
  JSON.stringify(sourcePaths) !== JSON.stringify([...sourcePaths].sort()) ||
  JSON.stringify(assetPaths) !== JSON.stringify([...assetPaths].sort())
) {
  console.error('FAIL schema-v3 source/asset inventory is duplicated or unsorted')
  failures++
}
if (
  retainedBinding.canvas_token_census.call_count !== 34 ||
  retainedBinding.canvas_token_census.unique_token_count !== 28 ||
  retainedBinding.canvas_token_census.schema_v2_escape_count !== 26
) {
  console.error('FAIL Canvas token census: expected 34 calls / 28 unique / 26 v2 escapes')
  failures++
}
console.log(
  `PASS schema-v3 source binding: ${retainedCaptureIds.length} captures / ${sourcePaths.length} shipping sources / ${retainedBinding.build_inputs.length} build inputs / ${assetPaths.length} runtime assets / full stylesheet`,
)

function driftedBuffer(path, suffix = '\nsource-drift') {
  return Buffer.concat([readFileSync(join(repoRoot, path)), Buffer.from(suffix)])
}

function expectBindingDrift(label, options) {
  try {
    buildRuntimeCaptureBindings(options)
  } catch (error) {
    if (!String(error).includes('runtime material baseline drift')) {
      console.error(`FAIL material-baseline negative control: ${label} failed for ${error}`)
      failures++
      return
    }
    console.log(`PASS material-baseline negative control: ${label} blocked before regeneration`)
    return
  }
  console.error(`FAIL material-baseline negative control: ${label} was re-blessed by the builder`)
  failures++
}

function replacedSource(path, marker, replacement) {
  const source = readFileSync(join(repoRoot, path), 'utf8')
  if (!source.includes(marker))
    throw new Error(`negative-control marker missing in ${path}: ${marker}`)
  return source.replace(marker, replacement)
}

const staleBinding = structuredClone(retainedBinding)
staleBinding.captures[0].sha256 = '0'.repeat(64)
if (bindingMatches(staleBinding)) {
  console.error('FAIL runtime source binding negative control: stale manifest escaped')
  failures++
} else {
  console.log('PASS runtime source binding negative control: stale manifest rejected')
}

const sourceDriftPath = 'apps/web/src/App.tsx'
expectBindingDrift('runtime source drift', {
  overrides: new Map([[sourceDriftPath, driftedBuffer(sourceDriftPath)]]),
})
const assetDriftPath = 'apps/web/public/art/resources/gold.png'
expectBindingDrift('runtime asset drift', {
  overrides: new Map([[assetDriftPath, driftedBuffer(assetDriftPath)]]),
})
const captureDriftPath = captureSpecs[0].path
const captureDrift = Buffer.from(readFileSync(join(repoRoot, captureDriftPath)))
captureDrift[captureDrift.length - 1] ^= 1
expectBindingDrift('capture drift', {
  overrides: new Map([[captureDriftPath, captureDrift]]),
})

const stylesheet = readFileSync(join(repoRoot, stylesheetPath), 'utf8')
const cssMutations = [
  ['app hidden', stylesheet.replace('.app {', '.app {\n  display: none;')],
  ['new global div hidden selector', `${stylesheet}\ndiv { display: none; }\n`],
  [
    'screen transition hidden',
    stylesheet.replace('.screen-transition {', '.screen-transition {\n  display: none;'),
  ],
]
for (const [label, source] of cssMutations) {
  if (source === stylesheet) throw new Error(`negative-control CSS marker missing: ${label}`)
  expectBindingDrift(label, { overrides: new Map([[stylesheetPath, source]]) })
}

const sourceMutations = [
  [
    'App wrapper hidden',
    'apps/web/src/App.tsx',
    '<div className="app">',
    '<div className="app" style={{ display: \'none\' }}>',
  ],
  [
    'GameScreen hidden',
    'apps/web/src/screens/GameScreen.tsx',
    '<div className="game-screen-container gameplay-chrome" data-gameplay-chrome="screen">',
    '<div className="game-screen-container gameplay-chrome" data-gameplay-chrome="screen" style={{ display: \'none\' }}>',
  ],
  [
    'theme resolver URL changed',
    'apps/web/src/theme/resolve.ts',
    'return pack?.assets[assetKey(kind, contentId)]?.dataUrl',
    "return pack?.assets[assetKey(kind, contentId)]?.dataUrl?.replace('data:', 'https:')",
  ],
  [
    'engine ship hull changed',
    'packages/engine/src/ships.ts',
    'hull: ship.hull,',
    'hull: ship.hull + 1,',
  ],
  [
    'engine visibility changed',
    'packages/engine/src/visibility.ts',
    'if (city.ownerId === playerId) add(city.position, cityVisionRadius)',
    'if (city.ownerId === playerId) add(city.position, cityVisionRadius + 1)',
  ],
  [
    'shared canAfford changed',
    'packages/shared/src/index.ts',
    'pool.gold >= (cost.gold ?? 0)',
    'pool.gold > (cost.gold ?? 0)',
  ],
]
for (const [label, path, marker, replacement] of sourceMutations) {
  expectBindingDrift(label, {
    overrides: new Map([[path, replacedSource(path, marker, replacement)]]),
  })
}

const newSourcePath = 'apps/web/src/captureBindingInventoryProbe.ts'
expectBindingDrift('new shipping source inventory entry', {
  overrides: new Map([[newSourcePath, 'export const captureBindingInventoryProbe = true\n']]),
  additionalShippingSourcePaths: [newSourcePath],
})
expectBindingDrift('new runtime import', {
  overrides: new Map([
    [
      'apps/web/src/App.tsx',
      `import './captureBindingInventoryProbe'\n${readFileSync(join(repoRoot, 'apps/web/src/App.tsx'), 'utf8')}`,
    ],
  ]),
})
expectBindingDrift('build input drift', {
  overrides: new Map([['apps/web/index.html', driftedBuffer('apps/web/index.html')]]),
})
expectBindingDrift('receipt drift', {
  overrides: new Map([
    [
      'docs/art/world-map-v2/runtime-public-receipt.json',
      driftedBuffer('docs/art/world-map-v2/runtime-public-receipt.json', '\n'),
    ],
  ]),
})
const driftedFrozenCaptureState = structuredClone(frozenCaptureState)
driftedFrozenCaptureState.theme.override = 'custom theme pack'
expectBindingDrift('frozen capture state drift', {
  frozenCaptureStateOverride: driftedFrozenCaptureState,
})

const alterHex = (value) => `${value.slice(0, -1)}${value.endsWith('0') ? '1' : '0'}`
for (const name of retainedBinding.canvas_token_census.schema_v2_escape_tokens) {
  const token = retainedBinding.canvas_token_census.tokens.find((item) => item.name === name)
  const nextValue = alterHex(token.css_value)
  const cssMarker = `${name}: ${token.css_value};`
  const fallbackPath = 'apps/web/src/colorTokens.ts'
  const fallbackSource = readFileSync(join(repoRoot, fallbackPath), 'utf8')
  const fallbackMarker = `'${name}': '${token.typed_fallback}'`
  if (!stylesheet.includes(cssMarker) || !fallbackSource.includes(fallbackMarker)) {
    throw new Error(`Canvas-token marker missing: ${name}`)
  }
  const overrides = new Map([
    [stylesheetPath, stylesheet.replace(cssMarker, `${name}: ${nextValue};`)],
    [fallbackPath, fallbackSource.replace(fallbackMarker, `'${name}': '${nextValue}'`)],
  ])
  let callSiteCount = 0
  for (const path of ['apps/web/src/MapCanvas.tsx', 'apps/web/src/Minimap.tsx']) {
    const source = readFileSync(join(repoRoot, path), 'utf8')
    const callMarker = `cssToken('${name}', '${token.fallback}')`
    if (!source.includes(callMarker)) continue
    callSiteCount += source.split(callMarker).length - 1
    overrides.set(path, source.replaceAll(callMarker, `cssToken('${name}', '${nextValue}')`))
  }
  if (!callSiteCount) throw new Error(`Canvas-token call marker missing: ${name}`)
  expectBindingDrift(`schema-v2 escaped Canvas token ${name}`, {
    overrides,
  })
}

function expectProposalFailure(label, operation) {
  try {
    operation()
  } catch {
    console.log(`PASS material-baseline proposal negative control: ${label} rejected`)
    return
  }
  console.error(`FAIL material-baseline proposal negative control: ${label} escaped`)
  failures++
}

const proposalHead = 'a'.repeat(40)
const proposalUrl = 'https://github.com/jharvieux/AoP/issues/610#issuecomment-9999999999'
const proposalComment = {
  id: 9999999999,
  html_url: proposalUrl,
  issue_url: 'https://api.github.com/repos/jharvieux/AoP/issues/610',
  author_association: 'OWNER',
  user: { login: 'repository-owner' },
  body: 'Opaque operator-controlled text retained only by its SHA-256 for manual review.',
}
const proposalDefaults = {
  capturedOn: retainedMaterialBaseline.captured_on,
  confirmation: 'VERIFY_CAPTURE_RENEWAL_PROPOSAL',
  comment: proposalComment,
}
const repositoryState = {
  sourceHead: proposalHead,
  currentHead: proposalHead,
  statusPorcelain: '',
  sparseCheckout: false,
  branch: 'feature/capture-proposal',
  upstreamRef: 'origin/feature/capture-proposal',
  upstreamHead: proposalHead,
  hostedBranchHead: proposalHead,
  hostedPrHead: proposalHead,
  originUrl: 'https://github.com/jharvieux/AoP.git',
}
assertRuntimeCaptureProposalRepository(repositoryState)
expectProposalFailure('dirty tracked file', () =>
  assertRuntimeCaptureProposalRepository({
    ...repositoryState,
    statusPorcelain: ' M apps/web/src/styles.css',
  }),
)
expectProposalFailure('dirty untracked shipping source', () =>
  assertRuntimeCaptureProposalRepository({
    ...repositoryState,
    statusPorcelain: '?? apps/web/src/captureProposalEscape.ts',
  }),
)
expectProposalFailure('sparse checkout', () =>
  assertRuntimeCaptureProposalRepository({ ...repositoryState, sparseCheckout: true }),
)
expectProposalFailure('hosted PR head mismatch', () =>
  assertRuntimeCaptureProposalRepository({ ...repositoryState, hostedPrHead: 'b'.repeat(40) }),
)

inspectRuntimeCaptureProposalComment({ captureRecord: proposalUrl, comment: proposalComment })
expectProposalFailure('fake or unresolvable comment', () =>
  inspectRuntimeCaptureProposalComment({ captureRecord: proposalUrl, comment: null }),
)
expectProposalFailure('off-repository comment URL', () =>
  inspectRuntimeCaptureProposalComment({
    captureRecord: 'https://github.com/elsewhere/AoP/issues/610#issuecomment-9999999999',
    comment: proposalComment,
  }),
)
expectProposalFailure('wrong-issue comment URL', () =>
  inspectRuntimeCaptureProposalComment({
    captureRecord: 'https://github.com/jharvieux/AoP/issues/619#issuecomment-9999999999',
    comment: proposalComment,
  }),
)
expectProposalFailure('API response for wrong issue', () =>
  inspectRuntimeCaptureProposalComment({
    captureRecord: proposalUrl,
    comment: {
      ...proposalComment,
      issue_url: 'https://api.github.com/repos/jharvieux/AoP/issues/619',
    },
  }),
)
expectProposalFailure('non-owner comment', () =>
  inspectRuntimeCaptureProposalComment({
    captureRecord: proposalUrl,
    comment: { ...proposalComment, author_association: 'CONTRIBUTOR' },
  }),
)

expectProposalFailure('current capture head reused', () =>
  prepareRuntimeCaptureBaselineProposal({
    ...proposalDefaults,
    sourceHead: retainedMaterialBaseline.capture_head,
    captureRecord: proposalUrl,
  }),
)
const retainedCommentId = Number(captureRecord?.match(/issuecomment-(\d+)/)?.[1])
expectProposalFailure('current capture record reused', () =>
  prepareRuntimeCaptureBaselineProposal({
    ...proposalDefaults,
    sourceHead: proposalHead,
    captureRecord: captureRecord ?? '',
    comment: {
      ...proposalComment,
      id: retainedCommentId,
      html_url: captureRecord,
    },
  }),
)
expectProposalFailure('explicit confirmation omitted', () =>
  prepareRuntimeCaptureBaselineProposal({
    ...proposalDefaults,
    sourceHead: proposalHead,
    captureRecord: proposalUrl,
    confirmation: '',
  }),
)

const proposalArtifactPaths = [materialBaselineRelativePath, 'RUNTIME-CAPTURE-BINDINGS.json']
const proposalArtifactHashes = () =>
  proposalArtifactPaths.map((path) =>
    createHash('sha256')
      .update(readFileSync(join(root, path.split('/').at(-1))))
      .digest('hex'),
  )
const proposalHashesBefore = proposalArtifactHashes()
const verifiedProposal = prepareRuntimeCaptureBaselineProposal({
  ...proposalDefaults,
  sourceHead: proposalHead,
  captureRecord: proposalUrl,
})
const driftedProposal = prepareRuntimeCaptureBaselineProposal({
  ...proposalDefaults,
  sourceHead: proposalHead,
  captureRecord: proposalUrl,
  buildOptions: {
    overrides: new Map([[sourceDriftPath, driftedBuffer(sourceDriftPath, '\nproposal-drift')]]),
  },
})
const proposalHashesAfter = proposalArtifactHashes()
if (
  verifiedProposal.notice.startsWith('PROPOSAL ONLY:') === false ||
  JSON.stringify(Object.keys(verifiedProposal.captures)) !== JSON.stringify(expectedCaptureIds) ||
  verifiedProposal.bound_files.length < retainedBinding.shipping_sources.length ||
  verifiedProposal.comment.body_sha256 !==
    createHash('sha256').update(proposalComment.body).digest('hex') ||
  driftedProposal.material.sha256 === verifiedProposal.material.sha256 ||
  JSON.stringify(proposalHashesBefore) !== JSON.stringify(proposalHashesAfter)
) {
  console.error('FAIL proposal-only contract changed evidence or omitted opaque receipt facts')
  failures++
}
expectBindingDrift('proposal does not re-bless material drift', {
  overrides: new Map([[sourceDriftPath, driftedBuffer(sourceDriftPath, '\nproposal-drift')]]),
})
console.log('PASS capture proposal is read-only and cannot re-bless material drift')
const spec = readFileSync(join(root, 'README.md'), 'utf8')
const compose = readFileSync(join(root, 'compose.mjs'), 'utf8')
const proofSources = required.map(([rel]) => [rel, readFileSync(join(root, rel), 'utf8')])
const approvalMarkers = [
  retainedMaterialBaseline.captured_on,
  'operator approved all three exact-source runtime frames',
  retainedMaterialBaseline.capture_head,
  captureRecord,
  'docs/evidence-only commits only while',
  'complete schema-v3',
  'full stylesheet',
  'frozen capture states',
  'requires renewed capture approval',
]
for (const [name, source] of [
  ['README.md', spec],
  ['RUNTIME-VERIFICATION.md', runtimeReport],
]) {
  for (const marker of approvalMarkers) {
    if (!marker || !source.includes(marker)) {
      console.error(`FAIL ${name}: missing operator-approval binding marker ${marker}`)
      failures++
    }
  }
}
console.log('PASS operator approval is bound to exact runtime-source and capture bytes')
const builderSource = readFileSync(join(root, 'build-runtime-capture-bindings.mjs'), 'utf8')
const builderComputeIndex = builderSource.indexOf('const binding = buildRuntimeCaptureBindings()')
const builderWriteIndex = builderSource.indexOf('writeFileSync(')
if (
  builderComputeIndex < 0 ||
  builderWriteIndex < 0 ||
  builderComputeIndex > builderWriteIndex ||
  builderSource.includes('materialBaselinePath') ||
  builderSource.includes('prepareRuntimeCaptureBaselineProposal')
) {
  console.error(
    'FAIL normal capture builder can write before anchor validation or renew the anchor',
  )
  failures++
}
const renewalSource = readFileSync(join(root, 'renew-runtime-capture-baseline.mjs'), 'utf8')
for (const marker of [
  "'--source-head'",
  "'--capture-record'",
  "'--captured-on'",
  "'--confirmation'",
  'VERIFY_CAPTURE_RENEWAL_PROPOSAL',
  "'--untracked-files=all'",
  "'ls-remote'",
  "'view',\n        branch,",
  "'headRefName,headRefOid,headRepositoryOwner,state,url'",
  "'--hostname'",
  "['show', `${requestedHead}:${record.path}`]",
  'no_write_guard',
  'manual_next_step',
]) {
  if (!renewalSource.includes(marker)) {
    console.error(`FAIL capture-baseline proposal contract: missing ${marker}`)
    failures++
  }
}
for (const forbiddenWriter of [
  'writeFile',
  'appendFile',
  'rename',
  'copyFile',
  'truncate',
  'unlink',
  'rmSync',
]) {
  if (renewalSource.includes(forbiddenWriter)) {
    console.error(`FAIL proposal-only utility contains file writer ${forbiddenWriter}`)
    failures++
  }
}
for (const marker of [
  'RUNTIME-MATERIAL-BASELINE.json',
  'builder recomputes and compares that projection before writing',
  'it cannot update the anchor',
  'renew-runtime-capture-baseline.mjs',
  'proposal-only',
  'completely clean tracked and untracked worktree',
  'opaque comment body',
  'separately reviewed manual `apply_patch`',
  'require builder rejection',
]) {
  if (!runtimeReport.includes(marker)) {
    console.error(`FAIL RUNTIME-VERIFICATION.md: missing material-anchor contract ${marker}`)
    failures++
  }
}
for (const marker of [
  '212 shipping source files',
  '146 non-test files',
  'all 29 engine source files',
  'all 19 shared source files',
  'all 18 content source files',
  '22 web/package build inputs',
  'all **96** referenced public assets',
  'full `apps/web/src/styles.css` bytes as acceptance evidence',
  '34 calls and 28 unique MapCanvas/Minimap tokens',
  '26 values that schema v2 failed to include',
]) {
  if (!runtimeReport.includes(marker)) {
    console.error(`FAIL RUNTIME-VERIFICATION.md: stale schema-v3 census ${marker}`)
    failures++
  }
}
for (const marker of [
  '--color-action',
  '44 × 44',
  'GameScreen',
  'MatchScreen',
  'Pirata One',
  'Cabin',
  'tabular',
  'safe area',
  'Direction B',
]) {
  if (!spec.includes(marker)) {
    console.error(`FAIL README.md: missing ${marker}`)
    failures++
  }
}
const sheet = readFileSync(join(root, 'mockups/token-type-icon-sheet-1440x960.svg'), 'utf8')
for (const [label, marker] of [
  ['type section label separated from display sample', 'x="607" y="136"'],
  ['display sample below type section label', 'x="607" y="180"'],
  ['disabled slash inside the disabled control', 'M1136 480l100 24'],
]) {
  if (!sheet.includes(marker)) {
    console.error(`FAIL token sheet: missing ${label}`)
    failures++
  }
}
for (const [rel] of required) {
  const source = readFileSync(join(root, rel), 'utf8')
  const controls = [
    ...source.matchAll(
      /<rect data-control="([^"]+)" x="([0-9.]+)" y="([0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/g,
    ),
  ]
  if (!controls.length) {
    console.error(`FAIL ${rel}: no declared control geometry`)
    failures++
  }
  for (const [, name, x, y, width, height] of controls) {
    const pass = Number(width) >= 44 && Number(height) >= 44
    console.log(`${pass ? 'PASS' : 'FAIL'} ${rel}: ${name} at ${x},${y} is ${width}×${height}`)
    if (!pass) failures++
  }
}
const semanticColors = [
  ['surfaceCanvas', '#17100a'],
  ['ink', '#21150d'],
  ['wood', '#2d1b10'],
  ['woodRaised', '#3a2416'],
  ['woodHover', '#51331d'],
  ['surfaceDisabled', '#33291f'],
  ['parchment', '#f3e5c2'],
  ['parchmentHighlight', '#fff1ca'],
  ['parchmentMuted', '#cbb17a'],
  ['textMuted', '#b9a47b'],
  ['textDisabled', '#b4aa9a'],
  ['action', '#c8962c'],
  ['brass', '#c9a227'],
  ['brassHighlight', '#f0cb66'],
  ['focus', '#c8962c'],
  ['fog', '#0b1a26'],
  ['artScrim', '#07121a'],
  ['sea', '#1b4a6b'],
  ['land', '#4a7c3f'],
  ['danger', '#a6402f'],
  ['success', '#477447'],
  ['strokeDisabled', '#796f61'],
  ['courseSurface', '#172939'],
  ['costStroke', '#725838'],
]
for (const [name, value] of semanticColors) {
  const sourceParity = compose.includes(`${name}: '${value}'`)
  const docParity = spec.includes(`C.${name}`) && spec.includes(value)
  const proofParity = proofSources.some(([, source]) => source.includes(value))
  const pass = sourceParity && docParity && proofParity
  console.log(`${pass ? 'PASS' : 'FAIL'} semantic color ${name} = ${value}`)
  if (!pass) failures++
}
const colorBlockEnd = compose.indexOf('\n}\n\nfunction b64')
const misplacedSourceLiterals = [...compose.matchAll(/#[0-9a-fA-F]{6}/g)].filter(
  (match) => match.index > colorBlockEnd,
)
if (colorBlockEnd < 0 || misplacedSourceLiterals.length) {
  console.error(
    `FAIL source color census: unclassified literal(s) ${misplacedSourceLiterals.map((match) => match[0]).join(', ')}`,
  )
  failures++
} else {
  console.log('PASS source color census: all hex literals live in semantic C vocabulary')
}
for (const stale of ["brass: '#c8962c'", '#f6db83']) {
  if (
    compose.includes(stale) ||
    spec.includes(stale) ||
    proofSources.some(([, source]) => source.includes(stale))
  ) {
    console.error(`FAIL stale or conflated semantic color: ${stale}`)
    failures++
  }
}
const actionFilledControls = proofSources.flatMap(([, source]) => [
  ...source.matchAll(/<rect data-control="button"[^>]+fill="#c8962c"/g),
]).length
if (actionFilledControls !== 3) {
  console.error(
    `FAIL primary action census: expected 3 action-filled controls, found ${actionFilledControls}`,
  )
  failures++
} else {
  console.log('PASS primary action census: 3 action-filled controls')
}

const runtimeFiles = {
  styles: readFileSync(join(repoRoot, 'apps/web/src/styles.css'), 'utf8'),
  tokens: readFileSync(join(repoRoot, 'apps/web/src/colorTokens.ts'), 'utf8'),
  icons: readFileSync(join(repoRoot, 'apps/web/src/uiIcons.ts'), 'utf8'),
  map: readFileSync(join(repoRoot, 'apps/web/src/MapCanvas.tsx'), 'utf8'),
  minimap: readFileSync(join(repoRoot, 'apps/web/src/Minimap.tsx'), 'utf8'),
  editor: readFileSync(join(repoRoot, 'apps/web/src/mapEditor/MapEditorCanvas.tsx'), 'utf8'),
  cityScene: readFileSync(join(repoRoot, 'apps/web/src/CityScene.tsx'), 'utf8'),
  cityModals: readFileSync(join(repoRoot, 'apps/web/src/cityModals.tsx'), 'utf8'),
  sheet: readFileSync(join(repoRoot, 'apps/web/src/components/BottomSheet.tsx'), 'utf8'),
  game: readFileSync(join(repoRoot, 'apps/web/src/screens/GameScreen.tsx'), 'utf8'),
  match: readFileSync(join(repoRoot, 'apps/web/src/screens/MatchScreen.tsx'), 'utf8'),
}
const runtimeRoot = runtimeFiles.styles.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? ''
const rootTokens = new Map(
  [...runtimeRoot.matchAll(/^\s*(--[^:]+):\s*([^;]+);/gm)].map((match) => [
    match[1],
    match[2].trim(),
  ]),
)
const fallbackTokens = new Map(
  [
    ...runtimeFiles.tokens.matchAll(/['"](?<name>--[^'"]+)['"]:\s*['"](?<value>#[0-9a-f]+)['"]/gi),
  ].map((match) => [match.groups.name, match.groups.value]),
)
const canvasSources = [runtimeFiles.map, runtimeFiles.minimap, runtimeFiles.editor]
const canvasCalls = canvasSources.flatMap((source) => [
  ...source.matchAll(
    /cssToken\(\s*['"](?<name>--[^'"]+)['"]\s*,\s*['"](?<value>#[0-9a-f]+)['"]\s*\)/gi,
  ),
])
if (canvasCalls.length !== 40 || fallbackTokens.size !== 31) {
  console.error(
    `FAIL runtime token census: expected 40 calls / 31 properties, found ${canvasCalls.length} / ${fallbackTokens.size}`,
  )
  failures++
}
for (const call of canvasCalls) {
  const { name, value } = call.groups
  const fallback = fallbackTokens.get(name)
  const declaration = rootTokens.get(name)
  if (fallback !== value || declaration !== value) {
    console.error(
      `FAIL runtime token parity ${name}: call=${value}, fallback=${fallback}, CSS=${declaration}`,
    )
    failures++
  }
}
console.log(
  `PASS runtime token census: ${canvasCalls.length} calls / ${fallbackTokens.size} properties`,
)

for (const [name, value] of [
  ['--surface-canvas', '#17100a'],
  ['--surface-inset', '#21150d'],
  ['--color-action', '#c8962c'],
  ['--stroke-focus', '#c8962c'],
  ['--color-brass', '#c9a227'],
  ['--stroke-selected', '#c9a227'],
  ['--color-highlight', '#f0cb66'],
  ['--color-success', '#477447'],
  ['--text-success', '#b8dab2'],
  ['--map-own-unit', '#3be2a1'],
]) {
  if (rootTokens.get(name) !== value) {
    console.error(`FAIL runtime semantic token ${name}: expected ${value}`)
    failures++
  }
}
if (
  !spec.includes('`#17100a` / `#21150d`') ||
  !spec.includes('`--map-own-unit: #3be2a1`') ||
  !spec.includes('`--color-success: #477447`')
) {
  console.error('FAIL README runtime surface/success values do not match the approved proof')
  failures++
}
if (
  fallbackTokens.has('--color-success') ||
  fallbackTokens.get('--map-own-unit') !== '#3be2a1' ||
  canvasSources.some((source) => source.includes("cssToken('--color-success'")) ||
  !runtimeFiles.styles.includes('.map-editor-status {\n  color: var(--text-success);') ||
  !runtimeFiles.styles.includes('.map-editor-valid {\n  color: var(--text-success);')
) {
  console.error('FAIL semantic success is conflated with the bright own-unit map marker')
  failures++
}
for (const stale of ['--accent:', '--accent-2:', '--accent-glow:', '--color-gold:']) {
  if (runtimeFiles.styles.includes(stale)) {
    console.error(`FAIL stale runtime token declaration: ${stale}`)
    failures++
  }
}

const ownedGlyphSources = [
  ['MapCanvas.tsx', runtimeFiles.map],
  ['BottomSheet.tsx', runtimeFiles.sheet],
  ['GameScreen.tsx', runtimeFiles.game],
  ['MatchScreen.tsx', runtimeFiles.match],
]
for (const [name, source] of ownedGlyphSources) {
  if (/^\s*[+−×✓•⌖⛶]\s*$/mu.test(source)) {
    console.error(`FAIL platform control glyph remains in ${name}`)
    failures++
  }
}
for (const marker of [
  "viewBox: '0 0 20 20'",
  "stroke: 'currentColor'",
  "fill: 'currentColor'",
  "'aria-hidden': true",
  "focusable: 'false'",
]) {
  if (!runtimeFiles.icons.includes(marker)) {
    console.error(`FAIL runtime icon contract: missing ${marker}`)
    failures++
  }
}
for (const source of [runtimeFiles.game, runtimeFiles.match]) {
  for (const marker of [
    '<GameplayHud',
    'game-screen-container gameplay-chrome',
    'bottom-action-bar gameplay-command-dock',
    'data-gameplay-chrome="screen"',
    'data-gameplay-chrome="command-dock"',
  ]) {
    if (!source.includes(marker)) {
      console.error(`FAIL GameScreen/MatchScreen parity: missing ${marker}`)
      failures++
    }
  }
}
const disabledBindings = [
  runtimeFiles.game,
  runtimeFiles.match,
  runtimeFiles.cityScene,
  runtimeFiles.cityModals,
].flatMap((source) => [...source.matchAll(/\bdisabled=/g)]).length
if (
  !runtimeFiles.game.includes("aria-current={c.id === viewerCity?.id ? 'true' : undefined}") ||
  !runtimeFiles.cityModals.includes('aria-expanded={expanded}') ||
  disabledBindings !== 37
) {
  console.error(
    `FAIL shipping state census: expected roster aria-current, info aria-expanded, and 37 disabled bindings; found ${disabledBindings}`,
  )
  failures++
} else {
  console.log('PASS shipping state census: current, expanded, and 37 disabled bindings')
}
for (const marker of [
  'button:disabled::after',
  'outline: 2px solid var(--stroke-focus)',
  '0 0 0 4px var(--selected-glow)',
]) {
  if (!runtimeFiles.styles.includes(marker)) {
    console.error(`FAIL runtime control-state contract: missing ${marker}`)
    failures++
  }
}
for (const selector of [
  'button.primary',
  'button.secondary',
  'button.danger',
  '.map-nav-button',
  '.city-roster-entry',
  '.building-option',
  '.garrison-row__actions button',
  '.build-row__build',
  '.city-scene__building',
  '.city-scene-zoom button',
  '.city-scene-nav',
  '.info-toggle',
  '.sheet__close',
]) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = runtimeFiles.styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  if (!/(?:min-)?width: 44px/.test(block) || !/(?:min-)?height: 44px/.test(block)) {
    console.error(`FAIL runtime control geometry: ${selector} is not explicitly at least 44×44`)
    failures++
  }
}
console.log('PASS runtime control geometry: 13 touched families are explicitly at least 44×44')
console.log('PASS runtime icon, parity, and non-color state contracts')

if (failures) process.exit(1)
console.log('PASS #610 design-checkpoint and runtime package')
