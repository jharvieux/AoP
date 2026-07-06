import { describe, expect, it } from 'vitest'
import { isTestPlayAfterLoadSlot, isTestPlayAfterRematch, shouldAutosave } from './gameSession'

describe('isTestPlayAfterLoadSlot', () => {
  it('always resumes as a real game, even when loaded during test play', () => {
    expect(isTestPlayAfterLoadSlot()).toBe(false)
  })
})

describe('isTestPlayAfterRematch', () => {
  it('preserves test-play across a rematch', () => {
    expect(isTestPlayAfterRematch(true)).toBe(true)
  })

  it('preserves a real game across a rematch', () => {
    expect(isTestPlayAfterRematch(false)).toBe(false)
  })
})

describe('shouldAutosave', () => {
  it('autosaves a real game', () => {
    expect(shouldAutosave(false)).toBe(true)
  })

  it('never autosaves a test-play match', () => {
    expect(shouldAutosave(true)).toBe(false)
  })

  it('#236: re-enables autosave once a slot loaded during test play resets isTestPlay', () => {
    const wasTestPlay = true
    const nextIsTestPlay = isTestPlayAfterLoadSlot()
    expect(nextIsTestPlay).toBe(false)
    expect(shouldAutosave(nextIsTestPlay)).toBe(true)
    expect(wasTestPlay).toBe(true) // sanity: the scenario actually started in test play
  })
})
