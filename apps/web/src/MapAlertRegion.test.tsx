// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MapAlertRegion, type MapAlertItem } from './MapAlertRegion'

afterEach(cleanup)

function order(id: string, name: string): MapAlertItem {
  return {
    id,
    name,
    message: `${name} halted: new contact sighted`,
    onResume: vi.fn(),
    onCancel: vi.fn(),
  }
}

describe('MapAlertRegion', () => {
  it('renders nothing when no order is interrupted', () => {
    const { container } = render(<MapAlertRegion orders={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('preserves the direct single-order message and actions', () => {
    const anne = order('captain:anne', 'Anne')
    render(<MapAlertRegion orders={[anne]} />)

    expect(screen.getByRole('region', { name: '1 halted order' })).not.toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Choose halted order' })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe(anne.message)

    fireEvent.click(screen.getByRole('button', { name: 'Resume Anne' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Anne' }))
    expect(anne.onResume).toHaveBeenCalledOnce()
    expect(anne.onCancel).toHaveBeenCalledOnce()
  })

  it('aggregates simultaneous orders into one bounded card with every action reachable', () => {
    const anne = order('captain:anne', 'Anne')
    const jack = order('captain:jack', 'Calico Jack')
    render(<MapAlertRegion orders={[anne, jack]} />)

    const region = screen.getByRole('region', { name: '2 halted orders' })
    expect(region.querySelectorAll('.sail-interrupt-banner')).toHaveLength(1)

    const picker = screen.getByRole('combobox', { name: 'Choose halted order' })
    expect(picker.querySelectorAll('option')).toHaveLength(2)
    expect(screen.getByRole('status').textContent).toBe(anne.message)

    fireEvent.change(picker, { target: { value: jack.id } })
    expect(screen.getByRole('status').textContent).toBe(jack.message)
    fireEvent.click(screen.getByRole('button', { name: 'Resume Calico Jack' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Calico Jack' }))

    expect(anne.onResume).not.toHaveBeenCalled()
    expect(anne.onCancel).not.toHaveBeenCalled()
    expect(jack.onResume).toHaveBeenCalledOnce()
    expect(jack.onCancel).toHaveBeenCalledOnce()
  })

  it('falls back to the first live order when the selected order is removed', () => {
    const anne = order('captain:anne', 'Anne')
    const jack = order('captain:jack', 'Calico Jack')
    const { rerender } = render(<MapAlertRegion orders={[anne, jack]} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: jack.id } })
    rerender(<MapAlertRegion orders={[anne]} />)

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe(anne.message)
    fireEvent.click(screen.getByRole('button', { name: 'Resume Anne' }))
    expect(anne.onResume).toHaveBeenCalledOnce()
  })
})
