// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet, shouldDismissSheet } from './BottomSheet'

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

describe('BottomSheet', () => {
  it('renders its content, closes from its button/backdrop, and keeps sheet clicks inside', () => {
    const onClose = vi.fn()
    const { container } = render(
      createElement(BottomSheet, {
        title: 'Harbor',
        onClose,
        children: createElement('p', undefined, 'Dockyard options'),
      }),
    )

    const dialog = screen.getByRole('dialog', { name: 'Harbor' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Harbor' })).not.toBeNull()
    expect(screen.getByText('Dockyard options')).not.toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(container.querySelector('.sheet')!)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
    fireEvent.click(container.querySelector('.sheet-backdrop')!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('dismisses with Escape without depending on a platform glyph', () => {
    const onClose = vi.fn()
    const { container } = render(
      createElement(BottomSheet, {
        title: 'Shipyard',
        onClose,
        children: createElement('p', undefined, 'Refit options'),
      }),
    )

    const dialog = screen.getByRole('dialog', { name: 'Shipyard' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(container.querySelector('.sheet__close svg')).not.toBeNull()
  })
})
