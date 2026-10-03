import { describe, it, expect } from 'vitest'
import { CONVENTION_CATALOG, STRUCTURED_FIELDS, getLevelForEntry, getLevelNumberForEntry, getLevelForStructuredField } from '../src/editor/conventionCatalog.js'
import { SKILL_LEVELS, bandOf } from '../src/editor/levels.js'
import { LEVEL_BANDS, levelBand } from '../../js/spec.js'

// The editor's level filter reads the spec (DECISIONS.md, 11 and 12): a row
// with no level there would quietly fall into the lowest band.
describe('the level filter', () => {
  it("is the spec's bands, in order", () => {
    expect(SKILL_LEVELS).toEqual(LEVEL_BANDS.map(b => b.name))
    expect(LEVEL_BANDS.at(-1).max).toBe(10)
    expect([1, 3, 4, 6, 7, 8, 9, 10].map(n => levelBand(n).name))
      .toEqual(['basic', 'basic', 'intermediate', 'intermediate', 'advanced', 'advanced', 'expert', 'expert'])
  })

  it('gives every catalog row a level from the spec', () => {
    const missing = CONVENTION_CATALOG.filter(e => !Number.isInteger(getLevelNumberForEntry(e))).map(e => e.id)
    expect(missing).toEqual([])
    for (const e of CONVENTION_CATALOG) expect(getLevelForEntry(e)).toBe(bandOf(getLevelNumberForEntry(e)))
  })

  it('places the conventions decision 12 moved', () => {
    const band = id => getLevelForEntry(CONVENTION_CATALOG.find(e => e.id === id))
    for (const id of ['dont', 'lebensohl_interference', 'drury', 'jacoby_2nt', 'splinters']) {
      expect([id, band(id)]).toEqual([id, 'intermediate'])
    }
  })

  it('filters only the structured fields marked for it, by their spec level', () => {
    const marked = Object.values(STRUCTURED_FIELDS).flat().filter(f => f.filterByLevel)
    expect(marked.length).toBeGreaterThan(0)
    for (const f of marked) expect([f.label, getLevelForStructuredField(f)]).toEqual([f.label, 'advanced'])
    const unmarked = Object.values(STRUCTURED_FIELDS).flat().filter(f => !f.filterByLevel)
    for (const f of unmarked) expect(getLevelForStructuredField(f)).toBe(null)
  })
})
