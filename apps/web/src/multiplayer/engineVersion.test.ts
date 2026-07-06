import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from '@aop/shared'
import { computeEngineVersion } from '../../../../scripts/generate-engine-version.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')

// #251: ENGINE_VERSION sat at a hand-maintained '0.0.1' since repo creation
// despite dozens of real packages/engine and packages/content changes,
// leaving the replay version guard (docs/MULTIPLAYER.md §10) permanently a
// no-op — it always compared the one value to itself. ENGINE_VERSION is now
// a content hash of those two packages instead
// (scripts/generate-engine-version.mjs); this test recomputes the hash from
// the checked-out source and fails if it no longer matches the committed
// packages/shared/src/engineVersion.generated.ts, i.e. if engine or content
// changed without regenerating.
describe('ENGINE_VERSION (#251)', () => {
  it('matches a fresh hash of packages/engine/src and packages/content/src', () => {
    expect(ENGINE_VERSION).toBe(computeEngineVersion(REPO_ROOT))
  })

  it('is a non-empty hex string, not the old hardcoded literal', () => {
    expect(ENGINE_VERSION).not.toBe('0.0.1')
    expect(ENGINE_VERSION).toMatch(/^[0-9a-f]{16}$/)
  })
})
