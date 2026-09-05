/**
 * Validate the pending #613 cross-evidence boundary or build an unapproved capture proposal.
 *
 * This tool never edits retained evidence, approval records, bindings, or #610's material anchor.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(packageRoot, '../../..')
const manifestPath = join(packageRoot, 'RUNTIME-EVIDENCE-RENEWAL.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const maxCaptureBytes = 300 * 1024
const capturedPendingStatus = 'captured-pending-direct-operator-approval'
const recaptureRequiredStatus = 'recapture-required-for-final-source'
const approvedRenewalStatus = 'approved-exact-source'
const approvedEvidenceHead = '08717289778883d7adca6ff7a6f15b20fb7c6b25'
const promotionHead = 'ec86cebf1d0d4c70c2a670f142bdddf6fab265ee'
const approvedRecords = new Map([
  ['city-harbor-v2', 'https://github.com/jharvieux/AoP/issues/608#issuecomment-5555061289'],
  ['gameplay-chrome-v2', 'https://github.com/jharvieux/AoP/issues/610#issuecomment-5555063774'],
  ['world-map-terrain-v2', 'https://github.com/jharvieux/AoP/issues/611#issuecomment-5555066496'],
  ['city-ui-v2', 'https://github.com/jharvieux/AoP/issues/612#issuecomment-5555069230'],
])
const renewalRecord = 'https://github.com/jharvieux/AoP/issues/613#issuecomment-5555054349'

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function repoPath(path) {
  const absolute = resolve(repoRoot, path)
  assert(absolute.startsWith(`${repoRoot}${sep}`), `path escapes repository: ${path}`)
  return absolute
}

function readRegular(path) {
  const details = lstatSync(path)
  assert(details.isFile() && !details.isSymbolicLink(), `expected regular file: ${path}`)
  return readFileSync(path)
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

function inspectJpeg(bytes, label) {
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
  return { width: frame.width, height: frame.height, format: 'jpeg-rgb' }
}

function inspectPng(bytes, label) {
  assert(bytes.subarray(0, 8).equals(pngSignature), `${label}: expected PNG signature`)
  assert(bytes.subarray(12, 16).toString('ascii') === 'IHDR', `${label}: missing PNG IHDR`)
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
    format: 'png',
  }
}

function inspectCapture(bytes, spec, label) {
  assert(bytes.length <= maxCaptureBytes, `${label}: exceeds 300 KiB evidence ceiling`)
  const observed = spec[3] === 'jpeg-rgb' ? inspectJpeg(bytes, label) : inspectPng(bytes, label)
  assert(
    observed.width === spec[1] && observed.height === spec[2],
    `${label}: expected ${spec[1]}x${spec[2]}, got ${observed.width}x${observed.height}`,
  )
  if (spec[3] === 'png-rgb-2') {
    assert(observed.colorType === 2, `${label}: expected PNG color type 2`)
  }
  if (spec[3] === 'png-indexed-3') {
    assert(observed.colorType === 3, `${label}: expected PNG color type 3`)
  }
  return {
    bytes: bytes.length,
    sha256: sha256(bytes),
    dimensions: [observed.width, observed.height],
  }
}

function inspectHistoricalCapture(bytes, spec, label) {
  assert(bytes.length <= maxCaptureBytes, `${label}: exceeds 300 KiB evidence ceiling`)
  const observed = bytes.subarray(0, 8).equals(pngSignature)
    ? inspectPng(bytes, label)
    : inspectJpeg(bytes, label)
  assert(
    observed.width === spec[1] && observed.height === spec[2],
    `${label}: expected ${spec[1]}x${spec[2]}, got ${observed.width}x${observed.height}`,
  )
  return {
    bytes: bytes.length,
    sha256: sha256(bytes),
    dimensions: [observed.width, observed.height],
  }
}

function validateManifest() {
  assert(manifest.schema === 1 && manifest.issue === 613, 'unexpected renewal manifest identity')
  assert(manifest.status === 'pending-renewal', 'renewal must remain pending before capture')
  assert(
    manifest.approval?.status === 'pending-direct-operator-approval' &&
      manifest.approval.record === null,
    'old approval must not be reused for #613 renewal',
  )
  assert(/^[0-9a-f]{40}$/.test(manifest.targetSourceHead), 'invalid target source head')
  assert(manifest.sets.length === 4, 'expected four evidence sets')
  const expectedCounts = new Map([
    ['city-ui-v2', 20],
    ['city-harbor-v2', 8],
    ['gameplay-chrome-v2', 3],
    ['world-map-terrain-v2', 6],
  ])
  const captureKeys = new Set()
  let total = 0
  for (const set of manifest.sets) {
    assert(expectedCounts.get(set.id) === set.count, `${set.id}: unexpected required count`)
    assert(set.captures.length === set.count, `${set.id}: capture inventory count drift`)
    assert(set.historicalBinding.reusable === false, `${set.id}: old approval became reusable`)
    assert(set.historicalBinding.approvalRecord, `${set.id}: missing historical approval record`)
    if (set.renewal) {
      assert(
        [capturedPendingStatus, recaptureRequiredStatus].includes(set.renewal.status),
        `${set.id}: invalid renewal status`,
      )
      assert(
        set.renewal.sourceHead === manifest.targetSourceHead,
        `${set.id}: renewal source head drift`,
      )
      const superseded = set.renewal.supersededCapture
      assert(superseded?.sourceHead && superseded.sourceHead !== manifest.targetSourceHead)
      assert(/^[0-9a-f]{40}$/.test(superseded.recordHead), `${set.id}: prior record head drift`)
      assert(/^[0-9a-f]{64}$/.test(superseded.bindingSha256), `${set.id}: prior binding drift`)
      assert(superseded.reusable === false, `${set.id}: prior pixels became reusable`)
      assert(
        superseded.approval?.status === 'pending-direct-operator-approval' &&
          superseded.approval.record === null,
        `${set.id}: prior unapproved status drift`,
      )
      if (set.renewal.status === capturedPendingStatus) {
        assert(
          /^\d{4}-\d{2}-\d{2}$/.test(set.renewal.capturedOn),
          `${set.id}: invalid capture date`,
        )
        assert(/^[0-9a-f]{64}$/.test(set.renewal.bindingSha256), `${set.id}: invalid binding hash`)
        assert(
          set.renewal.historicalPixelsReused === false,
          `${set.id}: historical pixel reuse record drift`,
        )
        assert(
          set.renewal.visualSettleInspection === 'completed-by-integration-owner' &&
            set.renewal.nativeSizeInspection === 'completed-by-integration-owner',
          `${set.id}: native inspection record drift`,
        )
      } else {
        assert(
          set.renewal.capturedOn === undefined && set.renewal.bindingSha256 === undefined,
          `${set.id}: uncaptured target has current evidence metadata`,
        )
        assert(
          set.renewal.visualSettleInspection === 'pending-fresh-capture' &&
            set.renewal.nativeSizeInspection === 'pending-fresh-capture',
          `${set.id}: recapture-required inspection status drift`,
        )
      }
      assert(
        set.renewal.approval?.status === 'pending-direct-operator-approval' &&
          set.renewal.approval.record === null,
        `${set.id}: replacement pixels must remain unapproved`,
      )
      assert(
        /^[0-9a-f]{40}$/.test(set.historicalBinding.evidenceHead),
        `${set.id}: historical evidence head missing`,
      )
      assert(
        /^[0-9a-f]{40}$/.test(set.historicalBinding.recordHead),
        `${set.id}: historical binding record head missing`,
      )
    }
    assert(set.recipe.length > 100, `${set.id}: capture recipe is incomplete`)
    for (const spec of set.captures) {
      assert(spec.length === 4, `${set.id}: malformed capture specification`)
      const key = `${set.id}/${spec[0]}`
      assert(!captureKeys.has(key), `${set.id}: duplicate capture ${spec[0]}`)
      captureKeys.add(key)
      total += 1
    }
  }
  assert(total === 37, `expected 37 captures, found ${total}`)
}

function validateApprovedManifest() {
  assert(manifest.schema === 1 && manifest.issue === 613, 'unexpected renewal manifest identity')
  assert(manifest.status === 'approved-renewal', 'renewal is not approved')
  assert(
    JSON.stringify(manifest.approval) ===
      JSON.stringify({
        status: 'approved',
        evidenceHead: approvedEvidenceHead,
        record: renewalRecord,
        setRecords: Object.fromEntries(approvedRecords),
      }),
    'cross-evidence approval binding drift',
  )
  assert(manifest.targetSourceHead === 'c1824f22bf14dca6d38f7519fd99affd789a8130')
  assert(manifest.sets.length === 4, 'expected four evidence sets')
  const expectedCounts = new Map([
    ['city-ui-v2', 20],
    ['city-harbor-v2', 8],
    ['gameplay-chrome-v2', 3],
    ['world-map-terrain-v2', 6],
  ])
  const captureKeys = new Set()
  let total = 0
  for (const set of manifest.sets) {
    const renewal = set.renewal
    assert(expectedCounts.get(set.id) === set.count, `${set.id}: unexpected required count`)
    assert(set.captures.length === set.count, `${set.id}: capture inventory count drift`)
    assert(set.historicalBinding.reusable === false, `${set.id}: old approval became reusable`)
    assert(set.historicalBinding.approvalRecord, `${set.id}: missing historical approval record`)
    assert(renewal?.status === approvedRenewalStatus, `${set.id}: renewal is not approved`)
    assert(renewal.sourceHead === manifest.targetSourceHead, `${set.id}: renewal source head drift`)
    assert(renewal.promotionHead === promotionHead, `${set.id}: promotion head drift`)
    assert(/^\d{4}-\d{2}-\d{2}$/.test(renewal.capturedOn), `${set.id}: invalid capture date`)
    assert(/^[0-9a-f]{64}$/.test(renewal.bindingSha256), `${set.id}: invalid binding hash`)
    assert(renewal.historicalPixelsReused === false, `${set.id}: historical pixel reuse drift`)
    assert(
      renewal.visualSettleInspection === 'completed-by-integration-owner',
      `${set.id}: visual-settle inspection drift`,
    )
    assert(
      ['completed-by-integration-owner', 'completed-by-independent-verifier'].includes(
        renewal.nativeSizeInspection,
      ),
      `${set.id}: native-size inspection drift`,
    )
    assert(
      JSON.stringify(renewal.approval) ===
        JSON.stringify({
          status: 'approved',
          evidenceHead: approvedEvidenceHead,
          record: approvedRecords.get(set.id),
        }),
      `${set.id}: approval binding drift`,
    )
    assert(/^[0-9a-f]{40}$/.test(set.historicalBinding.recordHead), `${set.id}: record head drift`)
    if (renewal.evidenceBindingSha256) {
      assert(
        /^[0-9a-f]{64}$/.test(renewal.evidenceBindingSha256),
        `${set.id}: evidence binding drift`,
      )
    }
    if (renewal.evidenceProposal) {
      assert(
        /^[0-9a-f]{64}$/.test(renewal.evidenceProposal.sha256) &&
          /^[0-9a-f]{64}$/.test(renewal.evidenceProposal.candidateDigest) &&
          /^[0-9a-f]{64}$/.test(renewal.evidenceProposal.captureReadyBinding),
        `${set.id}: proposal provenance drift`,
      )
    }
    assert(set.recipe.length > 100, `${set.id}: capture recipe is incomplete`)
    for (const spec of set.captures) {
      assert(spec.length === 4, `${set.id}: malformed capture specification`)
      const key = `${set.id}/${spec[0]}`
      assert(!captureKeys.has(key), `${set.id}: duplicate capture ${spec[0]}`)
      captureKeys.add(key)
      total += 1
    }
  }
  assert(total === 37, `expected 37 captures, found ${total}`)
}

function validateTargetSource() {
  try {
    git(['cat-file', '-e', `${manifest.targetSourceHead}^{commit}`])
    git(['merge-base', '--is-ancestor', manifest.targetSourceHead, 'HEAD'])
  } catch {
    fail('current evidence commit must descend from the exact #613 repaired source head')
  }
  for (const record of manifest.sourceCensus) {
    const committed = git(['show', `${manifest.targetSourceHead}:${record.path}`], {
      encoding: 'buffer',
    })
    const worktree = readRegular(repoPath(record.path))
    for (const [label, bytes] of [
      ['target commit', committed],
      ['worktree', worktree],
    ]) {
      assert(bytes.length === record.bytes, `${record.path}: ${label} byte-count drift`)
      assert(sha256(bytes) === record.sha256, `${record.path}: ${label} SHA-256 drift`)
    }
  }
}

function recordedCaptureMap(set, binding) {
  const base = dirname(set.historicalBinding.path)
  return new Map(
    binding.captures.map((record) => {
      const repositoryPath = record.path.startsWith('docs/') ? record.path : join(base, record.path)
      return [repositoryPath, record]
    }),
  )
}

function validateHistoricalEvidence() {
  for (const set of manifest.sets) {
    const bindingBytes = readRegular(repoPath(set.historicalBinding.path))
    const binding = JSON.parse(bindingBytes)
    if (set.renewal) {
      const captured = set.renewal.status === capturedPendingStatus
      const expectedBindingSha256 = captured
        ? set.renewal.bindingSha256
        : set.renewal.supersededCapture.bindingSha256
      const expectedSourceHead = captured
        ? manifest.targetSourceHead
        : set.renewal.supersededCapture.sourceHead
      assert(sha256(bindingBytes) === expectedBindingSha256, `${set.id}: current binding drift`)
      assert(binding.sourceHead === expectedSourceHead, `${set.id}: source head drift`)
      assert(
        binding.captureStatus === 'captured-pending-direct-operator-approval',
        `${set.id}: capture status drift`,
      )
      assert(
        binding.approval?.status === 'pending-direct-operator-approval' &&
          binding.approval.record === null,
        `${set.id}: renewed binding approval must remain pending`,
      )
    } else {
      assert(
        sha256(bindingBytes) === set.historicalBinding.sha256,
        `${set.id}: historical binding changed during pending preparation`,
      )
    }
    const recorded = recordedCaptureMap(set, binding)
    const directoryNames = readdirSync(repoPath(set.captureRoot)).sort()
    const expectedNames = set.captures.map(([name]) => name).sort()
    assert(
      JSON.stringify(directoryNames) === JSON.stringify(expectedNames),
      `${set.id}: historical capture directory inventory drift`,
    )
    for (const spec of set.captures) {
      const repositoryPath = join(set.captureRoot, spec[0])
      const bytes = readRegular(repoPath(repositoryPath))
      const observed = set.renewal
        ? inspectCapture(bytes, spec, repositoryPath)
        : inspectHistoricalCapture(bytes, spec, repositoryPath)
      const record = recorded.get(repositoryPath)
      assert(record, `${set.id}: historical binding omitted ${repositoryPath}`)
      const recordedDimensions = record.dimensions ?? [record.width, record.height]
      assert(record.bytes === observed.bytes, `${repositoryPath}: historical byte record drift`)
      assert(record.sha256 === observed.sha256, `${repositoryPath}: historical hash record drift`)
      assert(
        JSON.stringify(recordedDimensions) === JSON.stringify(observed.dimensions),
        `${repositoryPath}: historical dimension record drift`,
      )
    }

    if (set.renewal) {
      const historicalBytes = git(
        ['show', `${set.historicalBinding.recordHead}:${set.historicalBinding.path}`],
        { encoding: 'buffer' },
      )
      assert(
        sha256(historicalBytes) === set.historicalBinding.sha256,
        `${set.id}: historical binding provenance drift`,
      )
      const historical = recordedCaptureMap(set, JSON.parse(historicalBytes))
      for (const spec of set.captures) {
        const repositoryPath = join(set.captureRoot, spec[0])
        assert(
          sha256(readRegular(repoPath(repositoryPath))) !== historical.get(repositoryPath).sha256,
          `${repositoryPath}: historical capture bytes were reused`,
        )
      }
      if (set.renewal.status === capturedPendingStatus) {
        const supersededBytes = git(
          ['show', `${set.renewal.supersededCapture.recordHead}:${set.historicalBinding.path}`],
          { encoding: 'buffer' },
        )
        assert(
          sha256(supersededBytes) === set.renewal.supersededCapture.bindingSha256,
          `${set.id}: superseded binding provenance drift`,
        )
        const superseded = recordedCaptureMap(set, JSON.parse(supersededBytes))
        for (const spec of set.captures) {
          const repositoryPath = join(set.captureRoot, spec[0])
          assert(
            sha256(readRegular(repoPath(repositoryPath))) !== superseded.get(repositoryPath).sha256,
            `${repositoryPath}: superseded current capture bytes were reused`,
          )
        }
      }
    }
  }

  const renewedCitySets = manifest.sets.filter(
    (set) =>
      ['city-ui-v2', 'city-harbor-v2'].includes(set.id) &&
      set.renewal?.status === capturedPendingStatus,
  )
  if (renewedCitySets.length === 2) {
    const fixtures = JSON.parse(
      readRegular(repoPath('docs/art/city-ui-v2/tools/runtime-harness/fixtures.json')),
    )
    const cityTargets = fixtures.captures.flatMap((capture) => capture.targets)
    assert(cityTargets.length === 28, 'renewed city target count drift')
    assert(
      new Set(cityTargets.map((path) => sha256(readRegular(repoPath(path))))).size === 22,
      'renewed city batch must contain exactly 22 unique browser frames',
    )
    const shared = fixtures.captures.filter((capture) => capture.targets.length === 2)
    assert(shared.length === 6, 'renewed city shared-copy count drift')
    for (const capture of shared) {
      const [left, right] = capture.targets.map((path) => readRegular(repoPath(path)))
      assert(left.equals(right), `${capture.id}: cross-set copies differ`)
    }
  }
}

function validateApprovedEvidence() {
  for (const set of manifest.sets) {
    const renewal = set.renewal
    const bindingBytes = readRegular(repoPath(set.historicalBinding.path))
    const binding = JSON.parse(bindingBytes)
    assert(sha256(bindingBytes) === renewal.bindingSha256, `${set.id}: current binding drift`)

    if (['city-ui-v2', 'city-harbor-v2'].includes(set.id)) {
      assert(binding.sourceHead === manifest.targetSourceHead, `${set.id}: source head drift`)
      assert(binding.captureStatus === 'approved', `${set.id}: capture status drift`)
      assert(
        JSON.stringify(binding.approval) === JSON.stringify(renewal.approval),
        `${set.id}: binding approval drift`,
      )
      const evidenceBinding = git(
        ['show', `${approvedEvidenceHead}:${set.historicalBinding.path}`],
        { encoding: 'buffer' },
      )
      assert(
        sha256(evidenceBinding) === renewal.evidenceBindingSha256,
        `${set.id}: approved evidence binding drift`,
      )
    } else if (set.id === 'gameplay-chrome-v2') {
      const baseline = JSON.parse(readRegular(repoPath(renewal.materialBaseline.path)))
      const counts = baseline.material.counts
      assert(binding.capture_baseline.source_head === promotionHead, 'chrome promotion head drift')
      assert(
        binding.material_baseline.sha256 === renewal.materialBaseline.sha256 &&
          binding.material_baseline.material_sha256 === renewal.materialBaseline.materialSha256 &&
          binding.material_baseline.capture_record_sha256 === sha256(renewal.approval.record),
        'chrome binding material baseline drift',
      )
      assert(
        sha256(readRegular(repoPath(renewal.materialBaseline.path))) ===
          renewal.materialBaseline.sha256 &&
          baseline.capture_head === promotionHead &&
          baseline.capture_record_sha256 === sha256(renewal.approval.record) &&
          baseline.material.sha256 === renewal.materialBaseline.materialSha256 &&
          baseline.material.bytes === renewal.materialBaseline.bytes &&
          counts.shipping_sources === renewal.materialBaseline.counts.shippingSources &&
          counts.build_inputs === renewal.materialBaseline.counts.buildInputs &&
          counts.runtime_assets === renewal.materialBaseline.counts.runtimeAssets &&
          counts.captures === renewal.materialBaseline.counts.captures &&
          counts.canvas_tokens === renewal.materialBaseline.counts.canvasTokens,
        'chrome material baseline drift',
      )
    } else if (set.id === 'world-map-terrain-v2') {
      assert(
        binding.runtime_binding.immutable_starting_head === promotionHead &&
          binding.runtime_binding.application_source_head === manifest.targetSourceHead &&
          binding.runtime_binding.renderer_and_runtime_asset_digest ===
            renewal.rendererAndRuntimeAssetDigest,
        'terrain runtime binding drift',
      )
      assert(
        binding.operator_approval.status === 'approved' &&
          binding.operator_approval.source_head === promotionHead &&
          binding.operator_approval.application_source_head === manifest.targetSourceHead &&
          binding.operator_approval.issue_comment === renewal.approval.record,
        'terrain approval binding drift',
      )
      assert(
        terrainRendererDigest() === renewal.rendererAndRuntimeAssetDigest,
        'terrain renderer digest drift',
      )
    }

    const recorded = recordedCaptureMap(set, binding)
    const directoryNames = readdirSync(repoPath(set.captureRoot)).sort()
    const expectedNames = set.captures.map(([name]) => name).sort()
    assert(
      JSON.stringify(directoryNames) === JSON.stringify(expectedNames),
      `${set.id}: capture directory inventory drift`,
    )
    const evidenceRoot = renewal.evidenceProposal?.captureRoot ?? set.captureRoot
    for (const spec of set.captures) {
      const repositoryPath = join(set.captureRoot, spec[0])
      const bytes = readRegular(repoPath(repositoryPath))
      const observed = inspectCapture(bytes, spec, repositoryPath)
      const record = recorded.get(repositoryPath)
      assert(record, `${set.id}: binding omitted ${repositoryPath}`)
      const recordedDimensions = record.dimensions ?? [record.width, record.height]
      assert(record.bytes === observed.bytes, `${repositoryPath}: byte record drift`)
      assert(record.sha256 === observed.sha256, `${repositoryPath}: hash record drift`)
      assert(
        JSON.stringify(recordedDimensions) === JSON.stringify(observed.dimensions),
        `${repositoryPath}: dimension record drift`,
      )
      const approvedBytes = git(
        ['show', `${approvedEvidenceHead}:${join(evidenceRoot, spec[0])}`],
        { encoding: 'buffer' },
      )
      assert(bytes.equals(approvedBytes), `${repositoryPath}: differs from approved evidence`)
    }

    const historicalBytes = git(
      ['show', `${set.historicalBinding.recordHead}:${set.historicalBinding.path}`],
      { encoding: 'buffer' },
    )
    assert(
      sha256(historicalBytes) === set.historicalBinding.sha256,
      `${set.id}: historical binding provenance drift`,
    )
    const historical = recordedCaptureMap(set, JSON.parse(historicalBytes))
    for (const spec of set.captures) {
      const repositoryPath = join(set.captureRoot, spec[0])
      assert(
        sha256(readRegular(repoPath(repositoryPath))) !== historical.get(repositoryPath).sha256,
        `${repositoryPath}: historical capture bytes were reused`,
      )
    }

    if (renewal.evidenceProposal) {
      const proposalBytes = git(
        ['show', `${approvedEvidenceHead}:${renewal.evidenceProposal.path}`],
        { encoding: 'buffer' },
      )
      assert(
        sha256(proposalBytes) === renewal.evidenceProposal.sha256,
        `${set.id}: approved proposal provenance drift`,
      )
    }
    if (renewal.supersededCapture) {
      const supersededBytes = git(
        ['show', `${renewal.supersededCapture.recordHead}:${set.historicalBinding.path}`],
        { encoding: 'buffer' },
      )
      assert(
        sha256(supersededBytes) === renewal.supersededCapture.bindingSha256,
        `${set.id}: superseded binding provenance drift`,
      )
      const superseded = recordedCaptureMap(set, JSON.parse(supersededBytes))
      for (const spec of set.captures) {
        const repositoryPath = join(set.captureRoot, spec[0])
        assert(
          sha256(readRegular(repoPath(repositoryPath))) !== superseded.get(repositoryPath).sha256,
          `${repositoryPath}: superseded capture bytes were reused`,
        )
      }
    }
  }

  const fixtures = JSON.parse(
    readRegular(repoPath('docs/art/city-ui-v2/tools/runtime-harness/fixtures.json')),
  )
  const cityTargets = fixtures.captures.flatMap((capture) => capture.targets)
  assert(cityTargets.length === 28, 'renewed city target count drift')
  assert(
    new Set(cityTargets.map((path) => sha256(readRegular(repoPath(path))))).size === 22,
    'renewed city batch must contain exactly 22 unique browser frames',
  )
  const shared = fixtures.captures.filter((capture) => capture.targets.length === 2)
  assert(shared.length === 6, 'renewed city shared-copy count drift')
  for (const capture of shared) {
    const [left, right] = capture.targets.map((path) => readRegular(repoPath(path)))
    assert(left.equals(right), `${capture.id}: cross-set copies differ`)
  }
}

function terrainRendererDigest() {
  const paths = [
    'apps/web/src/MapCanvas.tsx',
    'apps/web/src/mapPresentation.ts',
    ...readdirSync(repoPath('apps/web/public/art/world-map-v2/terrain'))
      .filter((name) => name.endsWith('.webp'))
      .sort()
      .map((name) => `apps/web/public/art/world-map-v2/terrain/${name}`),
  ]
  return sha256(paths.map((path) => `${sha256(readRegular(repoPath(path)))}  ${path}\n`).join(''))
}

function staleState() {
  const citySet = manifest.sets.find((set) => set.id === 'city-ui-v2')
  const cityBinding = JSON.parse(
    readRegular(repoPath('docs/art/city-ui-v2/RUNTIME-CAPTURE-BINDINGS.json')),
  )
  let cityState
  if (citySet.renewal?.status === capturedPendingStatus) {
    assert(cityBinding.sourceHead === manifest.targetSourceHead, 'city UI renewal source drift')
    assert(
      cityBinding.captureStatus === 'captured-pending-direct-operator-approval',
      'city UI renewal status drift',
    )
    cityState = {
      status: citySet.renewal.status,
      captureCount: citySet.count,
      directOperatorApproval: citySet.renewal.approval,
    }
  } else if (citySet.renewal?.status === recaptureRequiredStatus) {
    assert(
      cityBinding.sourceHead === citySet.renewal.supersededCapture.sourceHead,
      'city UI superseded source drift',
    )
    const citySourceRecords = new Map(
      cityBinding.sourceFiles.map((record) => [record.path, record]),
    )
    const changedBoundSources = manifest.sourceCensus
      .filter((record) => citySourceRecords.has(record.path))
      .filter((record) => citySourceRecords.get(record.path).sha256 !== record.sha256)
      .map((record) => record.path)
    assert(changedBoundSources.length > 0, 'city UI recapture has no changed bound source')
    cityState = {
      status: citySet.renewal.status,
      supersededSourceHead: cityBinding.sourceHead,
      targetSourceHead: manifest.targetSourceHead,
      changedBoundSources,
      directOperatorApproval: citySet.renewal.approval,
    }
  } else {
    const citySourceRecords = new Map(
      cityBinding.sourceFiles.map((record) => [record.path, record]),
    )
    const cityChanged = manifest.sourceCensus
      .filter((record) => citySourceRecords.has(record.path))
      .filter((record) => citySourceRecords.get(record.path).sha256 !== record.sha256)
      .map((record) => record.path)
    assert(cityChanged.length > 0, 'city UI historical binding unexpectedly matches #613 source')
    cityState = {
      status: 'stale-recapture-required',
      changedBoundSources: cityChanged,
    }
  }

  const harborSet = manifest.sets.find((set) => set.id === 'city-harbor-v2')
  const harborBinding = JSON.parse(
    readRegular(repoPath('docs/art/city-harbor-v2/RUNTIME-CAPTURE-BINDINGS.json')),
  )
  const currentStylesheetHash = sha256(readRegular(repoPath('apps/web/src/styles.css')))
  let harborState
  if (harborSet.renewal?.status === capturedPendingStatus) {
    assert(
      harborBinding.sourceHead === manifest.targetSourceHead &&
        harborBinding.stylesheet_source.diagnostic_full_sha256 === currentStylesheetHash,
      'city harbor renewal source drift',
    )
    assert(
      harborBinding.captureStatus === 'captured-pending-direct-operator-approval',
      'city harbor renewal status drift',
    )
    harborState = {
      status: harborSet.renewal.status,
      captureCount: harborSet.count,
      directOperatorApproval: harborSet.renewal.approval,
      note: 'The narrower city-scene CSS projection remained stable, while fresh pixels intentionally bind this set to the complete #613 target stylesheet.',
    }
  } else if (harborSet.renewal?.status === recaptureRequiredStatus) {
    assert(
      harborBinding.sourceHead === harborSet.renewal.supersededCapture.sourceHead &&
        harborBinding.stylesheet_source.diagnostic_full_sha256 !== currentStylesheetHash,
      'city harbor superseded source drift',
    )
    harborState = {
      status: harborSet.renewal.status,
      supersededSourceHead: harborBinding.sourceHead,
      targetSourceHead: manifest.targetSourceHead,
      historicalFullStylesheetSha256: harborBinding.stylesheet_source.diagnostic_full_sha256,
      targetFullStylesheetSha256: currentStylesheetHash,
      directOperatorApproval: harborSet.renewal.approval,
    }
  } else {
    assert(
      harborBinding.stylesheet_source.diagnostic_full_sha256 !== currentStylesheetHash,
      'city harbor historical full stylesheet unexpectedly matches #613 source',
    )
    harborState = {
      status: 'stale-recapture-required',
      historicalFullStylesheetSha256: harborBinding.stylesheet_source.diagnostic_full_sha256,
      targetFullStylesheetSha256: currentStylesheetHash,
      note: 'The narrower city-scene CSS projection is unchanged, but this cross-evidence renewal intentionally binds all 37 frames to one final source.',
    }
  }

  const chromeAnchor = manifest.sets.find(
    (set) => set.id === 'gameplay-chrome-v2',
  ).immutableMaterialAnchor
  assert(
    sha256(readRegular(repoPath(chromeAnchor.path))) === chromeAnchor.sha256,
    '#610 immutable material anchor changed during pending renewal preparation',
  )

  const terrainReceipt = JSON.parse(
    readRegular(repoPath('docs/art/world-map-v2/terrain/runtime-capture-receipt.json')),
  )
  const currentTerrainDigest = terrainRendererDigest()
  assert(
    terrainReceipt.runtime_binding.renderer_and_runtime_asset_digest !== currentTerrainDigest,
    'terrain historical renderer digest unexpectedly matches #613 source',
  )

  return {
    'city-ui-v2': cityState,
    'city-harbor-v2': harborState,
    'gameplay-chrome-v2': {
      status: 'stale-material-baseline-requires-new-pixels-and-approval',
      immutableAnchorSha256: chromeAnchor.sha256,
    },
    'world-map-terrain-v2': {
      status: 'stale-recapture-required',
      historicalRendererDigest: terrainReceipt.runtime_binding.renderer_and_runtime_asset_digest,
      targetRendererDigest: currentTerrainDigest,
    },
  }
}

function checkPending() {
  validateManifest()
  validateTargetSource()
  validateHistoricalEvidence()
  const stale = staleState()
  const capturedCount = manifest.sets
    .filter((set) => set.renewal?.status === capturedPendingStatus)
    .reduce((total, set) => total + set.count, 0)
  console.log(
    JSON.stringify(
      {
        status: manifest.status,
        targetSourceHead: manifest.targetSourceHead,
        requiredCaptureCount: 37,
        capturedPendingApprovalCount: capturedCount,
        remainingCaptureCount: 37 - capturedCount,
        sourceCensusCount: manifest.sourceCensus.length,
        stale,
        approval: manifest.approval,
      },
      null,
      2,
    ),
  )
  return stale
}

function validateApproved() {
  validateApprovedManifest()
  validateTargetSource()
  validateApprovedEvidence()
  console.log(
    JSON.stringify(
      {
        status: manifest.status,
        targetSourceHead: manifest.targetSourceHead,
        promotionHead,
        approvedEvidenceHead,
        captureCount: manifest.sets.reduce((total, set) => total + set.count, 0),
        setCount: manifest.sets.length,
        approval: manifest.approval,
      },
      null,
      2,
    ),
  )
}

function parseArgs(args) {
  const command = args[0]
  if (
    command === '--check-pending' ||
    command === '--validate-approved' ||
    command === '--self-test'
  ) {
    assert(args.length === 1, `${command} takes no additional arguments`)
    return { command }
  }
  if (command !== '--proposal')
    fail('usage: --check-pending | --validate-approved | --self-test | --proposal ...')
  const values = new Map()
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    assert(flag?.startsWith('--') && value !== undefined, `invalid proposal argument: ${flag}`)
    assert(!values.has(flag), `duplicate proposal argument: ${flag}`)
    values.set(flag, value)
  }
  const expected = ['--stage-root', '--output', '--source-head', '--captured-on', '--confirmation']
  assert(
    values.size === expected.length && expected.every((flag) => values.has(flag)),
    `proposal requires ${expected.join(', ')}`,
  )
  assert(
    values.get('--confirmation') === 'PREPARE_UNAPPROVED_CAPTURE_PROPOSAL',
    'proposal confirmation mismatch',
  )
  assert(values.get('--source-head') === manifest.targetSourceHead, 'proposal source head mismatch')
  assert(/^\d{4}-\d{2}-\d{2}$/.test(values.get('--captured-on')), 'invalid capture date')
  return { command, values }
}

function assertOutsideRepository(path, label) {
  assert(isAbsolute(path), `${label} must be an absolute path`)
  const resolved = resolve(path)
  assert(
    resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${sep}`),
    `${label} must remain outside the repository`,
  )
  return resolved
}

function buildProposal(values) {
  checkPending()
  const stageRoot = assertOutsideRepository(values.get('--stage-root'), 'stage root')
  const output = assertOutsideRepository(values.get('--output'), 'proposal output')
  assert(realpathSync(stageRoot) === stageRoot, 'stage root must be canonical')
  const anchor = manifest.sets.find(
    (set) => set.id === 'gameplay-chrome-v2',
  ).immutableMaterialAnchor
  const anchorBefore = sha256(readRegular(repoPath(anchor.path)))
  const sets = manifest.sets.map((set) => ({
    id: set.id,
    issue: set.issue,
    captureRoot: set.captureRoot,
    captures: set.captures.map((spec) => {
      const stagedPath = join(stageRoot, set.id, spec[0])
      const observed = inspectCapture(readRegular(stagedPath), spec, stagedPath)
      return {
        path: join(set.captureRoot, spec[0]),
        ...observed,
        encoding: spec[3],
      }
    }),
  }))
  const proposal = {
    schema: 1,
    kind: 'unapproved-runtime-evidence-renewal-proposal',
    issue: 613,
    sourceHead: manifest.targetSourceHead,
    capturedOn: values.get('--captured-on'),
    captureCount: sets.reduce((total, set) => total + set.captures.length, 0),
    sourceCensus: manifest.sourceCensus,
    sets,
    approval: { status: 'pending-direct-operator-approval', record: null },
    materialAnchorGuard: {
      path: anchor.path,
      sha256: anchor.sha256,
      changed: false,
    },
    nextStep:
      'Replace retained capture bytes and update each native receipt/binding mechanically from this proposal; run every native validator; obtain direct operator approval for the exact new pixels; only then may a separately reviewed apply_patch renew #610 material and approval anchors.',
  }
  assert(proposal.captureCount === 37, 'proposal capture count drift')
  assert(sha256(readRegular(repoPath(anchor.path))) === anchorBefore, '#610 anchor changed')
  writeFileSync(output, `${JSON.stringify(proposal, null, 2)}\n`, { flag: 'wx' })
  assert(sha256(readRegular(repoPath(anchor.path))) === anchorBefore, '#610 anchor changed')
  console.log(`wrote unapproved 37-capture proposal to ${output}`)
}

function selfTest() {
  validateApprovedManifest()
  const jpegSet = manifest.sets.find((set) => set.id === 'city-ui-v2')
  const jpegSpec = jpegSet.captures[0]
  const jpeg = readRegular(repoPath(join(jpegSet.captureRoot, jpegSpec[0])))
  inspectCapture(jpeg, jpegSpec, 'JPEG positive control')
  const badJpeg = Buffer.from(jpeg)
  badJpeg[0] = 0
  try {
    inspectCapture(badJpeg, jpegSpec, 'JPEG negative control')
    fail('JPEG negative control escaped')
  } catch (error) {
    assert(String(error).includes('missing JPEG SOI'), `unexpected JPEG negative result: ${error}`)
  }

  const pngSet = manifest.sets.find((set) => set.id === 'gameplay-chrome-v2')
  const pngSpec = pngSet.captures[0]
  const png = readRegular(repoPath(join(pngSet.captureRoot, pngSpec[0])))
  inspectCapture(png, pngSpec, 'PNG positive control')
  const badPng = Buffer.from(png)
  badPng[25] = 3
  try {
    inspectCapture(badPng, pngSpec, 'PNG negative control')
    fail('PNG color-type negative control escaped')
  } catch (error) {
    assert(
      String(error).includes('expected PNG color type 2'),
      `unexpected PNG negative result: ${error}`,
    )
  }
  console.log('PASS renewal negative controls: malformed JPEG and wrong PNG color type rejected')
}

const { command, values } = parseArgs(process.argv.slice(2))
if (command === '--check-pending') checkPending()
if (command === '--self-test') selfTest()
if (command === '--proposal') buildProposal(values)
if (command === '--validate-approved') validateApproved()
