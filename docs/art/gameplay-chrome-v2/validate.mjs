/** Fail-loud validation for the #610 review package. Usage: node validate.mjs */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  acceptanceProjection,
  bindingPath,
  buildRuntimeCaptureBindings,
  captureSpecs,
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
const expectedCaptureIds = captureSpecs.map((capture) => capture.id)
const retainedCaptureIds = retainedBinding.captures.map((capture) => capture.id)
const retainedSourceSetIds = Object.keys(retainedBinding.source_sets)
const retainedScopeIds = retainedBinding.stylesheet_source.scopes.map((scope) => scope.id)
const exactInventory =
  JSON.stringify(Object.keys(retainedBinding).sort()) ===
    JSON.stringify([
      'capture_baseline',
      'captures',
      'schema',
      'source_sets',
      'stylesheet_source',
    ]) &&
  JSON.stringify(retainedCaptureIds) === JSON.stringify(expectedCaptureIds) &&
  JSON.stringify(retainedSourceSetIds) === JSON.stringify(expectedCaptureIds) &&
  JSON.stringify(retainedScopeIds) === JSON.stringify(expectedCaptureIds)
if (!exactInventory) {
  console.error('FAIL runtime source binding inventory equality')
  failures++
}
if (!bindingMatches(retainedBinding)) {
  console.error('FAIL runtime captures are stale for their bound source/CSS/asset bytes')
  failures++
}
const diagnosticHash = retainedBinding.stylesheet_source.diagnostic_full_sha256
if (!/^[0-9a-f]{64}$/.test(diagnosticHash)) {
  console.error('FAIL runtime source binding stylesheet diagnostic hash')
  failures++
}
console.log(
  `PASS runtime source bindings: ${retainedCaptureIds.length} captures / ${retainedSourceSetIds.length} exact source sets`,
)

function driftedBuffer(path, suffix = '\nsource-drift') {
  return Buffer.concat([readFileSync(join(repoRoot, path)), Buffer.from(suffix)])
}

function expectBindingDrift(label, overrides) {
  let drifted
  try {
    drifted = buildRuntimeCaptureBindings({ overrides })
  } catch {
    console.log(`PASS runtime source binding negative control: ${label} rejected`)
    return
  }
  if (projectBinding(drifted) === projectBinding(retainedBinding)) {
    console.error(`FAIL runtime source binding negative control: ${label} escaped`)
    failures++
  } else {
    console.log(`PASS runtime source binding negative control: ${label} rejected`)
  }
}

const staleBinding = structuredClone(retainedBinding)
staleBinding.captures[0].sha256 = '0'.repeat(64)
if (bindingMatches(staleBinding)) {
  console.error('FAIL runtime source binding negative control: stale manifest escaped')
  failures++
} else {
  console.log('PASS runtime source binding negative control: stale manifest rejected')
}

const sourceDriftPath = captureSpecs[0].runtimeSources[0]
expectBindingDrift(
  'runtime source drift',
  new Map([[sourceDriftPath, driftedBuffer(sourceDriftPath)]]),
)
const assetDriftPath = 'apps/web/public/art/resources/gold.png'
expectBindingDrift(
  'runtime asset drift',
  new Map([[assetDriftPath, driftedBuffer(assetDriftPath)]]),
)
const captureDriftPath = captureSpecs[0].path
const captureDrift = Buffer.from(readFileSync(join(repoRoot, captureDriftPath)))
captureDrift[captureDrift.length - 1] ^= 1
expectBindingDrift('capture drift', new Map([[captureDriftPath, captureDrift]]))

const stylesheet = readFileSync(join(repoRoot, stylesheetPath), 'utf8')
const selectedCssMarker = '.resource-hud {'
if (!stylesheet.includes(selectedCssMarker)) {
  console.error('FAIL runtime source binding CSS negative-control marker missing')
  failures++
} else {
  expectBindingDrift(
    'selected CSS drift',
    new Map([
      [
        stylesheetPath,
        stylesheet.replace(selectedCssMarker, `${selectedCssMarker}\n  opacity: 0.999;`),
      ],
    ]),
  )
}
const tokenMarker = '  --surface-panel: #2d1b10;'
if (!stylesheet.includes(tokenMarker)) {
  console.error('FAIL runtime source binding token negative-control marker missing')
  failures++
} else {
  expectBindingDrift(
    'resolved token drift',
    new Map([[stylesheetPath, stylesheet.replace(tokenMarker, '  --surface-panel: #2d1b11;')]]),
  )
}
const unrelatedCss = `${stylesheet}\n.capture-binding-unrelated { color: #fff; }\n`
const unrelatedBinding = buildRuntimeCaptureBindings({
  overrides: new Map([[stylesheetPath, unrelatedCss]]),
})
if (projectBinding(unrelatedBinding) !== projectBinding(expectedBinding)) {
  console.error('FAIL unrelated CSS invalidated the scoped runtime capture binding')
  failures++
} else {
  console.log('PASS runtime source binding negative control: unrelated CSS ignored')
}

for (const [label, candidate] of [
  ['unresolved token', stylesheet.replace('  --stroke-standard: #725838;\n', '')],
  [
    'cyclic token',
    stylesheet
      .replace('  --stroke-standard: #725838;', '  --stroke-standard: var(--stroke-emphasized);')
      .replace('  --stroke-emphasized: #cbb17a;', '  --stroke-emphasized: var(--stroke-standard);'),
  ],
]) {
  try {
    buildRuntimeCaptureBindings({ overrides: new Map([[stylesheetPath, candidate]]) })
  } catch (error) {
    if (!String(error).includes(label.split(' ')[0])) {
      console.error(`FAIL ${label} produced the wrong binding failure: ${error}`)
      failures++
    } else {
      console.log(`PASS runtime source binding negative control: ${label} rejected`)
    }
    continue
  }
  console.error(`FAIL runtime source binding negative control: ${label} escaped`)
  failures++
}
const providerPath = 'apps/web/src/CityScene.tsx'
const providerSource = readFileSync(join(repoRoot, providerPath), 'utf8')
const providerMarker = "'--city-shadow-left':"
if (!providerSource.includes(providerMarker)) {
  console.error('FAIL runtime source binding component-provider marker missing')
  failures++
} else {
  expectBindingDrift(
    'component property provider drift',
    new Map([[providerPath, providerSource.replace(providerMarker, "'--removed-shadow-left':")]]),
  )
}
const spec = readFileSync(join(root, 'README.md'), 'utf8')
const compose = readFileSync(join(root, 'compose.mjs'), 'utf8')
const proofSources = required.map(([rel]) => [rel, readFileSync(join(root, rel), 'utf8')])
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
