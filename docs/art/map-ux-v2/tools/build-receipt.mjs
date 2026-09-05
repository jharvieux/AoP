import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageRoot, '../../..')
export const sourceHead = 'c1824f22bf14dca6d38f7519fd99affd789a8130'
export const sourceArchiveSha256 =
  '0464a34facfca2b4838983fccb0faa90932212d1c6e27932cca936f0f9e27903'

export const externalTouchCandidate = {
  status: 'recorded-and-xctest-passed; pending durable integration',
  attached_to_this_package: false,
  source_head: sourceHead,
  metadata_path: '/private/tmp/aop-613-touch-final-c1824f2/metadata/artifact-metadata.json',
  metadata_sha256: '1618a296f6a48c8b4151a294ab7d6ded2e63a99f8bb39389ff9e6d7e6ad7dad2',
  recording_path:
    '/private/tmp/aop-613-touch-final-c1824f2/artifacts/aop-613-touch-final-c1824f2.mov',
  recording_sha256: '0652360345bcd5f25ff0897a12d0b911b54510587d653d21b1c1d256364cb3c3',
  recording_bytes: 19337683,
  duration_seconds: 38.86,
  dimensions_pixels: [1206, 2622],
  frame_count: 2293,
  upload_candidate: {
    path: '/private/tmp/aop-613-touch-final-c1824f2/artifacts/aop-613-touch-final-c1824f2-github.mp4',
    sha256: '5ce7e92020d77acfb342890a914e9d9e609ccdeba70b33d34547ebf1ec5661d0',
    bytes: 920404,
    duration_seconds: 38.876947,
    dimensions_pixels: [720, 1566],
    frame_count: 2249,
    codec: 'H.264 High / yuv420p / BT.709',
  },
  harness_head: 'd4c3ef1e0f0aea21c858fed37baf68b5e0abf405',
  harness_binding_sha256: '7ef355a8e088daf20614014ed0a9ef481eab64146977fab044a844cb8bd9389b',
}

export const sourcePaths = [
  'apps/web/src/MapAlertRegion.tsx',
  'apps/web/src/MapAlertRegion.test.tsx',
  'apps/web/src/MapCanvas.tsx',
  'apps/web/src/Minimap.tsx',
  'apps/web/src/Minimap.test.tsx',
  'apps/web/src/mapCamera.ts',
  'apps/web/src/mapCamera.test.ts',
  'apps/web/src/mapCommandLayout.test.ts',
  'apps/web/src/mapCursor.ts',
  'apps/web/src/mapCursor.test.ts',
  'apps/web/src/screens/GameScreen.tsx',
  'apps/web/src/screens/GameScreen.test.ts',
  'apps/web/src/screens/MatchScreen.tsx',
  'apps/web/src/screens/MatchScreen.test.ts',
  'apps/web/src/singlePlayerPresentation.ts',
  'apps/web/src/singlePlayerPresentation.test.ts',
  'apps/web/src/styles.css',
]

export const harnessPaths = [
  'docs/art/map-ux-v2/tools/fixtureData.ts',
  'docs/art/map-ux-v2/tools/index.html',
  'docs/art/map-ux-v2/tools/runtime.tsx',
  'docs/art/map-ux-v2/tools/stubs/audioFeedback.ts',
  'docs/art/map-ux-v2/tools/stubs/auth.ts',
  'docs/art/map-ux-v2/tools/stubs/authConfig.ts',
  'docs/art/map-ux-v2/tools/stubs/realtimeTransport.ts',
  'docs/art/map-ux-v2/tools/stubs/reconnectSync.ts',
  'docs/art/map-ux-v2/tools/stubs/spectateClient.ts',
  'docs/art/map-ux-v2/tools/stubs/spectatePoll.ts',
  'docs/art/map-ux-v2/tools/stubs/submitWithRetry.ts',
  'docs/art/map-ux-v2/tools/stubs/turnSync.ts',
  'docs/art/map-ux-v2/tools/vite.config.ts',
]

export const captureSpecs = [
  {
    path: 'runtime-captures/map-phone-375x667.jpg',
    width: 375,
    height: 667,
    mode: 'single-player',
    state: 'full collision fixture',
    primary: true,
  },
  {
    path: 'runtime-captures/map-phone-minimap-focus-390x844.jpg',
    width: 390,
    height: 844,
    mode: 'single-player',
    state: 'full collision fixture; minimap keyboard focus',
    primary: true,
  },
  {
    path: 'runtime-captures/map-phone-landscape-844x390.jpg',
    width: 844,
    height: 390,
    mode: 'single-player',
    state: 'full collision fixture; compact More resign confirmation',
    primary: true,
  },
  {
    path: 'runtime-captures/map-tablet-portrait-768x1024.jpg',
    width: 768,
    height: 1024,
    mode: 'single-player',
    state: 'full collision fixture',
    primary: true,
  },
  {
    path: 'runtime-captures/map-tablet-landscape-1024x768.jpg',
    width: 1024,
    height: 768,
    mode: 'multiplayer',
    state: 'sanitized PlayerView; two halted orders and route fixture',
    primary: true,
  },
  {
    path: 'runtime-captures/map-desktop-more-1440x900.jpg',
    width: 1440,
    height: 900,
    mode: 'single-player',
    state: 'full collision fixture; More commands open',
    primary: true,
  },
  {
    path: 'runtime-captures/map-phone-landscape-mp-844x390.jpg',
    width: 844,
    height: 390,
    mode: 'multiplayer',
    state: 'sanitized PlayerView; two halted orders, route fixture, and compact More confirmation',
    primary: false,
  },
]

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function git(...args) {
  return execFileSync('git', args, { cwd: repoRoot, maxBuffer: 128 * 1024 * 1024 })
}

