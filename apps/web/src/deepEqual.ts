/**
 * Structural equality for plain JSON-shaped values (objects, arrays,
 * primitives) — a drop-in replacement for the `JSON.stringify(a) ===
 * JSON.stringify(b)` comparisons BoardingCommandSheet.tsx and cityModals.tsx
 * used to spot an unchanged plan/order-set (#554). Serialize-then-compare
 * silently breaks when two structurally-identical values have their keys
 * inserted in a different order — this compares values instead of their
 * string form, so key order never matters.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  const aRecord = a as Record<string, unknown>
  const bRecord = b as Record<string, unknown>
  const aKeys = Object.keys(aRecord)
  const bKeys = Object.keys(bRecord)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(bRecord, key) && deepEqual(aRecord[key], bRecord[key]),
  )
}
