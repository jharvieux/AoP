import { describe, expect, it } from 'vitest'
import { deepEqual } from './deepEqual'

describe('deepEqual (#554)', () => {
  it('treats identical primitives as equal', () => {
    expect(deepEqual(1, 1)).toBe(true)
    expect(deepEqual('a', 'a')).toBe(true)
    expect(deepEqual(true, true)).toBe(true)
    expect(deepEqual(null, null)).toBe(true)
    expect(deepEqual(undefined, undefined)).toBe(true)
  })

  it('treats different primitives as unequal', () => {
    expect(deepEqual(1, 2)).toBe(false)
    expect(deepEqual('a', 'b')).toBe(false)
    expect(deepEqual(null, undefined)).toBe(false)
    expect(deepEqual(0, false)).toBe(false)
  })

  it('handles NaN correctly, unlike JSON.stringify comparison', () => {
    expect(deepEqual(NaN, NaN)).toBe(true)
    // The bug this replaces: JSON.stringify(NaN) === 'null' for both sides,
    // so a naive stringify comparison would call these two unequal values
    // equal too — but a real object containing NaN vs. one containing a
    // genuine null must NOT compare equal.
    expect(deepEqual({ v: NaN }, { v: null })).toBe(false)
  })

  it('is order-independent for object keys, unlike JSON.stringify comparison', () => {
    const a = { x: 1, y: 2, z: 3 }
    const b = { z: 3, x: 1, y: 2 }
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
    expect(deepEqual(a, b)).toBe(true)
  })

  it('compares nested objects and arrays by value', () => {
    const a = { command: 'attack', targets: [{ id: 1 }, { id: 2 }] }
    const b = { command: 'attack', targets: [{ id: 1 }, { id: 2 }] }
    expect(deepEqual(a, b)).toBe(true)
  })

  it('detects a differing nested value', () => {
    const a = { command: 'attack', targets: [{ id: 1 }] }
    const b = { command: 'attack', targets: [{ id: 2 }] }
    expect(deepEqual(a, b)).toBe(false)
  })

  it('detects differing array length and differing key count', () => {
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('does not treat an array and an array-like object as equal', () => {
    expect(deepEqual([1, 2], { 0: 1, 1: 2, length: 2 })).toBe(false)
  })
})
