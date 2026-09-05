import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReceipt, validateReceipt } from './tools/build-receipt.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const actual = JSON.parse(readFileSync(resolve(root, 'RUNTIME-CAPTURE-MANIFEST.json'), 'utf8'))
const expected = buildReceipt()
const measurements = JSON.parse(readFileSync(resolve(root, 'RUNTIME-MEASUREMENTS.json'), 'utf8'))

if (JSON.stringify(actual) !== JSON.stringify(expected))
  throw new Error('receipt or material drift')

const expectedDpr = new Map([
  ['runtime-captures/map-phone-375x667.jpg', 2],
  ['runtime-captures/map-phone-minimap-focus-390x844.jpg', 1],
  ['runtime-captures/map-phone-landscape-844x390.jpg', 1],
  ['runtime-captures/map-tablet-portrait-768x1024.jpg', 1],
  ['runtime-captures/map-tablet-landscape-1024x768.jpg', 1],
  ['runtime-captures/map-desktop-more-1440x900.jpg', 1],
  ['runtime-captures/map-phone-landscape-mp-844x390.jpg', 1],
])

const requiredMoreStates = new Map([
  [
    'runtime-captures/map-phone-landscape-844x390.jpg',
    { open: ['Saves', 'Resign'], confirm: ['Saves', 'Confirm Resign', 'Cancel'] },
  ],
  ['runtime-captures/map-desktop-more-1440x900.jpg', { open: ['Saves', 'Resign'] }],
  [
    'runtime-captures/map-phone-landscape-mp-844x390.jpg',
    {
      open: ['Diplomacy', 'Chat', 'Resign', 'Leave'],
      confirm: ['Diplomacy', 'Chat', 'Confirm Resign', 'Cancel', 'Leave'],
    },
  ],
])

function rectContained(rect, viewport) {
  const [x, y, width, height] = rect
  return (
    width > 0 &&
    height > 0 &&
    x >= 0 &&
    y >= 0 &&
    x + width <= viewport[0] + 0.01 &&
    y + height <= viewport[1] + 0.01
  )
}

function rectsIntersect(a, b) {
  return a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1]
}

