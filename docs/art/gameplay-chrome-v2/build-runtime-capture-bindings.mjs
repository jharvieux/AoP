/** Regenerate the exact-source binding for the approved #610 runtime captures. */
import { writeFileSync } from 'node:fs'
import { bindingPath, buildRuntimeCaptureBindings } from './runtime-capture-bindings.mjs'

const binding = buildRuntimeCaptureBindings()
writeFileSync(bindingPath, `${JSON.stringify(binding, null, 2)}\n`)
console.log(
  `bound ${binding.captures.length} captures to ${Object.keys(binding.source_sets).length} runtime source sets`,
)
