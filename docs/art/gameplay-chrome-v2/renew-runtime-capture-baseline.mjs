/** Explicitly renew the capture baseline after a newly recorded operator decision. */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { format, resolveConfig } from 'prettier'
import {
  bindingPath,
  materialBaselinePath,
  prepareRuntimeCaptureBaselineRenewal,
  repoRoot,
} from './runtime-capture-bindings.mjs'

const packageRoot = dirname(fileURLToPath(import.meta.url))
const values = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index]
  const value = process.argv[index + 1]
  if (!flag?.startsWith('--') || value === undefined) throw new Error(`invalid argument: ${flag}`)
  values.set(flag, value)
}
const expectedFlags = ['--source-head', '--capture-record', '--captured-on', '--confirmation']
if (
  values.size !== expectedFlags.length ||
  expectedFlags.some((flag) => !values.has(flag)) ||
  [...values.keys()].some((flag) => !expectedFlags.includes(flag))
) {
  throw new Error(
    `usage: node renew-runtime-capture-baseline.mjs ${expectedFlags.map((flag) => `${flag} <value>`).join(' ')}`,
  )
}
if (values.get('--confirmation') !== 'RENEW_CAPTURE_APPROVAL') {
  throw new Error('renewal requires --confirmation RENEW_CAPTURE_APPROVAL')
}

const requestedHead = values.get('--source-head')
const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim()
if (requestedHead !== currentHead) {
  throw new Error(`capture source head ${requestedHead} is not current HEAD ${currentHead}`)
}

const baseline = prepareRuntimeCaptureBaselineRenewal({
  sourceHead: requestedHead,
  captureRecord: values.get('--capture-record'),
  capturedOn: values.get('--captured-on'),
  confirmation: values.get('--confirmation'),
})
const prettierConfig = (await resolveConfig(materialBaselinePath)) ?? {}
const nextBaseline = await format(JSON.stringify(baseline), {
  ...prettierConfig,
  filepath: materialBaselinePath,
})
const priorBaseline = readFileSync(materialBaselinePath)
const priorBinding = readFileSync(bindingPath)
try {
  writeFileSync(materialBaselinePath, nextBaseline)
  execFileSync(process.execPath, [join(packageRoot, 'build-runtime-capture-bindings.mjs')], {
    stdio: 'inherit',
  })
} catch (error) {
  writeFileSync(materialBaselinePath, priorBaseline)
  writeFileSync(bindingPath, priorBinding)
  throw error
}
