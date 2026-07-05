import { describe, expect, it } from 'vitest'
import { shouldDismissSheet } from './BottomSheet'

describe('shouldDismissSheet', () => {
  it('does not dismiss on a tiny accidental nudge', () => {
    expect(shouldDismissSheet(4, 0.05)).toBe(false)
  })

  it('does not dismiss on a slow drag that stops short of the distance threshold', () => {
    expect(shouldDismissSheet(60, 0.1)).toBe(false)
  })

  it('dismisses once dragged past the distance threshold, even slowly', () => {
    expect(shouldDismissSheet(121, 0.01)).toBe(true)
  })

  it('dismisses on a fast short flick that never reaches the distance threshold', () => {
    expect(shouldDismissSheet(20, 0.6)).toBe(true)
  })

  it('never dismisses a drag back upward (negative distance)', () => {
    expect(shouldDismissSheet(-50, 5)).toBe(false)
  })
})
