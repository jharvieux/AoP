/**
 * Hex equivalent of the canonical starting map (#348, Phase 3).
 *
 * Built from `STARTING_MAP` via the square→hex bridge introduced in Phase 2
 * (`squareMapToHexMap`, see hexMap.ts): terrain, start positions, resource
 * nodes, and encounters are preserved verbatim — only the `topology` stamp
 * changes — so the two maps are guaranteed to carry identical counts and
 * positions by construction, not by manual duplication.
 */

import { squareMapToHexMap } from '../hexMap'
import { STARTING_MAP, type StartingMapDefinition } from './startingMap'

export const STARTING_MAP_HEX: StartingMapDefinition = squareMapToHexMap(STARTING_MAP)
