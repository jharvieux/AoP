/** Deterministic source binding for the three retained #610 runtime captures. */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(fileURLToPath(import.meta.url))
export const repoRoot = join(packageRoot, '..', '..', '..')
export const bindingPath = join(packageRoot, 'RUNTIME-CAPTURE-BINDINGS.json')
export const stylesheetPath = 'apps/web/src/styles.css'

export const captureBaseline = {
  captured_on: '2026-09-04',
  source_head: 'f1dea84d0d489ef52db3944c47748a708ba40004',
  policy:
    'This evidence baseline carries across evidence-only commits only while the complete schema-v3 shipping-source, build-input, stylesheet, runtime-asset, frozen-state, and capture inventories remain byte-exact.',
}

export const frozenCaptureState = {
  theme: {
    active_pack: null,
    mode: 'project default',
    override: 'none',
  },
  captures: {
    'phone-world': {
      mounted_screen: 'GameScreen',
      city_open: false,
      city_phase: null,
      building_inspector: null,
      selected_building: null,
      selected_unit: 'player flagship and current hex',
      visible_state: 'resources, minimap, command dock, and traveled dotted course',
    },
    'city-inspector': {
      mounted_screen: 'GameScreen',
      city_open: true,
      city_phase: 'full (14 buildings)',
      building_inspector: 'Shipyard',
      selected_building: 'Shipyard',
      selected_unit: null,
      visible_state: 'selected Shipyard task sheet open',
    },
    'interaction-states': {
      mounted_screen: 'GameScreen',
      city_open: true,
      city_phase: 'full (14 buildings)',
      building_inspector: 'Town Hall',
      selected_building: 'Town Hall',
      selected_unit: null,
      visible_state:
        'Town Hall sheet open; close focused; info hovered and expanded; Build controls disabled with slash',
    },
  },
}

const commonSources = [
  'apps/web/src/ResourceHud.tsx',
  'apps/web/src/colorTokens.ts',
  'apps/web/src/screens/GameScreen.tsx',
  'apps/web/src/theme/ThemeContext.tsx',
  'apps/web/src/uiIcons.ts',
  'packages/content/src/factions.ts',
]

const worldSources = [
  ...commonSources,
  'apps/web/src/MapCanvas.tsx',
  'apps/web/src/Minimap.tsx',
  'apps/web/src/fleetVisibility.ts',
  'apps/web/src/mapArtRegistry.ts',
  'apps/web/src/mapCursor.ts',
  'apps/web/src/mapLayout.ts',
  'apps/web/src/mapSprites.ts',
  'apps/web/src/paintedWorld.ts',
  'apps/web/src/pathPreview.ts',
  'apps/web/src/shipAnimation.ts',
  'apps/web/src/textureLoader.ts',
  'apps/web/src/usePixiApp.ts',
]

const citySources = [
  ...commonSources,
  'apps/web/src/CityScene.tsx',
  'apps/web/src/CityScreen.tsx',
  'apps/web/src/cityBuildingInfo.ts',
  'apps/web/src/cityModals.tsx',
  'apps/web/src/citySceneLayout.json',
  'apps/web/src/components/BottomSheet.tsx',
  'apps/web/src/mapSprites.ts',
  'packages/content/src/buildings.ts',
  'packages/content/src/ships.ts',
]

const commonSelectorFamilies = [
  '.button-group',
  '.game-screen-container',
  '.gameplay-alert',
  '.gameplay-chrome',
  '.gameplay-hud',
  '.hud',
  '.resource-hud',
  '.turn-info',
  '.ui-icon',
]

const worldSelectorFamilies = [
  ...commonSelectorFamilies,
  '.bottom-action-bar',
  '.city-roster',
  '.gameplay-command-dock',
  '.idle-city-hint',
  '.map-canvas',
  '.map-container',
  '.map-course',
  '.map-minimap',
  '.map-nav',
  '.sail-interrupt',
  '.selection-info',
  '.turn-event-feed',
]

const citySelectorFamilies = [
  ...commonSelectorFamilies,
  '.build-row',
  '.building-',
  '.button-icon',
  '.checkbox-row',
  '.city-scene',
  '.garrison-row',
  '.info-toggle',
  '.sheet',
  '.unit-row',
]

