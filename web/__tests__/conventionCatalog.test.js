import { describe, it, expect } from 'vitest'
import BEFORE from './fixtures/convention-catalog.json' with { type: 'json' }
import PACK from '../../spec/pack.json' with { type: 'json' }
import { CONVENTION_CATALOG } from '../src/editor/conventionCatalog.js'

// The editor's rows were written out by hand. Those that are a convention,
// or a place a convention is played, are now drawn from its definition in
// the pack. The fixture is the hand-written list as it was (2026-11-14):
// the rows the editor shows must not change by being drawn another way.
// Changed on purpose since: Reverse Flannery's row for a 2♦ opening gave way
// to rows for its two jumps over one of a minor (Rick Wilson, 2026-11-14).
describe('the convention catalogue', () => {
  it('has the rows it had, in the same order, word for word', () => {
    expect(CONVENTION_CATALOG).toEqual(BEFORE)
  })

  it('takes a convention row\'s caption from the definition', () => {
    const row = CONVENTION_CATALOG.find(r => r.id === 'jacoby_transfers')
    const def = PACK.conventions['bidding_conventions/jacoby_transfers']
    expect(row.desc).toBe(def.brief)
    expect(row.name).toBe(def.label)
  })
})
