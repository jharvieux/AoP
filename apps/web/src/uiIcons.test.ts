// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { UI_ICON_SHAPES, UiIcon, type UiIconName } from './uiIcons'

describe('UiIcon', () => {
  it('renders every authored mark in one decorative currentColor vector language', () => {
    for (const name of Object.keys(UI_ICON_SHAPES) as UiIconName[]) {
      const { container, unmount } = render(createElement(UiIcon, { name }))
      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('viewBox'), name).toBe('0 0 20 20')
      expect(svg.getAttribute('aria-hidden'), name).toBe('true')
      expect(svg.getAttribute('focusable'), name).toBe('false')
      expect(svg.textContent, name).toBe('')
      expect(svg.innerHTML, name).toContain('currentColor')
      unmount()
    }
  })

  it('leaves accessible names and state semantics on the containing buttons', () => {
    render(
      createElement(
        'div',
        undefined,
        createElement(
          'button',
          { 'aria-label': 'Zoom in', disabled: true },
          createElement(UiIcon, { name: 'zoomIn' }),
        ),
        createElement(
          'button',
          { 'aria-label': 'Harbor selected', 'aria-pressed': true },
          createElement(UiIcon, { name: 'selected' }),
        ),
        createElement(
          'button',
          { 'aria-expanded': true, 'aria-label': 'More actions' },
          createElement(UiIcon, { name: 'more' }),
        ),
      ),
    )

    expect((screen.getByRole('button', { name: 'Zoom in' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(
      screen.getByRole('button', { name: 'Harbor selected' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: 'More actions' }).getAttribute('aria-expanded')).toBe(
      'true',
    )
  })
})
