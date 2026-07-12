import { BUILDINGS, FACTIONS, FACTION_BUILDING_NAMES } from '@aop/content'
import { EMPTY_RESOURCES, type FactionId } from '@aop/shared'
import { describe, expect, it } from 'vitest'
import { buildUnavailableReason, buildingFacts } from './cityBuildingInfo'

const RICH = { gold: 99999, timber: 9999, iron: 9999, rum: 9999 }
const RECRUITMENT_BUILDINGS = ['barracks', 'garrisonHall', 'fortressArmory', 'grandArsenal']

describe('building content (#430)', () => {
  it('every building carries a description for its tooltip', () => {
    for (const def of Object.values(BUILDINGS)) {
      expect(def.description.length, def.id).toBeGreaterThan(0)
    }
  })

  it('all four recruitment buildings have a flavor name in every faction', () => {
    for (const faction of Object.keys(FACTIONS) as FactionId[]) {
      for (const buildingId of RECRUITMENT_BUILDINGS) {
        const flavor = FACTION_BUILDING_NAMES[faction]?.[buildingId]
        expect(flavor, `${faction}/${buildingId}`).toBeTruthy()
        expect(flavor).not.toBe(BUILDINGS[buildingId]!.name)
      }
    }
  })
})

describe('buildUnavailableReason (#430)', () => {
  const city = { buildings: ['townhall', 'barracks'], builtThisRound: false }

  it('is null for a buildable building', () => {
    expect(buildUnavailableReason(BUILDINGS.sawmill!, 'pirates', city, RICH)).toBeNull()
  })

  it('flags an already-built building', () => {
    expect(buildUnavailableReason(BUILDINGS.barracks!, 'pirates', city, RICH)).toBe('Already built')
  })

  it("names the missing prerequisite in the faction's voice", () => {
    // garrisonHall requires barracks — the pirate flavor name is Cutthroat Den.
    const reason = buildUnavailableReason(
      BUILDINGS.garrisonHall!,
      'pirates',
      { buildings: ['townhall'], builtThisRound: false },
      RICH,
    )
    expect(reason).toBe('Requires Cutthroat Den')
  })

  it('flags the one-build-per-round rule', () => {
    expect(
      buildUnavailableReason(
        BUILDINGS.sawmill!,
        'pirates',
        { ...city, builtThisRound: true },
        RICH,
      ),
    ).toBe('Already built this round')
  })

  it('flags an unaffordable cost', () => {
    expect(buildUnavailableReason(BUILDINGS.sawmill!, 'pirates', city, EMPTY_RESOURCES)).toBe(
      'Not enough resources',
    )
  })
})

describe('buildingFacts (#430)', () => {
  it("recruitment buildings name the faction's actual units for their tier", () => {
    for (const faction of Object.keys(FACTIONS) as FactionId[]) {
      const facts = buildingFacts(BUILDINGS.garrisonHall!, faction)
      const recruitFact = facts.find((f) => f.startsWith('Recruits:'))
      expect(recruitFact, faction).toBeDefined()
      for (const unit of FACTIONS[faction].units.filter((u) => u.tier === 2)) {
        expect(recruitFact).toContain(unit.name)
      }
    }
  })

  it('derives production figures from the data field, not prose', () => {
    expect(buildingFacts(BUILDINGS.townhall!, 'pirates')).toContain(
      `Produces ${BUILDINGS.townhall!.produces.gold} gold per round`,
    )
  })

  it('derives the defense bonus from the data field', () => {
    expect(buildingFacts(BUILDINGS.palisade!, 'pirates')).toContain(
      `+${BUILDINGS.palisade!.defenseBonus} city defense during assaults`,
    )
  })

  it('applies the theme resolver to unit names', () => {
    const facts = buildingFacts(BUILDINGS.barracks!, 'pirates', () => 'Renamed')
    expect(facts.find((f) => f.startsWith('Recruits:'))).toContain('Renamed')
  })
})
