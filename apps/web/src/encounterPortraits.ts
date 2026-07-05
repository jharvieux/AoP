import type { EncounterKind } from '@aop/engine'

/**
 * Generated NPC portrait art (#89 item 3), served from `apps/web/public/art/encounters`.
 * The encounter sheet in `GameScreen` renders these above its choice buttons; same
 * "optional, falls back to text-only title" convention as `UI_ICON` (#115) — nothing
 * breaks if a URL 404s, the sheet just shows no portrait.
 */
export const ENCOUNTER_PORTRAIT: Record<EncounterKind, string> = {
  merchant: '/art/encounters/merchant_portrait.png',
  natives: '/art/encounters/natives_portrait.png',
  settlers: '/art/encounters/settlers_portrait.png',
}
