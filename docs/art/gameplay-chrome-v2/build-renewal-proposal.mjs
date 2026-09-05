import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCaptureReady,
  sourceHead,
  sourceTree,
  validateCaptureReady,
} from './renewal-fixture/build-capture-ready.mjs'

const chromeRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(chromeRoot, '../../..')
const terrainRoot = join(repoRoot, 'docs/art/world-map-v2/terrain')
const captureReadyPath = join(chromeRoot, 'renewal-fixture/CAPTURE-READY.json')
const ingestionPath = join(chromeRoot, 'renewal-candidates/INGESTION.json')
const observationsPath = join(chromeRoot, 'renewal-candidates/OBSERVATIONS.json')
const chromeProposalPath = join(chromeRoot, 'renewal-candidates/PROPOSAL.json')
const terrainProposalPath = join(terrainRoot, 'renewal-candidates/PROPOSAL.json')
const maxBytes = 300 * 1024
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

const specs = [
  {
    id: 'chrome-phone-world',
    set: 'gameplay-chrome-v2',
    path: 'docs/art/gameplay-chrome-v2/renewal-candidates/runtime-phone-world-375x812.png',
    dimensions: [375, 812],
    colorType: 2,
    scene: 'chrome-world',
    devicePixelRatio: 2,
  },
  {
    id: 'chrome-city-inspector',
    set: 'gameplay-chrome-v2',
    path: 'docs/art/gameplay-chrome-v2/renewal-candidates/runtime-city-inspector-1440x900.png',
    dimensions: [1440, 900],
    colorType: 3,
    scene: 'chrome-city',
    devicePixelRatio: 1,
  },
  {
    id: 'chrome-interaction-states',
    set: 'gameplay-chrome-v2',
    path: 'docs/art/gameplay-chrome-v2/renewal-candidates/runtime-interaction-states-1440x960.png',
    dimensions: [1440, 960],
    colorType: 3,
    scene: 'chrome-city',
    devicePixelRatio: 1,
  },
  ...['desktop', 'phone'].flatMap((viewport) =>
    ['overview', 'tactical', 'detail'].map((band) => ({
      id: `terrain-${viewport}-${band}`,
      set: 'world-map-terrain-v2',
      path: `docs/art/world-map-v2/terrain/renewal-candidates/${viewport}-${band}.png`,
      dimensions: viewport === 'desktop' ? [1440, 900] : [390, 844],
      colorType: null,
      scene: 'terrain',
      band,
      devicePixelRatio: viewport === 'phone' ? 2 : 1,
    })),
  ),
]

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function canonicalDigest(value) {
  return sha256(JSON.stringify(value))
}

function record(path) {
  const bytes = readFileSync(join(repoRoot, path))
  return { path, bytes: bytes.length, sha256: sha256(bytes) }
}

function inspectPng(spec) {
  const bytes = readFileSync(join(repoRoot, spec.path))
  if (!bytes.subarray(0, 8).equals(pngSignature)) throw new Error(`${spec.id}: not a true PNG`)
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error(`${spec.id}: no IHDR`)
  const dimensions = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  const colorType = bytes[25]
  if (JSON.stringify(dimensions) !== JSON.stringify(spec.dimensions)) {
    throw new Error(`${spec.id}: dimensions drift`)
  }
  if (spec.colorType !== null && colorType !== spec.colorType) {
    throw new Error(`${spec.id}: expected PNG color type ${spec.colorType}, got ${colorType}`)
  }
  if (bytes.length > maxBytes) throw new Error(`${spec.id}: exceeds 300 KiB`)
  return { ...record(spec.path), dimensions, png_color_type: colorType }
}

