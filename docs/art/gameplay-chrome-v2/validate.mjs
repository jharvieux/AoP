/** Fail-loud validation for the #610 review package. Usage: node validate.mjs */
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const required = [
  ['mockups/phone-world-map-375x812.svg', 375, 812],
  ['mockups/city-inspector-desktop-1440x900.svg', 1440, 900],
  ['mockups/token-type-icon-sheet-1440x960.svg', 1440, 960],
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
if (failures) process.exit(1)
console.log('PASS #610 design-checkpoint package')