function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('capture is not a JPEG')
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }
    const length = bytes.readUInt16BE(offset + 2)
    if (length < 2 || offset + length + 2 > bytes.length) throw new Error('invalid JPEG segment')
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) }
    }
    offset += length + 2
  }
  throw new Error('JPEG dimensions are missing')
}

function material(path, bytes) {
  return { path, bytes: bytes.length, sha256: sha256(bytes) }
}

export function validateReceipt(receipt) {
  if (receipt.schema !== 'aop-map-ux-runtime-captures-v2') throw new Error('unexpected schema')
  if (receipt.issue !== 613) throw new Error('unexpected issue')
  if (receipt.source_head !== sourceHead) throw new Error('source head drift')
  if (receipt.source_archive_sha256 !== sourceArchiveSha256) {
    throw new Error('source archive binding drift')
  }
  if (receipt.approval.captures_operator_approved) throw new Error('operator approval is unclaimed')
  if (receipt.approval.touch_recording_attached) throw new Error('touch recording is unclaimed')
  if (receipt.capability_gates.touch_recording.status !== 'pending-integration') {
    throw new Error('touch gate must remain pending-integration')
  }
  if (
    JSON.stringify(receipt.capability_gates.touch_recording.external_candidate) !==
    JSON.stringify(externalTouchCandidate)
  ) {
    throw new Error('external touch candidate drift')
  }
  const required = new Set(['375x667', '390x844', '844x390', '768x1024', '1024x768', '1440x900'])
  const primary = receipt.captures.filter((capture) => capture.primary)
  if (primary.length !== required.size) throw new Error('primary capture count drift')
  for (const capture of primary) required.delete(`${capture.width}x${capture.height}`)
  if (required.size) throw new Error(`missing primary viewport(s): ${[...required].join(', ')}`)
  if (!receipt.captures.some((capture) => !capture.primary && capture.mode === 'multiplayer')) {
    throw new Error('supplemental multiplayer collision proof is missing')
  }
  for (const capture of receipt.captures) {
    if (capture.bytes >= 300 * 1024) throw new Error(`${capture.path}: exceeds 300 KiB`)
    const bytes = readFileSync(resolve(packageRoot, capture.path))
    const dimensions = jpegSize(bytes)
    if (capture.bytes !== bytes.length) throw new Error(`${capture.path}: byte count drift`)
    if (capture.sha256 !== sha256(bytes)) throw new Error(`${capture.path}: SHA-256 drift`)
    if (capture.width !== dimensions.width || capture.height !== dimensions.height) {
      throw new Error(`${capture.path}: dimension drift`)
    }
  }
  const bound = structuredClone(receipt)
  const binding = bound.binding_sha256
  delete bound.binding_sha256
  if (binding !== sha256(Buffer.from(JSON.stringify(bound)))) throw new Error('binding drift')
}

export function buildReceipt() {
  const resolvedHead = git('rev-parse', `${sourceHead}^{commit}`).toString().trim()
  if (resolvedHead !== sourceHead) throw new Error('source commit does not resolve exactly')
  const sourceTree = git('rev-parse', `${sourceHead}^{tree}`).toString().trim()
  const sourceArchive = git('archive', '--format=tar', sourceHead)
  if (sha256(sourceArchive) !== sourceArchiveSha256) throw new Error('source archive drift')
  const sourceFiles = sourcePaths.map((path) => {
    const committed = git('show', `${sourceHead}:${path}`)
    const current = readFileSync(resolve(repoRoot, path))
    if (!committed.equals(current))
      throw new Error(`${path}: current source differs from capture head`)
    return material(path, committed)
  })
  const harnessFiles = harnessPaths.map((path) =>
    material(path, readFileSync(resolve(repoRoot, path))),
  )
  const measurements = material(
    'docs/art/map-ux-v2/RUNTIME-MEASUREMENTS.json',
    readFileSync(resolve(packageRoot, 'RUNTIME-MEASUREMENTS.json')),
  )
  const captures = captureSpecs.map((spec) => {
    const bytes = readFileSync(resolve(packageRoot, spec.path))
    const dimensions = jpegSize(bytes)
    if (dimensions.width !== spec.width || dimensions.height !== spec.height) {
      throw new Error(`${spec.path}: expected ${spec.width}x${spec.height}`)
    }
    return { ...spec, bytes: bytes.length, sha256: sha256(bytes) }
  })
  const receipt = {
    schema: 'aop-map-ux-runtime-captures-v2',
    issue: 613,
    captured_on: '2026-09-05',
    source_head: sourceHead,
    source_tree: sourceTree,
    source_archive_sha256: sourceArchiveSha256,
    browser: 'Codex in-app Browser (Chrome)',
    desktop_reference: 'M5 MacBook Air',
    harness: {
      single_player: '/docs/art/map-ux-v2/tools/index.html?mode=sp',
      multiplayer: '/docs/art/map-ux-v2/tools/index.html?mode=mp',
      files: harnessFiles,
    },
    source_files: sourceFiles,
    measurements,
    approval: {
      captures_operator_approved: false,
      touch_recording_attached: false,
      physical_phone_performance_available: false,
    },
    capability_gates: {
      touch_recording: {
        status: 'pending-integration',
        reason:
          'The exact-source Simulator run passed, but its MOV and metadata are not attached to this package.',
        external_candidate: externalTouchCandidate,
      },
    },
    captures,
  }
  receipt.binding_sha256 = sha256(Buffer.from(JSON.stringify(receipt)))
  validateReceipt(receipt)
  return receipt
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const receipt = buildReceipt()
  writeFileSync(
    resolve(packageRoot, 'RUNTIME-CAPTURE-MANIFEST.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
  )
  console.log(`wrote ${receipt.captures.length} captures; binding ${receipt.binding_sha256}`)
}
