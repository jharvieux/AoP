import { describe, expect, it } from 'vitest'
import { captainAshoreState } from './captainAshore'

describe('captainAshoreState', () => {
  it('returns null for a captain in command of their own ship', () => {
    expect(captainAshoreState({ id: 'cap-1' }, [])).toBeNull()
  })

  it('returns anchored when a landing party lists the captain as its leader', () => {
    expect(captainAshoreState({ id: 'cap-1' }, [{ captainId: 'cap-1' }])).toBe('anchored')
  })

  it('ignores parties led by other captains', () => {
    expect(captainAshoreState({ id: 'cap-1' }, [{ captainId: 'cap-2' }])).toBeNull()
  })

  it('returns shipLost when the captain has no hull left, even if still (implausibly) listed as a party leader', () => {
    expect(captainAshoreState({ id: 'cap-1', shipLost: true }, [{ captainId: 'cap-1' }])).toBe(
      'shipLost',
    )
  })

  it('shipLost takes priority over anchored', () => {
    expect(captainAshoreState({ id: 'cap-1', shipLost: true }, [])).toBe('shipLost')
  })
})
