/** Deterministic source binding for the three retained #610 runtime captures. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
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
    'This evidence baseline carries across docs-only commits only while every bound runtime source, CSS projection, asset, and capture byte remains exact.',
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

export function buildRuntimeCaptureBindings({ overrides = new Map() } = {}) {
  const stylesheet = readText(stylesheetPath, overrides)
  const scopes = captureSpecs.map((spec) =>
    buildStylesheetScope(
      spec,
      stylesheet,
      spec.componentPropertyProviders.map((path) => readText(path, overrides)),
    ),
  )
  const sourceSets = Object.fromEntries(
    captureSpecs.map((spec, index) => [
      spec.id,
      {
        runtime_sources: [...new Set(spec.runtimeSources)]
          .sort()
          .map((path) => record(path, overrides)),
        runtime_assets: assetsFor(spec, overrides).map((path) => record(path, overrides)),
        stylesheet_scope: scopes[index].sha256,
      },
    ]),
  )
  const captures = captureSpecs.map((spec) => ({
    id: spec.id,
    ...record(spec.path, overrides),
    dimensions: spec.dimensions,
    source_set: spec.id,
  }))
  return {
    schema: 2,
    capture_baseline: captureBaseline,
    stylesheet_source: {
      path: stylesheetPath,
      diagnostic_full_sha256: sha256(Buffer.from(stylesheet)),
      scopes,
    },
    source_sets: sourceSets,
    captures,
  }
}

export function acceptanceProjection(binding) {
  return {
    schema: binding.schema,
    capture_baseline: binding.capture_baseline,
    stylesheet_source: {
      path: binding.stylesheet_source.path,
      scopes: binding.stylesheet_source.scopes,
    },
    source_sets: binding.source_sets,
    captures: binding.captures,
  }
}
