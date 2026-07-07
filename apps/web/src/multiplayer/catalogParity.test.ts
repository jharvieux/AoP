import { describe, expect, it } from 'vitest'
import { buildCatalog as buildClientCatalog } from '../catalog'
import {
  buildCatalog as buildServerCatalog,
  buildMatchConfig as buildServerMatchConfig,
} from '../../../../supabase/functions/_shared/catalog'
import { buildMatchConfig as buildClientMatchConfig, type SeatConfig } from './matchConfig'

const SEATS: SeatConfig[] = [
  { seat: 0, faction: 'pirates', isAI: false, displayName: 'Captain Ahab' },
  { seat: 1, faction: 'british', isAI: true, displayName: 'AI 1' },
]

// #250: apps/web/src/catalog.ts and supabase/functions/_shared/catalog.ts (plus
// their buildMatchConfig twins in apps/web/src/multiplayer/matchConfig.ts and
// the same server file) are hand-mirrored across the Vite/Node and Deno
// runtimes with no shared source and no typecheck safety net (the server
// functions aren't part of the pnpm workspace and ContentCatalog's fields are
// optional). They already drifted once — the client's `resourceNodes` field
// was missing server-side — and client-rebuilt replays (#147) would silently
// diverge from the server's real match if they drift again. This golden-diff
// test deep-equals both runtimes' outputs so any future edit to one twin
// without the other fails CI immediately instead of surfacing as a
// hard-to-reproduce production replay mismatch.
describe('client/server catalog parity (#250)', () => {
  it('buildCatalog produces byte-for-byte identical output on both runtimes', () => {
    expect(buildClientCatalog()).toEqual(buildServerCatalog())
  })

  it('buildMatchConfig produces byte-for-byte identical output on both runtimes', () => {
    const overrides = { betrayalTruceRounds: 5, captainCaptivityRounds: 10 }
    const client = buildClientMatchConfig(7, 'small', SEATS, overrides)
    const server = buildServerMatchConfig(7, 'small', SEATS, overrides)
    expect(client).toEqual(server)
  })
})
