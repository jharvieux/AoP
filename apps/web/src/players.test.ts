import { FACTIONS } from '@aop/content'
import { describe, expect, it } from 'vitest'
import { createDefaultPlayer, starterTroops } from './players'

// #235: GameScreen anchors the viewer/fog to the first human seat only
// (`game.players.find((p) => !p.isAI)`), so a second human seat is
// unplayable. NewGameSetup no longer offers a way to flip seats 1+ to
// human — this locks down the one remaining source of truth for seat
// defaults so that invariant can't regress silently.
describe('createDefaultPlayer', () => {
  it('makes seat 0 human', () => {
    expect(createDefaultPlayer(0).isAI).toBe(false)
  })

  it('makes every seat other than 0 AI', () => {
    for (const index of [1, 2, 3, 4, 5, 6]) {
      expect(createDefaultPlayer(index).isAI).toBe(true)
    }
  })

  it('gives AI seats a profile and leaves the human seat without one', () => {
    expect(createDefaultPlayer(0).aiProfile).toBeUndefined()
    expect(createDefaultPlayer(1).aiProfile).toBeDefined()
  })
})

// #556: starterTroops is used as fixture setup by several other suites
// (contentHexDeterminism, replayCursor) but none of them assert on its
// output — a stub returning `[]` would pass all of them silently.
describe('starterTroops', () => {
  it("gives a 6-strong stack of the faction's own tier-1 unit", () => {
    const tier1 = FACTIONS.pirates.units[0]!
    expect(starterTroops('pirates')).toEqual([{ unitId: tier1.id, count: 6 }])
  })

  it('draws from a different unit per faction', () => {
    const pirates = starterTroops('pirates')
    const british = starterTroops('british')
    expect(pirates[0]!.unitId).not.toBe(british[0]!.unitId)
    expect(british[0]!.unitId).toBe(FACTIONS.british.units[0]!.id)
  })
})