export const captureSpecs = [
  {
    id: 'phone-world',
    path: 'docs/art/gameplay-chrome-v2/runtime-captures/runtime-phone-world-375x812.png',
    dimensions: [375, 812],
    runtimeSources: worldSources,
    selectorFamilies: worldSelectorFamilies,
    componentPropertyProviders: [],
    assetKind: 'world',
  },
  {
    id: 'city-inspector',
    path: 'docs/art/gameplay-chrome-v2/runtime-captures/runtime-city-inspector-1440x900.png',
    dimensions: [1440, 900],
    runtimeSources: citySources,
    selectorFamilies: citySelectorFamilies,
    componentPropertyProviders: ['apps/web/src/CityScene.tsx'],
    assetKind: 'city-inspector',
  },
  {
    id: 'interaction-states',
    path: 'docs/art/gameplay-chrome-v2/runtime-captures/runtime-interaction-states-1440x960.png',
    dimensions: [1440, 960],
    runtimeSources: citySources,
    selectorFamilies: citySelectorFamilies,
    componentPropertyProviders: ['apps/web/src/CityScene.tsx'],
    assetKind: 'interaction',
  },
]

export const sourceTreePolicies = [
  {
    id: 'web-runtime',
    root: 'apps/web/src',
    policy: 'all regular files except *.test.* / *.spec.* and __tests__ trees',
    excludeTests: true,
  },
  {
    id: 'engine-source',
    root: 'packages/engine/src',
    policy: 'all regular files',
    excludeTests: false,
  },
  {
    id: 'shared-source',
    root: 'packages/shared/src',
    policy: 'all regular files',
    excludeTests: false,
  },
  {
    id: 'content-source',
    root: 'packages/content/src',
    policy: 'all regular files',
    excludeTests: false,
  },
]

export const buildInputPaths = [
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

export const receiptPaths = [
  'docs/art/city-harbor-v2/PRODUCTION-OUTPUT-HASHES.json',
  'docs/art/world-map-v2/runtime-public-receipt.json',
]

const commonAssets = [
  'apps/web/public/art/resources/gold.png',
  'apps/web/public/art/resources/iron.png',
  'apps/web/public/art/resources/rum.png',
  'apps/web/public/art/resources/timber.png',
  'apps/web/public/fonts/cabin-latin.woff2',
  'apps/web/public/fonts/pirata-one-latin.woff2',
]

const factionFlags = ['british', 'dutch', 'french', 'pirates', 'spanish'].map(
  (faction) => `apps/web/public/art/factions/${faction}/flag.png`,
)

const canvasSourcePaths = ['apps/web/src/MapCanvas.tsx', 'apps/web/src/Minimap.tsx']
const v2BoundCanvasTokens = new Set(['--color-brass', '--color-deep-water'])

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const normalise = (value) => value.replace(/\s+/g, ' ').trim()
const stripComments = (value) => value.replace(/\/\*[\s\S]*?\*\//g, '')

function readBuffer(path, overrides) {
  const override = overrides.get(path)
  if (override !== undefined) return Buffer.isBuffer(override) ? override : Buffer.from(override)
  return readFileSync(join(repoRoot, path))
}

function readText(path, overrides) {
  return readBuffer(path, overrides).toString('utf8')
}

function record(path, overrides) {
  const source = readBuffer(path, overrides)
  return { path, bytes: source.byteLength, sha256: sha256(source) }
}

function isTestPath(path) {
  return /(?:^|\/)__tests__(?:\/|$)/.test(path) || /\.(?:test|spec)\.[^/]+$/.test(path)
}

function walkFiles(rootPath) {
  const result = []
  const visit = (path) => {
    for (const entry of readdirSync(join(repoRoot, path), { withFileTypes: true })) {
      const child = `${path}/${entry.name}`
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile()) result.push(child)
      else throw new Error(`unsupported source-tree entry: ${child}`)
    }
  }
  visit(rootPath)
  return result
}

function sourcePolicyFor(path) {
  return sourceTreePolicies.find((policy) => path.startsWith(`${policy.root}/`))
}

function shippingSourcePaths(additionalPaths) {
  const paths = sourceTreePolicies.flatMap((policy) =>
    walkFiles(policy.root).filter((path) => !policy.excludeTests || !isTestPath(path)),
  )
  for (const path of additionalPaths) {
    const policy = sourcePolicyFor(path)
    if (!policy || (policy.excludeTests && isTestPath(path))) {
      throw new Error(`additional source is outside the shipping-source policy: ${path}`)
    }
    paths.push(path)
  }
  return [...new Set(paths)].sort()
}

function blockEnd(source, openingBrace) {
  let depth = 1
  let quote = null
  let escaped = false
  for (let index = openingBrace + 1; index < source.length; index++) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
    } else if (character === "'" || character === '"') quote = character
    else if (character === '{') depth++
    else if (character === '}' && --depth === 0) return index
  }
  throw new Error('unbalanced CSS block')
}

