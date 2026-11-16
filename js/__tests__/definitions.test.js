// The pack lists skills and judgement entries apart from its conventions.
// The library reads an ID from either list, and a snapshot from before the
// split (everything under `conventions`) the same way.
import { describe, it, expect } from 'vitest'
import PACK_DOC from '../../spec/pack.json' with { type: 'json' }
import { definitions, schema2Fields } from '../pack.js'
import { CONVENTIONS } from '../spec.js'
import { findConventions } from '../recogniseConventions.js'

describe('definitions', () => {
  it('holds conventions, natural methods, skills and judgement by ID', () => {
    for (const id of ['bidding_conventions/stayman', 'competitive_bidding/takeout_doubles', 'defense/opening_leads', 'basic_bidding/hand_evaluation']) {
      expect(CONVENTIONS[id]?.name, id).toBeTruthy()
    }
    expect(PACK_DOC.skills['defense/opening_leads']).toBeTruthy()
    expect(PACK_DOC.conventions['defense/opening_leads']).toBeUndefined()
  })

  it('reads a snapshot from before the split as it reads this one', () => {
    const { skills, ...rest } = PACK_DOC
    const sorted = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    const before = { ...rest, conventions: sorted({ ...PACK_DOC.conventions, ...skills }) }
    expect(Object.keys(definitions(PACK_DOC))).toEqual(Object.keys(definitions(before)))
    expect(definitions(PACK_DOC)).toEqual(definitions(before))
    expect(schema2Fields(PACK_DOC)).toEqual(schema2Fields(before))
  })

  it('does not take a judgement entry for something a note names', () => {
    expect(CONVENTIONS['competitive_bidding/penalty_doubles']?.kind).toBe('judgement')
    expect(findConventions('Penalty doubles through 2S')).toEqual([])
    expect(findConventions('Takeout doubles through 4H').map(c => c.id)).toContain('competitive_bidding/takeout_doubles')
  })
})
