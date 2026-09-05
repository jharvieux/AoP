import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtureRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(fixtureRoot, '../../../..')
const outputPath = join(fixtureRoot, 'CAPTURE-READY.json')

export const sourceHead = 'c1824f22bf14dca6d38f7519fd99affd789a8130'
export const sourceTree = '68b5529d91f15cdbfeeb0f612da5ee0c7ebd547d'
export const origin = 'http://127.0.0.1:4627'

const historical = {
  chrome_material_anchor: {
    path: 'docs/art/gameplay-chrome-v2/RUNTIME-MATERIAL-BASELINE.json',
    sha256: '49a94705bd486738002c2f90e1ef58a64e68cad12072470e0972e1d899258bde',
    reusable: false,
    may_change_before_direct_operator_approval: false,
  },
  chrome_binding: {
    path: 'docs/art/gameplay-chrome-v2/RUNTIME-CAPTURE-BINDINGS.json',
    sha256: '60b09cb87a52321c578ca818752178837b1d5c809e621df3f20e05c4442b015c',
    reusable: false,
  },
  terrain_receipt: {
    path: 'docs/art/world-map-v2/terrain/runtime-capture-receipt.json',
    sha256: '24081cd29ef5ee5bba0f2633487dd7bc0c7ecaca4445cd1ea25883a469a38293',
    reusable: false,
  },
}

const buildInputPaths = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'apps/web/asset-size-allowlist.json',
  'apps/web/capacitor.config.ts',
  'apps/web/index.html',
  'apps/web/package.json',
  'apps/web/public/icons/icon-maskable.svg',
  'apps/web/public/icons/icon.svg',
  'apps/web/public/manifest.webmanifest',
  'apps/web/public/sw.js',
  'apps/web/tsconfig.json',
  'apps/web/vite-plugins/assetBudget.ts',
  'apps/web/vite-plugins/swVersion.ts',
  'apps/web/vite.config.ts',
  'packages/content/package.json',
  'packages/content/tsconfig.json',
  'packages/engine/package.json',
  'packages/engine/tsconfig.json',
  'packages/shared/package.json',
  'packages/shared/tsconfig.json',
]

export const rendererSourcePaths = [
  'apps/web/src/CityScene.tsx',
  'apps/web/src/CityScreen.tsx',
  'apps/web/src/MapCanvas.tsx',
  'apps/web/src/Minimap.tsx',
  'apps/web/src/ResourceHud.tsx',
  'apps/web/src/cityModals.tsx',
  'apps/web/src/colorTokens.ts',
  'apps/web/src/mapArtRegistry.ts',
  'apps/web/src/mapCamera.ts',
  'apps/web/src/mapLayout.ts',
  'apps/web/src/mapPresentation.ts',
  'apps/web/src/mapSprites.ts',
  'apps/web/src/paintedWorld.ts',
  'apps/web/src/screens/GameScreen.tsx',
  'apps/web/src/styles.css',
  'apps/web/src/textureLoader.ts',
  'apps/web/src/theme/ThemeContext.tsx',
  'apps/web/src/uiIcons.ts',
  'apps/web/src/usePixiApp.ts',
]

export const fixturePaths = [
  'docs/art/gameplay-chrome-v2/renewal-fixture/fixtureData.ts',
  'docs/art/gameplay-chrome-v2/renewal-fixture/index.html',
  'docs/art/gameplay-chrome-v2/renewal-fixture/runtime.tsx',
  'docs/art/gameplay-chrome-v2/renewal-fixture/stubs/audioFeedback.ts',
  'docs/art/gameplay-chrome-v2/renewal-fixture/vite.config.ts',
]

const moreCommandRepairPaths = [
  'apps/web/src/screens/GameScreen.tsx',
  'apps/web/src/styles.css',
  'apps/web/src/mapCommandLayout.test.ts',
]

const moreCommandRequiredStyles = [
  '.map-command-layout {',
  'align-items: end;',
  '.map-command-more[open] {',
  'min-height: 88px;',
  '.map-command-more__menu {',
  'position: absolute;',
  'top: 0;',
  'right: 0;',
  'grid-auto-flow: column;',
  'overflow-x: auto;',
]

const commonAssetPaths = [
  'apps/web/public/art/resources/gold.png',
  'apps/web/public/art/resources/iron.png',
  'apps/web/public/art/resources/rum.png',
  'apps/web/public/art/resources/timber.png',
  'apps/web/public/fonts/cabin-latin.woff2',
  'apps/web/public/fonts/pirata-one-latin.woff2',
  'apps/web/public/art/tiles/land.png',
  'apps/web/public/art/tiles/port.png',
  'apps/web/public/art/ui/build.png',
  'apps/web/public/art/ui/upgrade.png',
  ...['british', 'dutch', 'french', 'pirates', 'spanish'].map(
    (faction) => `apps/web/public/art/factions/${faction}/flag.png`,
  ),
]

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function git(args, encoding = null) {
  return execFileSync('git', args, { cwd: repoRoot, encoding, maxBuffer: 64 * 1024 * 1024 })
}