function cssRules(source, wrappers = []) {
  const rules = []
  let index = 0
  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) index++
    if (index >= source.length) break
    const openingBrace = source.indexOf('{', index)
    const terminator = source.indexOf(';', index)
    if (terminator >= 0 && (openingBrace < 0 || terminator < openingBrace)) {
      index = terminator + 1
      continue
    }
    if (openingBrace < 0) {
      if (source.slice(index).trim()) throw new Error('unparsed CSS content')
      break
    }
    const header = normalise(source.slice(index, openingBrace))
    const closingBrace = blockEnd(source, openingBrace)
    const body = source.slice(openingBrace + 1, closingBrace).trim()
    if (/^@(media|supports|container|layer)\s/.test(header)) {
      rules.push(...cssRules(body, [...wrappers, header]))
    } else if (header === '@font-face' || !header.startsWith('@')) {
      rules.push({ wrappers, selector: header, body })
    }
    index = closingBrace + 1
  }
  return rules
}

function customProperties(body) {
  const declarations = new Map()
  for (const match of body.matchAll(/^[ \t]*(--[-\w]+)[ \t]*:[ \t]*([\s\S]*?);/gm)) {
    const name = match[1]
    if (declarations.has(name)) throw new Error(`duplicate custom property declaration: ${name}`)
    declarations.set(name, normalise(match[2]))
  }
  return declarations
}