function validateMeasurements(observations) {
  if (observations.schema !== 'aop-map-ux-runtime-measurements-v2') {
    throw new Error('unexpected measurement schema')
  }
  if (
    observations.source_head !== expected.source_head ||
    observations.source_tree !== expected.source_tree
  ) {
    throw new Error('measurement source drift')
  }
  if (observations.frames.length !== expectedDpr.size) {
    throw new Error('measurement frame count drift')
  }
  const requiredRegions = ['alerts', 'events', 'minimap', 'navigation', 'roster', 'route']
  const captureSpecs = new Map(
    expected.captures.map((capture) => [capture.path, [capture.width, capture.height]]),
  )
  const seenCaptures = new Set()
  for (const frame of observations.frames) {
    if (!expectedDpr.has(frame.capture) || seenCaptures.has(frame.capture)) {
      throw new Error(`${frame.capture}: unexpected or duplicate measurement frame`)
    }
    seenCaptures.add(frame.capture)
    if (frame.device_pixel_ratio !== expectedDpr.get(frame.capture)) {
      throw new Error(`${frame.capture}: device pixel ratio drift`)
    }
    if (JSON.stringify(frame.viewport) !== JSON.stringify(captureSpecs.get(frame.capture))) {
      throw new Error(`${frame.capture}: measured viewport does not match capture`)
    }
    if (JSON.stringify(frame.document.client) !== JSON.stringify(frame.viewport)) {
      throw new Error(`${frame.capture}: client viewport drift`)
    }
    if (JSON.stringify(frame.document.scroll) !== JSON.stringify(frame.viewport)) {
      throw new Error(`${frame.capture}: document overflow`)
    }
    if (!rectContained(frame.command_dock, frame.viewport)) {
      throw new Error(`${frame.capture}: command dock overflow`)
    }
    if (
      frame.visible_overlay_region_count !== requiredRegions.length ||
      frame.overlay_intersections !== 0
    ) {
      throw new Error(`${frame.capture}: overlay collision/count drift`)
    }
    if (
      frame.minimum_direct_target < 44 ||
      !Array.isArray(frame.undersized_direct_targets) ||
      frame.undersized_direct_targets.length
    ) {
      throw new Error(`${frame.capture}: undersized target`)
    }
    if (JSON.stringify(frame.visible_primary_commands) !== JSON.stringify(['City', 'End Turn'])) {
      throw new Error(`${frame.capture}: primary command visibility drift`)
    }
    if (frame.aria_busy || frame.map_error) throw new Error(`${frame.capture}: map not ready`)
    const regionRects = requiredRegions.map((region) => {
      const rect = frame.regions[region]
      if (!rect || !rectContained(rect, frame.viewport)) {
        throw new Error(`${frame.capture}: missing or overflowing ${region} region`)
      }
      return rect
    })
    const computedRegionIntersections = regionRects.reduce(
      (count, rect, index) =>
        count + regionRects.slice(index + 1).filter((other) => rectsIntersect(rect, other)).length,
      0,
    )
    if (computedRegionIntersections !== frame.overlay_intersections) {
      throw new Error(`${frame.capture}: region geometry contradicts collision count`)
    }
    const requiredStates = requiredMoreStates.get(frame.capture) ?? {}
    for (const [stateName, actionLabels] of Object.entries(requiredStates)) {
      const state = frame.more_menu?.[stateName]
      if (!state || !state.contained_in_document || state.region_intersections !== 0) {
        throw new Error(`${frame.capture}: ${stateName} More state missing or uncontained`)
      }
      if (!rectContained(state.menu, frame.viewport)) {
        throw new Error(`${frame.capture}: ${stateName} More menu overflow`)
      }
      if (regionRects.some((region) => rectsIntersect(region, state.menu))) {
        throw new Error(`${frame.capture}: ${stateName} More menu collides with overlay`)
      }
      for (const label of actionLabels) {
        if (!state.actions[label]) {
          throw new Error(`${frame.capture}: ${stateName} ${label} action missing`)
        }
      }
      for (const [label, rect] of Object.entries(state.actions)) {
        if (!rectContained(rect, frame.viewport) || rect[3] < 44) {
          throw new Error(`${frame.capture}: ${stateName} ${label} clipped or undersized`)
        }
        if (
          rect[0] < state.menu[0] ||
          rect[1] < state.menu[1] ||
          rect[0] + rect[2] > state.menu[0] + state.menu[2] + 0.01 ||
          rect[1] + rect[3] > state.menu[1] + state.menu[3] + 0.01
        ) {
          throw new Error(`${frame.capture}: ${stateName} ${label} escapes More menu`)
        }
      }
    }
  }
  if (seenCaptures.size !== expectedDpr.size) throw new Error('required measurements missing')
  const supplemental = observations.frames.find(
    (frame) => frame.mode === 'multiplayer' && frame.supplemental,
  )
  if (!supplemental?.more_menu.confirm.actions.Leave) {
    throw new Error('supplemental MP Leave containment proof missing')
  }
  const interactions = observations.exact_source_interactions
  if (
    !interactions.minimap_keyboard.focus_visible ||
    !interactions.minimap_keyboard.enter_moved_viewport ||
    interactions.minimap_keyboard.accessible_name !== 'Map overview'
  ) {
    throw new Error('exact-source minimap interaction evidence missing')
  }
  for (const contract of [
    interactions.camera_bounds_and_interruption,
    interactions.city_layering_and_focus,
    interactions.reduced_motion,
  ]) {
    if (contract.status !== 'source-and-regression-test-pass') {
      throw new Error('source/test interaction contract drift')
    }
  }
  if (interactions.camera_bounds_and_interruption.live_numeric_transition_recheck) {
    throw new Error('unperformed live camera check claimed')
  }
  if (interactions.city_layering_and_focus.live_dialog_recheck) {
    throw new Error('unperformed live city check claimed')
  }
  if (interactions.reduced_motion.live_media_emulation) {
    throw new Error('unavailable reduced-motion emulation claimed')
  }
  if (observations.privacy.status !== 'pass') throw new Error('privacy verdict drift')
  const touch = observations.external_touch_candidate
  if (
    touch.attached_to_this_package ||
    touch.source_head !== expected.source_head ||
    touch.recording_sha256 !==
      expected.capability_gates.touch_recording.external_candidate.recording_sha256 ||
    touch.metadata_sha256 !==
      expected.capability_gates.touch_recording.external_candidate.metadata_sha256
  ) {
    throw new Error('external touch candidate drift')
  }
}