function regularFile(path) {
  const absolute = join(repoRoot, path)
  const details = lstatSync(absolute)
  if (!details.isFile() || details.isSymbolicLink()) throw new Error(`not a regular file: ${path}`)
  return readFileSync(absolute)
}

function record(path, bytes = regularFile(path)) {
  return { path, bytes: bytes.length, sha256: sha256(bytes) }
}

function targetRecord(path) {
  const committed = git(['show', `${sourceHead}:${path}`])
  const current = regularFile(path)
  if (!committed.equals(current))
    throw new Error(`${path}: working bytes differ from target source`)
  return record(path, committed)
}

function listTarget(root) {
  const output = git(['ls-tree', '-r', '--name-only', sourceHead, '--', root], 'utf8').trim()
  return output ? output.split('\n').sort() : []
}

function isWebTest(path) {
  return /(?:^|\/)__tests__(?:\/|$)/.test(path) || /\.(?:test|spec)\.[^/]+$/.test(path)
}

function descriptor(files) {
  const serialised = JSON.stringify(files)
  return { algorithm: 'sha256', sha256: sha256(serialised), bytes: Buffer.byteLength(serialised) }
}

function receiptAssets() {
  const world = JSON.parse(regularFile('docs/art/world-map-v2/runtime-public-receipt.json'))
  const city = JSON.parse(regularFile('docs/art/city-harbor-v2/PRODUCTION-OUTPUT-HASHES.json'))
  const terrain = JSON.parse(regularFile('docs/art/world-map-v2/terrain/terrain-receipt.json'))
  const paths = [
    ...commonAssetPaths,
    ...world.assets.map((item) => item.public_path),
    ...city.files
      .filter((item) => item.path.startsWith('apps/web/public/art/city/'))
      .map((item) => item.path),
    ...terrain.runtime.map((item) => item.path),
  ]
  return [...new Set(paths)].sort()
}

function assertScope() {
  const allowed = ['docs/art/gameplay-chrome-v2/', 'docs/art/world-map-v2/terrain/']
  const status = git(['status', '--porcelain=v1', '--untracked-files=all'], 'utf8')
  for (const line of status.split('\n').filter(Boolean)) {
    const path = line.slice(3).replace(/^"|"$/g, '')
    if (!allowed.some((prefix) => path.startsWith(prefix))) {
      throw new Error(`worktree write escaped evidence scope: ${path}`)
    }
  }
}

