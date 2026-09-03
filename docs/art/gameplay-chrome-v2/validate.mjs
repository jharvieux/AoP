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
if (failures) process.exit(1)
console.log('PASS #610 design-checkpoint package')
