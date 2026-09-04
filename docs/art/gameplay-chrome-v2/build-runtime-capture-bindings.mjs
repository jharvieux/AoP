/** Regenerate the exact-source binding for the approved #610 runtime captures. */
import { writeFileSync } from 'node:fs'
import { format, resolveConfig } from 'prettier'
import { bindingPath, buildRuntimeCaptureBindings } from './runtime-capture-bindings.mjs'

const binding = buildRuntimeCaptureBindings()
const prettierConfig = (await resolveConfig(bindingPath)) ?? {}
writeFileSync(
  bindingPath,
  await format(JSON.stringify(binding), { ...prettierConfig, filepath: bindingPath }),
)
console.log(
  `bound ${binding.captures.length} captures to ${binding.shipping_sources.length} shipping sources, ${binding.build_inputs.length} build inputs, and ${binding.runtime_assets.files.length} runtime assets`,
)