function validateObservation(frame, spec) {
  if (frame.id !== spec.id || frame.scene !== spec.scene)
    throw new Error(`${spec.id}: observation identity drift`)
  if (JSON.stringify(frame.viewport) !== JSON.stringify(spec.dimensions)) {
    throw new Error(`${spec.id}: observed viewport drift`)
  }
  if (frame.device_pixel_ratio !== spec.devicePixelRatio) {
    throw new Error(`${spec.id}: observed device-pixel-ratio drift`)
  }
  if (frame.settle_ms < 1200) throw new Error(`${spec.id}: frame was not settled for 1.2 seconds`)
  const measured = frame.measurements
  if (JSON.stringify(measured.document_client) !== JSON.stringify(frame.viewport)) {
    throw new Error(`${spec.id}: document client viewport drift`)
  }
  if (JSON.stringify(measured.document_scroll) !== JSON.stringify(frame.viewport)) {
    throw new Error(`${spec.id}: document overflow`)
  }
  if (
    measured.busy ||
    measured.map_error ||
    measured.fonts_status !== 'loaded' ||
    !Number.isInteger(measured.total_images) ||
    measured.total_images < 1 ||
    measured.loaded_images !== measured.total_images ||
    measured.incomplete_images !== 0
  ) {
    throw new Error(`${spec.id}: runtime was not visibly complete`)
  }
  if (measured.undersized_direct_targets !== 0 || measured.minimum_direct_target < 44) {
    throw new Error(`${spec.id}: undersized visible direct target`)
  }
  if (spec.band && measured.camera?.band !== spec.band) {
    throw new Error(`${spec.id}: expected ${spec.band} band, got ${measured.camera?.band}`)
  }
  if (
    !frame.native_inspection?.original_size ||
    !frame.native_inspection?.fonts_complete ||
    !frame.native_inspection?.art_complete ||
    frame.native_inspection?.clipped_label ||
    frame.native_inspection?.missing_image ||
    frame.native_inspection?.map_error
  ) {
    throw new Error(`${spec.id}: native inspection did not pass`)
  }
}

function validateRectangle(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    value.some((part) => !Number.isFinite(part)) ||
    value[2] <= 0 ||
    value[3] <= 0
  ) {
    throw new Error(`${label}: invalid measured rectangle`)
  }
}

function rectangleContains(outer, inner) {
  const [outerX, outerY, outerWidth, outerHeight] = outer
  const [innerX, innerY, innerWidth, innerHeight] = inner
  return (
    innerX >= outerX &&
    innerY >= outerY &&
    innerX + innerWidth <= outerX + outerWidth &&
    innerY + innerHeight <= outerY + outerHeight
  )
}

