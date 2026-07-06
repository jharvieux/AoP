import { describe, expect, it } from 'vitest'
import { buildCatalog as buildClientCatalog } from '../catalog'
import { buildMatchConfig as buildClientMatchConfig } from './matchConfig'
// The server's twin (#250) — a plain TS module with no Deno-specific imports,
// so it is importable straight from Vitest. This golden test is the guard
// against the two ever re-drifting the way #250 found `resourceNodes` had:
// no schema catches it (`ContentCatalog.resourceNodes` is optional) and the
// edge functions aren't typechecked in CI (#248).
import {
  buildCatalog as buildServerCatalog,
  buildMatchConfig as buildServerMatchConfig,
  type SeatConfig,
} from '../../../../supabase/functions/_shared/catalog'

describe('client/server buildCatalog + buildMatchConfig parity (#250)', () => {
  it('buildCatalog() is byte-for-byte identical on both tiers', () => {
    expect(buildClientCatalog()).toEqual(buildServerCatalog())
  })

  it('buildCatalog() includes resourceNodes on both tiers (the #250 drift)', () => {
    expect(buildClientCatalog().resourceNodes).toBeDefined()
    expect(buildServerCatalog().resourceNodes).toBeDefined()
    expect(buildClientCatalog().resourceNodes).toEqual(buildServerCatalog().resourceNodes)
  })

  it('buildMatchConfig() is byte-for-byte identical on both tiers for the same inputs', () => {
    const seats: SeatConfig[] = [
      { seat: 0, faction: 'pirates', isAI: false, displayName: 'Captain Ahab' },
      { seat: 1, faction: 'dutch', isAI: true, displayName: 'AI 1' },
    ]
    const clientConfig = buildClientMatchConfig(42, 'medium', seats, {
      betrayalReputationPenalty: 60,
      betrayalTruceRounds: 1,
    })
    const serverConfig = buildServerMatchConfig(42, 'medium', seats, {
      betrayalReputationPenalty: 60,
      betrayalTruceRounds: 1,
    })
    expect(clientConfig).toEqual(serverConfig)
  })
})
