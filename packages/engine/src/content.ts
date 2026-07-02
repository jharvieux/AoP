import type { ResourcePool } from '@aop/shared'

/**
 * The engine never imports @aop/content (it must stay dependency-free per
 * the repo's engine invariants). Instead, callers — the web client, and
 * later the multiplayer edge functions — pass in a ContentCatalog built
 * from @aop/content. The real content defs (BuildingDef, UnitDef, ...)
 * structurally satisfy these shapes, so no engine-side duplication of
 * balance numbers is needed.
 */

export interface BuildingLike {
  produces: Partial<ResourcePool>
  cost: Partial<ResourcePool>
  requires?: string
}

export interface ContentCatalog {
  buildings: Record<string, BuildingLike>
}
