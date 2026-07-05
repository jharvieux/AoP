import type { EncounterKind } from '@aop/engine'
import { decodeMapCodePayload, encodeMapCodePayload, type MapCodePayload } from '@aop/shared'
import { newDraftId } from './draft'
import type { EditorDraft, ResourceMarkerKind } from './types'

/**
 * Tier-1 map sharing (#63): a compact, versioned, offline shareable "map code"
 * for an `EditorDraft` — no backend required. The wire codec itself (version
 * detection, whitespace-tolerant decoding, the RLE tile format) lives in
 * `@aop/shared` (`mapCodes.ts`) so the Tier-2 publish Edge Function can decode
 * and re-validate the exact same format server-side; this module only maps
 * `EditorDraft` to and from that payload. Import re-validates via the engine's
 * `validateMapDefinition` before the caller accepts it (see MapEditorScreen),
 * so a hand-edited or corrupted code can't produce an unplayable match.
 */

/** Shareable map file (#63/#197): the file is just the map code as plain
 * text, so one decoder serves both paths and a player can open the file and
 * paste its contents as a code (or vice versa). Client-only naming
 * convention — not part of the wire format, so it stays here rather than in
 * `@aop/shared`. */
export const MAP_FILE_EXTENSION = '.aopmap'

export function encodeMapCode(draft: EditorDraft): string {
  const payload: MapCodePayload = {
    name: draft.name,
    width: draft.width,
    height: draft.height,
    tiles: draft.tiles,
    startPositions: draft.startPositions,
    encounters: draft.encounters,
    resourceMarkers: draft.resourceMarkers,
  }
  return encodeMapCodePayload(payload)
}

/** Mint an `EditorDraft` (fresh local identity) from a shared code. Entity
 * kinds ride the wire as plain strings; the casts below are safe to make only
 * because every import path runs the engine's `validateMapDefinition` (which
 * rejects unrecognized kinds) before the draft is accepted. */
export function decodeMapCode(code: string): EditorDraft {
  const payload = decodeMapCodePayload(code)
  return {
    id: newDraftId(),
    name: payload.name,
    width: payload.width,
    height: payload.height,
    tiles: payload.tiles,
    startPositions: payload.startPositions,
    encounters: payload.encounters.map((e) => ({
      kind: e.kind as EncounterKind,
      position: e.position,
    })),
    resourceMarkers: payload.resourceMarkers.map((r) => ({
      kind: r.kind as ResourceMarkerKind,
      position: r.position,
    })),
  }
}
