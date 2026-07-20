import { buildContentCatalog } from '@aop/content'
import type { ContentCatalog } from '@aop/engine'

/**
 * Assemble the engine's ContentCatalog from @aop/content. The engine never
 * imports content directly (it must stay dependency-free); the client builds
 * this snapshot and freezes it into the match config, exactly as the multiplayer
 * edge functions will later.
 *
 * The assembly itself now lives in `@aop/content`'s `buildContentCatalog`
 * (#552) — this is a thin, statically-typed wrapper so callers can keep
 * importing `buildCatalog` from here. `supabase/functions/_shared/catalog.ts`
 * and `packages/tools/src/land-battery.ts` wrap the same function; see
 * `apps/web/src/multiplayer/catalogParity.test.ts`, which fails the build if
 * the client and server ever diverge again (#250; they silently drifted on
 * `resourceNodes` once already).
 */
export function buildCatalog(): ContentCatalog {
  return buildContentCatalog()
}