validateMeasurements(measurements)

function expectRejected(label, mutate) {
  const candidate = structuredClone(expected)
  mutate(candidate)
  try {
    validateReceipt(candidate)
  } catch {
    return
  }
  throw new Error(`negative control did not reject ${label}`)
}

expectRejected('source head drift', (receipt) => {
  receipt.source_head = '0'.repeat(40)
})
expectRejected('premature operator approval', (receipt) => {
  receipt.approval.captures_operator_approved = true
})
expectRejected('false touch attachment', (receipt) => {
  receipt.approval.touch_recording_attached = true
})
expectRejected('premature touch integration', (receipt) => {
  receipt.capability_gates.touch_recording.status = 'pass'
})
expectRejected('external touch candidate drift', (receipt) => {
  receipt.capability_gates.touch_recording.external_candidate.recording_sha256 = '0'.repeat(64)
})
expectRejected('source archive drift', (receipt) => {
  receipt.source_archive_sha256 = '0'.repeat(64)
})
expectRejected('missing viewport', (receipt) => {
  receipt.captures = receipt.captures.filter((capture) => capture.width !== 375)
})
expectRejected('missing multiplayer proof', (receipt) => {
  receipt.captures = receipt.captures.filter((capture) => capture.primary)
})
expectRejected('capture over budget', (receipt) => {
  receipt.captures[0].bytes = 300 * 1024
})
expectRejected('capture hash drift', (receipt) => {
  receipt.captures[0].sha256 = '0'.repeat(64)
})
expectRejected('capture dimension drift', (receipt) => {
  receipt.captures[0].width++
})

function expectMeasurementsRejected(label, mutate) {
  const candidate = structuredClone(measurements)
  mutate(candidate)
  try {
    validateMeasurements(candidate)
  } catch {
    return
  }
  throw new Error(`measurement negative control did not reject ${label}`)
}

expectMeasurementsRejected('document overflow', (observations) => {
  observations.frames[0].document.scroll[0]++
})
expectMeasurementsRejected('device pixel ratio drift', (observations) => {
  observations.frames[0].device_pixel_ratio = 1
})
expectMeasurementsRejected('overlay collision', (observations) => {
  observations.frames[0].overlay_intersections = 1
})
expectMeasurementsRejected('contradictory region geometry', (observations) => {
  observations.frames[0].regions.navigation = observations.frames[0].regions.events
})
expectMeasurementsRejected('undersized target', (observations) => {
  observations.frames[0].minimum_direct_target = 43
})
expectMeasurementsRejected('clipped compact MP action', (observations) => {
  const mp = observations.frames.find((frame) => frame.supplemental)
  mp.more_menu.confirm.actions.Leave[0] = 810
})
expectMeasurementsRejected('missing compact MP Leave proof', (observations) => {
  const mp = observations.frames.find((frame) => frame.supplemental)
  delete mp.more_menu.confirm.actions.Leave
})
expectMeasurementsRejected('false live camera claim', (observations) => {
  observations.exact_source_interactions.camera_bounds_and_interruption.live_numeric_transition_recheck = true
})
expectMeasurementsRejected('premature touch attachment', (observations) => {
  observations.external_touch_candidate.attached_to_this_package = true
})

console.log(
  `validated ${actual.captures.length} exact-source captures; binding ${actual.binding_sha256}; negative controls PASS`,
)
