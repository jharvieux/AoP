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

function validateMeasurements(observations) {
  if (observations.schema !== 'aop-map-ux-runtime-measurements-v1') {
    throw new Error('unexpected measurement schema')
  }
  if (observations.source_head !== expected.source_head) throw new Error('measurement source drift')
  if (observations.device_pixel_ratio !== 1) throw new Error('unexpected device pixel ratio')
  if (observations.frames.length !== 7) throw new Error('measurement frame count drift')
  const requiredRegions = ['alerts', 'events', 'minimap', 'navigation', 'roster', 'route']
  for (const frame of observations.frames) {
    if (JSON.stringify(frame.document.client) !== JSON.stringify(frame.viewport)) {
      throw new Error(`${frame.viewport}: client viewport drift`)
    }
    if (JSON.stringify(frame.document.scroll) !== JSON.stringify(frame.viewport)) {
      throw new Error(`${frame.viewport}: document overflow`)
    }
    if (frame.overlay_intersections !== 0) throw new Error(`${frame.viewport}: overlay collision`)
    if (frame.minimum_direct_target < 44 || frame.undersized_direct_targets !== 0) {
      throw new Error(`${frame.viewport}: undersized target`)
    }
    if (frame.aria_busy || frame.map_error) throw new Error(`${frame.viewport}: map not ready`)
    for (const region of requiredRegions) {
      if (!frame.regions[region]) throw new Error(`${frame.viewport}: missing ${region} region`)
    }
  }
  if (!observations.frames.some((frame) => frame.mode === 'multiplayer' && frame.supplemental)) {
    throw new Error('supplemental MP measurements missing')
  }
  const interactions = observations.live_interactions
  if (!interactions.minimap_keyboard.focus_visible) throw new Error('minimap focus missing')
  if (!interactions.minimap_pointer.focused || !interactions.minimap_pointer.bounded) {
    throw new Error('minimap pointer evidence missing')
  }
  if (!interactions.camera_interruption.document_stayed_bounded) {
    throw new Error('camera bounds evidence missing')
  }
  if (
    JSON.stringify(interactions.camera_interruption.drag_after) !==
      JSON.stringify(interactions.camera_interruption.drag_after_400ms) ||
    JSON.stringify(interactions.camera_interruption.wheel_after) !==
      JSON.stringify(interactions.camera_interruption.wheel_after_400ms)
  ) {
    throw new Error('camera interruption stability drift')
  }
  if (
    !interactions.city_layering.game_screen_inert_while_open ||
    interactions.city_layering.game_screen_inert_after_close ||
    interactions.city_layering.restored_focus !== 'City'
  ) {
    throw new Error('city focus lifecycle drift')
  }
  if (observations.privacy.status !== 'pass') throw new Error('privacy verdict drift')
  if (
    !observations.capability_limits.physical_touch_multitouch_video.startsWith('pending external')
  ) {
    throw new Error('touch limitation must remain pending external')
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
expectRejected('closed external touch gate', (receipt) => {
  receipt.capability_gates.touch_recording.status = 'pass'
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
expectMeasurementsRejected('overlay collision', (observations) => {
  observations.frames[0].overlay_intersections = 1
})
expectMeasurementsRejected('undersized target', (observations) => {
  observations.frames[0].minimum_direct_target = 43
})
expectMeasurementsRejected('unstable interruption', (observations) => {
  observations.live_interactions.camera_interruption.drag_after_400ms.left_percent++
})
expectMeasurementsRejected('closed touch limitation', (observations) => {
  observations.capability_limits.physical_touch_multitouch_video = 'pass'
})

console.log(
  `validated ${actual.captures.length} exact-source captures; binding ${actual.binding_sha256}; negative controls PASS`,
)