function validateMoreState(frame, expectedState) {
  if (
    frame.id !== `desktop-more-${expectedState}` ||
    frame.scene !== 'chrome-world' ||
    JSON.stringify(frame.viewport) !== JSON.stringify([1440, 900]) ||
    frame.device_pixel_ratio !== 1 ||
    frame.settle_ms < 1200
  ) {
    throw new Error(`More ${expectedState}: capture boundary drift`)
  }
  const measured = frame.measurements
  if (
    JSON.stringify(measured.document_client) !== JSON.stringify(frame.viewport) ||
    JSON.stringify(measured.document_scroll) !== JSON.stringify(frame.viewport) ||
    measured.busy ||
    measured.map_error ||
    measured.fonts_status !== 'loaded' ||
    !Number.isInteger(measured.total_images) ||
    measured.total_images < 1 ||
    measured.loaded_images !== measured.total_images ||
    measured.incomplete_images !== 0 ||
    measured.undersized_direct_targets !== 0 ||
    measured.minimum_direct_target < 44
  ) {
    throw new Error(`More ${expectedState}: runtime completeness drift`)
  }
  const geometry = measured.more
  if (
    geometry?.state !== expectedState ||
    geometry.open !== true ||
    geometry.menu_within_viewport !== true ||
    geometry.menu_within_command_dock !== true ||
    !Array.isArray(geometry.positive_intersections) ||
    geometry.positive_intersections.length !== 0
  ) {
    throw new Error(`More ${expectedState}: escaped or intersecting menu`)
  }
  validateRectangle(measured.command_dock, `More ${expectedState} command dock`)
  validateRectangle(geometry.details, `More ${expectedState} details`)
  validateRectangle(geometry.toggle, `More ${expectedState} toggle`)
  validateRectangle(geometry.menu, `More ${expectedState} menu`)
  if (geometry.toggle[2] < 44 || geometry.toggle[3] < 44 || geometry.menu[3] !== 44) {
    throw new Error(`More ${expectedState}: toggle/menu geometry drift`)
  }
  const expectedActions =
    expectedState === 'open' ? ['Saves', 'Resign'] : ['Saves', 'Confirm Resign', 'Cancel']
  if (
    JSON.stringify(geometry.actions.map((action) => action.label)) !==
    JSON.stringify(expectedActions)
  ) {
    throw new Error(`More ${expectedState}: action identity drift`)
  }
  const viewport = [0, 0, ...frame.viewport]
  if (
    !rectangleContains(viewport, geometry.menu) ||
    !rectangleContains(measured.command_dock, geometry.menu) ||
    !rectangleContains(geometry.details, geometry.toggle)
  ) {
    throw new Error(`More ${expectedState}: measured containment drift`)
  }
  for (const action of geometry.actions) {
    validateRectangle(action.rect, `More ${expectedState} ${action.label}`)
    if (action.rect[2] < 44 || action.rect[3] < 44) {
      throw new Error(`More ${expectedState}: undersized ${action.label}`)
    }
    if (!rectangleContains(geometry.menu, action.rect)) {
      throw new Error(`More ${expectedState}: ${action.label} escaped the menu`)
    }
  }
}

function validateObservations(observations) {
  if (observations.schema !== 'aop-cross-evidence-observations-v1' || observations.issue !== 613) {
    throw new Error('observation identity drift')
  }
  if (
    observations.source_head !== sourceHead ||
    observations.source_tree !== sourceTree ||
    observations.browser !== 'Codex in-app Browser (Chrome)' ||
    observations.screenshot_dimensions !== 'CSS viewport pixels'
  ) {
    throw new Error('observation source/browser boundary drift')
  }
  if (
    !observations.terrain.fresh_origin ||
    !observations.terrain.same_live_session ||
    observations.terrain.gameplay_actions_between_captures !== 0 ||
    observations.terrain.seed !== 611 ||
    JSON.stringify(observations.terrain.dimensions) !== JSON.stringify([96, 96]) ||
    observations.terrain.topology !== 'square' ||
    observations.terrain.players !== 5 ||
    observations.terrain.round !== 1 ||
    observations.terrain.theme !== 'default/no override'
  ) {
    throw new Error('terrain fixture/session boundary drift')
  }
  if (observations.frames.length !== specs.length) throw new Error('observation frame count drift')
  const byId = new Map(observations.frames.map((frame) => [frame.id, frame]))
  if (byId.size !== specs.length) throw new Error('duplicate observation frame identity')
  for (const spec of specs) {
    const frame = byId.get(spec.id)
    if (!frame) throw new Error(`${spec.id}: observation missing`)
    validateObservation(frame, spec)
  }
  if (!Array.isArray(observations.more_states) || observations.more_states.length !== 2) {
    throw new Error('More open/confirm observation count drift')
  }
  const moreStates = new Map(observations.more_states.map((frame) => [frame.id, frame]))
  if (moreStates.size !== 2) throw new Error('duplicate More observation identity')
  for (const state of ['open', 'confirm']) {
    const frame = moreStates.get(`desktop-more-${state}`)
    if (!frame) throw new Error(`More ${state}: observation missing`)
    validateMoreState(frame, state)
  }
  const supplemental = observations.more_supplemental
  if (
    supplemental?.status !== 'captured-for-separate-map-ux-evidence' ||
    supplemental.state !== 'confirm' ||
    supplemental.raw_format !== 'JPEG' ||
    JSON.stringify(supplemental.raw_dimensions) !== JSON.stringify([1440, 900]) ||
    supplemental.raw_bytes !== 47351 ||
    supplemental.raw_sha256 !==
      '8660a4d5ba63ce2db2b39a2e25b97158390f4e8d8bde5ed32942c3927d8fc481' ||
    supplemental.committed_in_this_proposal !== false ||
    !supplemental.native_inspection?.original_size ||
    !supplemental.native_inspection?.actions_complete ||
    supplemental.native_inspection?.clipped_label ||
    supplemental.native_inspection?.missing_image ||
    supplemental.native_inspection?.positive_intersections !== 0
  ) {
    throw new Error('More supplemental observation drift')
  }
}

