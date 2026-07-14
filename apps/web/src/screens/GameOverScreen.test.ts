import { describe, expect, it } from 'vitest'
import { classifyGameOver } from './GameOverScreen'

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
