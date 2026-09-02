// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { GAME_SETUP } from '@aop/content'
import { createGame, type GameConfig, type GameState } from '@aop/engine'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../theme/ThemeContext', () => ({
  useTheme: () => ({ factionName: (_id: string, fallback: string) => fallback }),
}))
vi.mock('../audio/audioManager', () => ({ audioManager: { play: vi.fn() } }))
vi.mock('../audio/feedback', () => ({ notifyFeedback: vi.fn() }))
vi.mock('../AdSlot', () => ({ AdSlot: () => null }))

import { classifyGameOver, GameOverScreen } from './GameOverScreen'

function game(): GameState {
  const config: GameConfig = {
    seed: 1,
    mapSize: 'small',
    setup: GAME_SETUP,
    players: [
      { id: 'player-0', name: 'Anne', faction: 'pirates', isAI: false },
      { id: 'player-1', name: 'Morgan', faction: 'british', isAI: true },
    ],
  }
  return createGame(config)
}

/**
 * #426 added a second way a match ends: with no winner declared because the
 * human seat resigned/died while rival AI crews sail on. `classifyGameOver` is
 * the pure predicate the screen uses to pick its copy, so the four outcomes are
 * testable without rendering (matching the #385 `findViewerCaptainAtCity`
 * pattern). The regression this guards: that no-winner-with-survivors case used
 * to fall through both the winner and draw blocks, leaving a bare "Defeat"
 * header with no explanatory line.
 */
describe('classifyGameOver', () => {
  it('is a victory when the human seat (player-0) wins', () => {
    expect(classifyGameOver('player-0', [{ eliminated: false }, { eliminated: true }])).toBe(
      'victory',
    )
  })

  it('is a defeat when a rival seat wins outright', () => {
    expect(classifyGameOver('seat-1', [{ eliminated: true }, { eliminated: false }])).toBe('defeat')
  })

  it('is a draw when no winner and every crew was eliminated', () => {
    expect(classifyGameOver(null, [{ eliminated: true }, { eliminated: true }])).toBe('draw')
  })

  it('is defeat-abandoned when no winner but rival crews survive (#426)', () => {
    expect(classifyGameOver(null, [{ eliminated: true }, { eliminated: false }])).toBe(
      'defeat-abandoned',
    )
  })

  // #508: a round-limit ending with no winner leaves every crew alive — without
  // the flag it would misread as defeat-abandoned ("rival crews sail on").
  it('is a draw when the round limit expired with no winner and crews still alive (#508)', () => {
    expect(classifyGameOver(null, [{ eliminated: false }, { eliminated: false }], true)).toBe(
      'draw',
    )
  })

  it('stays victory/defeat when the round limit produced a winner (#508)', () => {
    const alive = [{ eliminated: false }, { eliminated: false }]
    expect(classifyGameOver('player-0', alive, true)).toBe('victory')
    expect(classifyGameOver('player-1', alive, true)).toBe('defeat')
  })
})

describe('GameOverScreen', () => {
  it('renders a winner, summary stats, and invokes each action from the rendered controls', () => {
    const onRematch = vi.fn()
    const onWatchReplay = vi.fn()
    const onMenuClick = vi.fn()
    const completed = { ...game(), winnerId: 'player-0', round: 12, actionCount: 37 }
    render(
      createElement(GameOverScreen, { game: completed, onRematch, onWatchReplay, onMenuClick }),
    )

    expect(screen.getByText('Victory!').classList.contains('victory')).toBe(true)
    expect(screen.getByRole('heading', { name: 'Anne' })).not.toBeNull()
    expect(screen.getByText('Pirates prevails')).not.toBeNull()
    expect(screen.getByText('12')).not.toBeNull()
    expect(screen.getByText('37')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Watch Replay' }))
    fireEvent.click(screen.getByRole('button', { name: 'Main Menu' }))
    expect(onRematch).toHaveBeenCalledOnce()
    expect(onWatchReplay).toHaveBeenCalledOnce()
    expect(onMenuClick).toHaveBeenCalledOnce()
  })

  it('renders the distinct no-winner defeat explanation', () => {
    const abandoned = {
      ...game(),
      winnerId: null,
      players: game().players.map((player, index) => ({ ...player, eliminated: index === 0 })),
    }
    render(
      createElement(GameOverScreen, {
        game: abandoned,
        onRematch: vi.fn(),
        onWatchReplay: vi.fn(),
        onMenuClick: vi.fn(),
      }),
    )
    expect(screen.getByText('Defeat').classList.contains('defeat')).toBe(true)
    expect(screen.getByText(/rival crews sail on without you/i)).not.toBeNull()
  })
})