export function buildProposal() {
  const captureReady = JSON.parse(readFileSync(captureReadyPath, 'utf8'))
  validateCaptureReady(captureReady, buildCaptureReady())
  const ingestion = JSON.parse(readFileSync(ingestionPath, 'utf8'))
  const observations = JSON.parse(readFileSync(observationsPath, 'utf8'))
  validateObservations(observations)
  if (
    ingestion.schema !== 'aop-cross-evidence-ingestion-v1' ||
    ingestion.status !== 'unapproved-candidates' ||
    ingestion.approval_record !== null ||
    ingestion.source_head !== sourceHead ||
    ingestion.captures.length !== specs.length
  ) {
    throw new Error('capture ingestion boundary drift')
  }

  const ingestedByPath = new Map(ingestion.captures.map((capture) => [capture.path, capture]))
  const observedById = new Map(observations.frames.map((frame) => [frame.id, frame]))
  const captures = specs.map((spec) => {
    const png = inspectPng(spec)
    const ingested = ingestedByPath.get(spec.path)
    if (!ingested || ingested.sha256 !== png.sha256 || ingested.bytes !== png.bytes) {
      throw new Error(`${spec.id}: ingestion/candidate byte drift`)
    }
    return {
      id: spec.id,
      set: spec.set,
      scene: spec.scene,
      ...(spec.band ? { band: spec.band } : {}),
      ...png,
      encoding: {
        palette_colors: ingested.palette_colors,
        decoded_rgb_sha256: ingested.decoded_rgb_sha256,
        rgb_rmse: ingested.rgb_rmse,
      },
      observation: observedById.get(spec.id),
    }
  })
  const captureReadyFile = record('docs/art/gameplay-chrome-v2/renewal-fixture/CAPTURE-READY.json')
  const ingestionFile = record('docs/art/gameplay-chrome-v2/renewal-candidates/INGESTION.json')
  const observationsFile = record(
    'docs/art/gameplay-chrome-v2/renewal-candidates/OBSERVATIONS.json',
  )
  const candidateBoundary = {
    source_head: sourceHead,
    source_tree: sourceTree,
    capture_ready_binding: captureReady.binding_sha256,
    capture_ready_file: captureReadyFile,
    source_material: captureReady.source.material,
    renderer_material: captureReady.renderer.material,
    fixture_material: captureReady.fixture.material,
    more_command_repair: captureReady.more_command_repair,
    ingestion_file: ingestionFile,
    ingestion_digest: ingestion.ingestion_digest,
    observations_file: observationsFile,
    observations_digest: canonicalDigest(observations),
    captures: captures.map(({ observation: _observation, ...capture }) => capture),
  }
  const combinedDigest = canonicalDigest(candidateBoundary)
  const base = {
    schema: 'aop-cross-evidence-renewal-proposal-v1',
    issue: 613,
    status: 'unapproved-proposal',
    approval: { status: 'pending-direct-operator-approval', record: null },
    source_head: sourceHead,
    source_tree: sourceTree,
    candidate_digest: combinedDigest,
    capture_ready: captureReadyFile,
    capture_ready_binding: captureReady.binding_sha256,
    source_material: captureReady.source.material,
    renderer_material: captureReady.renderer.material,
    fixture_material: captureReady.fixture.material,
    more_command_repair: captureReady.more_command_repair,
    ingestion: ingestionFile,
    observations: observationsFile,
    historical_approvals_reusable: false,
    immutable_chrome_material_anchor: captureReady.historical_approvals[0],
  }
  const chrome = {
    ...base,
    evidence_set: 'gameplay-chrome-v2',
    captures: captures.filter((capture) => capture.set === 'gameplay-chrome-v2'),
  }
  const terrain = {
    ...base,
    evidence_set: 'world-map-terrain-v2',
    captures: captures.filter((capture) => capture.set === 'world-map-terrain-v2'),
  }
  return { chrome, terrain, candidateBoundary }
}

