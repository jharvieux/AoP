import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const harnessRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(harnessRoot, '../../../../..')
const fixtures = JSON.parse(readFileSync(resolve(harnessRoot, 'fixtures.json'), 'utf8'))
const renewal = JSON.parse(
  readFileSync(resolve(repoRoot, 'docs/art/city-ui-v2/RUNTIME-EVIDENCE-RENEWAL.json'), 'utf8'),
)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(fixtures.schema === 1, 'unexpected fixture schema')
assert(fixtures.targetSourceHead === renewal.targetSourceHead, 'fixture source head drift')
assert(
  fixtures.supersededCaptureHead === fixtures.targetSourceHead,
  'superseded capture head must be the clean integration source head',
)
execFileSync('git', ['merge-base', '--is-ancestor', fixtures.targetSourceHead, 'HEAD'], {
  cwd: repoRoot,
})
const shippingDrift = execFileSync(
  'git',
  ['diff', '--name-only', fixtures.targetSourceHead, '--', 'apps', 'packages'],
  { cwd: repoRoot, encoding: 'utf8' },
).trim()
assert(shippingDrift === '', `shipping source differs from exact target:\n${shippingDrift}`)

const expectedStates = {
  starting: { round: 1, buildings: ['townhall', 'barracks'] },
  midgame: {
    round: 13,
    buildings: [
      'townhall',
      'barracks',
      'tavern',
      'tradehouse',
      'sawmill',
      'distillery',
      'ironmine',
      'palisade',
    ],
  },
  full: {
    round: 54,
    buildings: [
      'townhall',
      'sawmill',
      'ironmine',
      'distillery',
      'tradehouse',
      'barracks',
      'garrisonHall',
      'fortressArmory',
      'grandArsenal',
      'palisade',
      'stoneWall',
      'citadel',
      'shipyard',
      'tavern',
    ],
  },
}
for (const [id, expected] of Object.entries(expectedStates)) {
  const state = fixtures.states[id]
  assert(state.round === expected.round, `${id}: round drift`)
  assert(
    JSON.stringify(state.buildings) === JSON.stringify(expected.buildings),
    `${id}: exact building progression drift`,
  )
}

assert(fixtures.captures.length === 22, 'expected 22 unique browser frames')
const targets = fixtures.captures.flatMap((capture) => capture.targets)
assert(targets.length === 28, 'expected 28 city evidence targets')
assert(new Set(targets).size === 28, 'duplicate city evidence target')

const declaredSets = new Map(
  renewal.sets
    .filter((set) => ['city-ui-v2', 'city-harbor-v2'].includes(set.id))
    .map((set) => [
      set.id,
      new Map(set.captures.map(([name, width, height]) => [name, [width, height]])),
    ]),
)
for (const capture of fixtures.captures) {
  const [width, height] = capture.viewport
  assert(['starting', 'midgame', 'full'].includes(capture.state), `${capture.id}: unknown state`)
  assert([1, 3].includes(capture.zoom), `${capture.id}: invalid zoom`)
  if (capture.panel !== null) {
    assert(
      ['townhall', 'barracks', 'tavern'].includes(capture.panel),
      `${capture.id}: invalid panel`,
    )
  }
  for (const target of capture.targets) {
    const match = target.match(
      /^docs\/art\/(city-ui-v2|city-harbor-v2)\/runtime-captures\/([^/]+)$/,
    )
    assert(match, `${capture.id}: target escapes declared city capture roots`)
    const expectedDimensions = declaredSets.get(match[1])?.get(match[2])
    assert(expectedDimensions, `${capture.id}: target missing from renewal manifest`)
    assert(
      expectedDimensions[0] === width && expectedDimensions[1] === height,
      `${capture.id}: target dimension drift`,
    )
  }
}
for (const [setId, expected] of declaredSets) {
  const actual = targets
    .filter((target) => target.startsWith(`docs/art/${setId}/runtime-captures/`))
    .map((target) => target.split('/').at(-1))
    .sort()
  assert(
    JSON.stringify(actual) === JSON.stringify([...expected.keys()].sort()),
    `${setId}: inventory drift`,
  )
}

const shared = fixtures.captures.filter((capture) => capture.targets.length === 2)
assert(shared.length === 6, 'expected six byte-identical cross-set copies')
const semanticTextChecks = fixtures.captures.filter(
  (capture) => capture.requireNoSemanticTextOverflow,
)
assert(
  JSON.stringify(semanticTextChecks.map((capture) => capture.id).sort()) ===
    JSON.stringify(['full-phone-320', 'full-phone-375']),
  'expected semantic text checks on the full 320px and 375px phone frames',
)
for (const capture of semanticTextChecks) {
  assert(
    JSON.stringify(capture.requiredVisibleText) ===
      JSON.stringify(['Defense', 'No garrison captain', '1 ship in port']),
    `${capture.id}: full Defense copy requirement drift`,
  )
}
assert(fixtures.captures.filter((capture) => capture.zoom === 3).length === 3, '3x coverage drift')
assert(
  JSON.stringify(
    fixtures.captures
      .filter((capture) => capture.panel)
      .map((capture) => capture.panel)
      .sort(),
  ) === JSON.stringify(['barracks', 'tavern', 'townhall']),
  'management panel coverage drift',
)

console.log(
  'PASS city evidence harness: exact source ancestry; 2/8/14 buildings; 22 fresh frames -> 28 targets; six cross-set copies; 1x/3x and build/recruit/tavern coverage; full Defense copy and no-overflow checks at 320/375',
)