function selectorMatches(selector, families) {
  if (selector === '@font-face') return true
  return selector.split(',').some((part) => {
    const candidate = normalise(part)
    return (
      ['*', 'html', 'body', '#root', 'h1', 'h2', 'h3'].includes(candidate) ||
      /^button(?:$|[.:[#\s>+~])/.test(candidate) ||
      families.some((family) => candidate.includes(family))
    )
  })
}

export function buildStylesheetScope(spec, stylesheet, providerSources = []) {
  const rules = cssRules(stripComments(stylesheet))
  const rootRules = rules.filter((rule) => rule.selector === ':root' && !rule.wrappers.length)
  if (rootRules.length !== 1)
    throw new Error(`expected one top-level :root, found ${rootRules.length}`)
  const rootProperties = customProperties(rootRules[0].body)
  const scopedRules = rules.filter(
    (rule) => rule.selector !== ':root' && selectorMatches(rule.selector, spec.selectorFamilies),
  )
  if (!scopedRules.length) throw new Error(`empty CSS scope: ${spec.id}`)

  const localProperties = new Map()
  for (const rule of scopedRules) {
    for (const [name, value] of customProperties(rule.body)) {
      const values = localProperties.get(name) ?? new Set()
      values.add(value)
      localProperties.set(name, values)
    }
  }
  const componentProperties = new Set(
    providerSources.flatMap((source) =>
      [...source.matchAll(/['"](--[-\w]+)['"]\s*:/g)].map((match) => match[1]),
    ),
  )
  const referenced = new Set(
    scopedRules.flatMap((rule) => [
      ...[...rule.body.matchAll(/var\(\s*(--[-\w]+)/g)].map((match) => match[1]),
    ]),
  )
  const resolvedRoot = new Set()
  const resolvedLocal = new Set()
  const resolvedComponent = new Set()
  const resolving = []

  function resolveProperty(name) {
    if (resolvedRoot.has(name) || resolvedLocal.has(name) || resolvedComponent.has(name)) return
    if (resolving.includes(name)) {
      const cycle = [...resolving.slice(resolving.indexOf(name)), name].join(' -> ')
      throw new Error(`cyclic custom property dependency: ${cycle}`)
    }
    if (localProperties.has(name)) {
      resolving.push(name)
      for (const value of localProperties.get(name)) {
        for (const match of value.matchAll(/var\(\s*(--[-\w]+)/g)) resolveProperty(match[1])
      }
      resolving.pop()
      resolvedLocal.add(name)
      return
    }
    if (rootProperties.has(name)) {
      resolving.push(name)
      for (const match of rootProperties.get(name).matchAll(/var\(\s*(--[-\w]+)/g)) {
        resolveProperty(match[1])
      }
      resolving.pop()
      resolvedRoot.add(name)
      return
    }
    if (componentProperties.has(name)) {
      resolvedComponent.add(name)
      return
    }
    throw new Error(`unresolved ${spec.id} stylesheet custom property: ${name}`)
  }

  for (const name of [...referenced].sort()) resolveProperty(name)
  const ruleInventory = scopedRules.map((rule) => ({
    at_rules: rule.wrappers,
    selector: rule.selector,
    body_sha256: sha256(rule.body),
  }))
  const rootInventory = [...resolvedRoot]
    .sort()
    .map((name) => ({ name, value: rootProperties.get(name) }))
  const localInventory = [...resolvedLocal].sort().map((name) => ({
    name,
    values: [...localProperties.get(name)].sort(),
  }))
  const componentInventory = [...resolvedComponent].sort()
  const projection = [
    'scope:gameplay-runtime-capture-selector-token-closure-v1',
    `id:${spec.id}`,
    ...spec.selectorFamilies.map((family) => `family:${family}`),
    ...scopedRules.flatMap((rule) => [
      `at:${rule.wrappers.join(' > ')}`,
      `selector:${rule.selector}`,
      rule.body,
    ]),
    ...rootInventory.map((item) => `root:${item.name}:${item.value}`),
    ...localInventory.map((item) => `local:${item.name}:${item.values.join('|')}`),
    ...componentInventory.map((name) => `component:${name}`),
    '',
  ].join('\n')
  return {
    id: spec.id,
    kind: 'gameplay-runtime-capture-selector-token-closure-v1',
    sha256: sha256(projection),
    selector_families: spec.selectorFamilies,
    rules: ruleInventory,
    root_custom_properties: rootInventory,
    local_custom_properties: localInventory,
    component_custom_properties: componentInventory,
  }
}

function typedFallbacks(source) {
  return new Map(
    [...source.matchAll(/['"](?<name>--[^'"]+)['"]:\s*['"](?<value>#[0-9a-f]+)['"]/gi)].map(
      (match) => [match.groups.name, match.groups.value],
    ),
  )
}

function canvasTokenCensus(stylesheet, overrides) {
  const calls = canvasSourcePaths.flatMap((path) =>
    [
      ...readText(path, overrides).matchAll(
        /cssToken\(\s*['"](?<name>--[^'"]+)['"]\s*,\s*['"](?<value>#[0-9a-f]+)['"]\s*\)/gi,
      ),
    ].map((match) => ({ path, name: match.groups.name, fallback: match.groups.value })),
  )
  const rules = cssRules(stripComments(stylesheet))
  const rootRules = rules.filter((rule) => rule.selector === ':root' && !rule.wrappers.length)
  if (rootRules.length !== 1)
    throw new Error(`expected one top-level :root, found ${rootRules.length}`)
  const rootTokens = customProperties(rootRules[0].body)
  const fallbacks = typedFallbacks(readText('apps/web/src/colorTokens.ts', overrides))
  const byName = new Map()
  for (const call of calls) {
    const prior = byName.get(call.name)
    if (prior && prior.fallback !== call.fallback) {
      throw new Error(`conflicting Canvas fallback for ${call.name}`)
    }
    byName.set(call.name, { name: call.name, fallback: call.fallback })
  }
  const tokens = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  for (const token of tokens) {
    const cssValue = rootTokens.get(token.name)
    const typedValue = fallbacks.get(token.name)
    if (!cssValue || cssValue !== token.fallback || typedValue !== token.fallback) {
      throw new Error(
        `Canvas token parity failure ${token.name}: call=${token.fallback}, typed=${typedValue}, CSS=${cssValue}`,
      )
    }
    token.css_value = cssValue
    token.typed_fallback = typedValue
  }
  const escapedTokens = tokens
    .filter((token) => !v2BoundCanvasTokens.has(token.name))
    .map((token) => token.name)
  return {
    source_paths: canvasSourcePaths,
    call_count: calls.length,
    unique_token_count: tokens.length,
    tokens,
    schema_v2_escape_count: escapedTokens.length,
    schema_v2_escape_tokens: escapedTokens,
  }
}

function discoveredWorldAssets(overrides) {
  const receipt = JSON.parse(
    readText('docs/art/world-map-v2/runtime-public-receipt.json', overrides),
  )
  for (const item of receipt.assets) {
    const actual = record(item.public_path, overrides)
    if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) {
      throw new Error(`world runtime receipt drift: ${item.public_path}`)
    }
  }
  return [
    ...receipt.assets.map((item) => item.public_path),
    'apps/web/public/art/tiles/land.png',
    'apps/web/public/art/tiles/port.png',
    ...factionFlags,
  ]
}

function discoveredCityAssets(overrides) {
  const receipt = JSON.parse(
    readText('docs/art/city-harbor-v2/PRODUCTION-OUTPUT-HASHES.json', overrides),
  )
  const assets = receipt.files.filter((item) => item.path.startsWith('apps/web/public/art/city/'))
  for (const item of assets) {
    const actual = record(item.path, overrides)
    if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) {
      throw new Error(`city production receipt drift: ${item.path}`)
    }
  }
  return [...assets.map((item) => item.path), ...factionFlags]
}

function assetsFor(spec, overrides) {
  const surfaceAssets =
    spec.assetKind === 'world'
      ? discoveredWorldAssets(overrides)
      : [
          ...discoveredCityAssets(overrides),
          `apps/web/public/art/ui/${spec.assetKind === 'interaction' ? 'build' : 'upgrade'}.png`,
        ]
  return [...new Set([...commonAssets, ...surfaceAssets])].sort()
}

export function buildRuntimeCaptureBindings({
  overrides = new Map(),
  additionalShippingSourcePaths = [],
} = {}) {
  const stylesheet = readText(stylesheetPath, overrides)
  const scopes = captureSpecs.map((spec) =>
    buildStylesheetScope(
      spec,
      stylesheet,
      spec.componentPropertyProviders.map((path) => readText(path, overrides)),
    ),
  )
  const assetSets = Object.fromEntries(
    captureSpecs.map((spec) => [spec.id, assetsFor(spec, overrides)]),
  )
  const runtimeAssetPaths = [...new Set(Object.values(assetSets).flat())].sort()
  return {
    schema: 3,
    capture_baseline: captureBaseline,
    binding_boundary: {
      kind: 'conservative-shipping-tree-manifest-v3',
      policy:
        'Any byte or inventory change inside the declared shipping source trees, build inputs, full stylesheet, receipts, runtime assets, frozen state, or captures invalidates this evidence.',
      source_tree_policies: sourceTreePolicies.map(({ id, root, policy }) => ({
        id,
        root,
        policy,
      })),
    },
    frozen_capture_state: frozenCaptureState,
    shipping_sources: shippingSourcePaths(additionalShippingSourcePaths).map((path) =>
      record(path, overrides),
    ),
    build_inputs: buildInputPaths.map((path) => record(path, overrides)),
    stylesheet_source: {
      ...record(stylesheetPath, overrides),
      acceptance: 'full exact-file hash; scoped-selector projections are diagnostic only',
    },
    canvas_token_census: canvasTokenCensus(stylesheet, overrides),
    runtime_assets: {
      receipts: receiptPaths.map((path) => record(path, overrides)),
      capture_sets: assetSets,
      files: runtimeAssetPaths.map((path) => record(path, overrides)),
    },
    captures: captureSpecs.map((spec) => ({
      id: spec.id,
      ...record(spec.path, overrides),
      dimensions: spec.dimensions,
      frozen_state: spec.id,
    })),
    diagnostics: {
      legacy_scoped_stylesheet_projections: scopes,
    },
  }
}

export function acceptanceProjection(binding) {
  const { diagnostics: _diagnostics, ...acceptance } = binding
  return acceptance
}
