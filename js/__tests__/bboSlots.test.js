import { describe, it, expect } from 'vitest'
import { BBO_MAP, BBO_SLOTS } from '../spec.js'

// spec/formats/bbo-slots.toml is every slot on BBO's ACBL card, read from
// BBO's editor by scripts/bbo-field-sheets.mjs. These tests hold the BBO map
// to it.

// Map keys BBO's card does not have, found when the slot list was first made
// (2026-10-31). Fix them in the map and take them off this list; the last
// test fails if one is fixed but still listed.
const NOT_ON_BBO_YET = {
  conventions: ['drury2W', 'minorC5', 'minorD5', 'minorInvForcing', '2CVeryStrong', 'systemOnB'],
  fields: ['dblOther6', 'vs1NT2N1', 'vs1NT2N2'],
}

const mapKeys = {
  conventions: Object.keys(BBO_MAP.conventions),
  fields: [...Object.keys(BBO_MAP.fields), ...(BBO_MAP.joined || []).flatMap(j => j.keys)],
}

describe('BBO slot list', () => {
  it('has every slot of the ACBL card', () => {
    expect(Object.keys(BBO_SLOTS.fields)).toHaveLength(109)
    expect(Object.keys(BBO_SLOTS.conventions)).toHaveLength(168)
    expect(Object.keys(BBO_SLOTS.leads)).toHaveLength(99)
  })

  it('gives every slot a label', () => {
    for (const group of ['fields', 'conventions', 'leads']) {
      for (const [id, slot] of Object.entries(BBO_SLOTS[group])) {
        expect(slot.label, `${group} ${id}`).toBeTruthy()
      }
    }
  })
})

describe('BBO map against the slot list', () => {
  for (const group of ['conventions', 'fields']) {
    it(`names only ${group} slots BBO's card has`, () => {
      const missing = mapKeys[group].filter(k => !BBO_SLOTS[group][k] && !NOT_ON_BBO_YET[group].includes(k))
      expect(missing).toEqual([])
    })
  }

  it('still has each key listed as not on BBO yet', () => {
    for (const group of ['conventions', 'fields']) {
      for (const k of NOT_ON_BBO_YET[group]) expect(mapKeys[group], `${group} ${k} is fixed: take it off NOT_ON_BBO_YET`).toContain(k)
    }
  })
})
