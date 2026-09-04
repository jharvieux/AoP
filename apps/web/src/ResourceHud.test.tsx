// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameplayHud, ResourceHud } from './ResourceHud'

const resources = { gold: 1250, timber: 48, iron: 17, rum: 9 }

describe('ResourceHud', () => {
  it('keeps the canonical resource order and exposes each value by name', () => {
    render(<ResourceHud resources={resources} />)
    const group = screen.getByRole('group', { name: 'Resources' })
    expect(group.textContent).toBe('Gold1250Timber48Iron17Rum9')
    for (const label of ['Gold: 1250', 'Timber: 48', 'Iron: 17', 'Rum: 9']) {
      expect(screen.getByLabelText(label)).not.toBeNull()
    }
  })

  it('provides the one shared local/multiplayer header contract', () => {
    render(<GameplayHud status="Round 4 — Your move" resources={resources} />)
    const header = screen.getByRole('banner')
    expect(header.classList.contains('hud')).toBe(true)
    expect(header.classList.contains('gameplay-hud')).toBe(true)
    expect(header.getAttribute('data-gameplay-chrome')).toBe('hud')
    expect(screen.getByText('Round 4 — Your move')).not.toBeNull()
  })
})