export function validateProposal(proposal, expected) {
  if (JSON.stringify(proposal) !== JSON.stringify(expected)) throw new Error('proposal drift')
  if (
    proposal.status !== 'unapproved-proposal' ||
    proposal.approval.status !== 'pending-direct-operator-approval' ||
    proposal.approval.record !== null ||
    proposal.historical_approvals_reusable !== false
  ) {
    throw new Error('proposal improperly claims approval')
  }
}

function expectRejected(label, expected, mutate) {
  const candidate = structuredClone(expected)
  mutate(candidate)
  try {
    validateProposal(candidate, expected)
  } catch {
    return
  }
  throw new Error(`proposal negative control accepted ${label}`)
}

function expectObservationRejected(label, expected, mutate) {
  const candidate = structuredClone(expected)
  mutate(candidate)
  try {
    validateObservations(candidate)
  } catch {
    return
  }
  throw new Error(`observation negative control accepted ${label}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const first = buildProposal()
  const second = buildProposal()
  if (JSON.stringify(first) !== JSON.stringify(second))
    throw new Error('proposal build is not deterministic')
  if (process.argv.includes('--write')) {
    writeFileSync(chromeProposalPath, `${JSON.stringify(first.chrome, null, 2)}\n`)
    writeFileSync(terrainProposalPath, `${JSON.stringify(first.terrain, null, 2)}\n`)
  } else {
    validateProposal(JSON.parse(readFileSync(chromeProposalPath, 'utf8')), first.chrome)
    validateProposal(JSON.parse(readFileSync(terrainProposalPath, 'utf8')), first.terrain)
  }
  expectRejected('premature approval', first.chrome, (proposal) => {
    proposal.approval.status = 'approved'
  })
  expectRejected('candidate digest drift', first.chrome, (proposal) => {
    proposal.candidate_digest = '0'.repeat(64)
  })
  expectRejected('capture omission', first.terrain, (proposal) => {
    proposal.captures.pop()
  })
  expectRejected('capture hash drift', first.terrain, (proposal) => {
    proposal.captures[0].sha256 = '0'.repeat(64)
  })
  expectRejected('More repair binding omission', first.chrome, (proposal) => {
    delete proposal.more_command_repair
  })
  const observations = JSON.parse(readFileSync(observationsPath, 'utf8'))
  expectObservationRejected('More menu intersection', observations, (candidate) => {
    candidate.more_states[1].measurements.more.positive_intersections.push({
      with: 'route',
      area: 1,
    })
  })
  expectObservationRejected('More menu viewport escape', observations, (candidate) => {
    candidate.more_states[1].measurements.more.menu_within_viewport = false
  })
  expectObservationRejected('More menu measured dock escape', observations, (candidate) => {
    candidate.more_states[1].measurements.more.menu[1] = 700
  })
  console.log(
    `renewal proposal PASS: 3 chrome + 6 terrain true PNGs; candidate ${first.chrome.candidate_digest}; deterministic/negative controls PASS; approval remains pending`,
  )
}