export function buildCaptureReady() {
  assertScope()
  if (git(['rev-parse', `${sourceHead}^{commit}`], 'utf8').trim() !== sourceHead) {
    throw new Error('target source commit does not resolve exactly')
  }
  if (git(['rev-parse', `${sourceHead}^{tree}`], 'utf8').trim() !== sourceTree) {
    throw new Error('target source tree drift')
  }

  const shippingPaths = [
    ...listTarget('apps/web/src').filter((path) => !isWebTest(path)),
    ...listTarget('packages/engine/src'),
    ...listTarget('packages/shared/src'),
    ...listTarget('packages/content/src'),
  ]
  const shippingFiles = [...new Set(shippingPaths)].sort().map(targetRecord)
  const buildInputs = buildInputPaths.map(targetRecord)
  const receipts = [
    'docs/art/city-harbor-v2/PRODUCTION-OUTPUT-HASHES.json',
    'docs/art/world-map-v2/runtime-public-receipt.json',
    'docs/art/world-map-v2/terrain/terrain-receipt.json',
  ].map(targetRecord)
  const runtimeAssets = receiptAssets().map(targetRecord)
  const rendererFiles = rendererSourcePaths.map(targetRecord)
  const fixtures = fixturePaths.map((path) => record(path))
  const moreCommandRepairFiles = moreCommandRepairPaths.map(targetRecord)
  const styles = regularFile('apps/web/src/styles.css').toString('utf8')
  for (const declaration of moreCommandRequiredStyles) {
    if (!styles.includes(declaration)) {
      throw new Error(`More command repair declaration missing: ${declaration}`)
    }
  }
  const history = Object.values(historical).map((item) => ({
    ...item,
    observed_sha256: sha256(regularFile(item.path)),
  }))
  for (const item of history) {
    if (item.observed_sha256 !== item.sha256)
      throw new Error(`${item.path}: historical anchor drift`)
    if (item.reusable !== false)
      throw new Error(`${item.path}: historical approval became reusable`)
  }

  const materialFiles = [...shippingFiles, ...buildInputs, ...receipts, ...runtimeAssets]
  const rendererMaterial = [...rendererFiles, ...receipts, ...runtimeAssets]
  const result = {
    schema: 'aop-cross-evidence-capture-ready-v1',
    issue: 613,
    status: 'capture-ready-unapproved',
    approval: { status: 'pending-direct-operator-approval', record: null },
    source: {
      head: sourceHead,
      tree: sourceTree,
      policy:
        'All non-test web runtime files, all engine/shared/content source files, build inputs, renderer receipts, and runtime assets must equal target-source bytes.',
      shipping_file_count: shippingFiles.length,
      build_input_count: buildInputs.length,
      runtime_asset_count: runtimeAssets.length,
      material: descriptor(materialFiles),
      files: materialFiles,
    },
    renderer: {
      policy:
        'Exact shipping renderers plus the complete world, terrain, city, flag, font, resource, and inspector-art dependency set.',
      source_file_count: rendererFiles.length,
      runtime_asset_count: runtimeAssets.length,
      material: descriptor(rendererMaterial),
      files: rendererMaterial,
    },
    fixture: {
      policy:
        'Real shipping GameScreen, MapCanvas, CityScreen, and CityScene; only audio feedback is inert.',
      files: fixtures,
      material: descriptor(fixtures),
    },
    more_command_repair: {
      policy:
        'Exact repaired shipping command component/style bytes and their zero-intersection regression test; live open/confirm geometry is bound by the proposal observations.',
      required_styles: moreCommandRequiredStyles,
      files: moreCommandRepairFiles,
      material: descriptor(moreCommandRepairFiles),
    },
    historical_approvals: history,
    server: {
      origin,
      fresh_origin_required: true,
      chrome_world: `${origin}/index.html?scene=chrome-world`,
      chrome_city: `${origin}/index.html?scene=chrome-city`,
      terrain: `${origin}/index.html?scene=terrain`,
    },
    expected_captures: {
      chrome: [
        ['runtime-phone-world-375x812.png', 375, 812, 2],
        ['runtime-city-inspector-1440x900.png', 1440, 900, 3],
        ['runtime-interaction-states-1440x960.png', 1440, 960, 3],
      ],
      terrain: [
        ['desktop-overview.png', 1440, 900],
        ['desktop-tactical.png', 1440, 900],
        ['desktop-detail.png', 1440, 900],
        ['phone-overview.png', 390, 844],
        ['phone-tactical.png', 390, 844],
        ['phone-detail.png', 390, 844],
      ],
    },
  }
  result.binding_sha256 = sha256(JSON.stringify(result))
  return result
}

export function validateCaptureReady(candidate, expected = buildCaptureReady()) {
  if (JSON.stringify(candidate) !== JSON.stringify(expected))
    throw new Error('capture-ready binding drift')
  if (candidate.approval.status !== 'pending-direct-operator-approval') {
    throw new Error('capture-ready record may not claim approval')
  }
  if (candidate.historical_approvals.some((item) => item.reusable !== false)) {
    throw new Error('historical approval reuse is forbidden')
  }
  return expected
}

function expectRejected(label, expected, mutate) {
  const candidate = structuredClone(expected)
  mutate(candidate)
  try {
    validateCaptureReady(candidate, expected)
  } catch {
    return
  }
  throw new Error(`negative control accepted ${label}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const first = buildCaptureReady()
  const second = buildCaptureReady()
  if (JSON.stringify(first) !== JSON.stringify(second))
    throw new Error('capture-ready build is not deterministic')
  if (process.argv.includes('--write')) {
    writeFileSync(outputPath, `${JSON.stringify(first, null, 2)}\n`)
  } else {
    validateCaptureReady(JSON.parse(readFileSync(outputPath, 'utf8')), first)
  }
  expectRejected('premature approval', first, (record) => {
    record.approval.status = 'approved'
  })
  expectRejected('source material drift', first, (record) => {
    record.source.files[0].sha256 = '0'.repeat(64)
  })
  expectRejected('renderer omission', first, (record) => {
    record.renderer.files.pop()
  })
  expectRejected('fixture drift', first, (record) => {
    record.fixture.files[0].bytes += 1
  })
  expectRejected('More repair omission', first, (record) => {
    record.more_command_repair.files.pop()
  })
  expectRejected('historical approval reuse', first, (record) => {
    record.historical_approvals[0].reusable = true
  })
  console.log(
    `capture-ready PASS: ${first.source.shipping_file_count} shipping files, ${first.source.runtime_asset_count} assets, binding ${first.binding_sha256}; deterministic/negative controls PASS`,
  )
}
