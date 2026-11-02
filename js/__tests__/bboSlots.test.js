import { describe, it, expect } from 'vitest'
import { BBO_MAP, BBO_SLOTS } from '../spec.js'
import { leadPath, leadKey, importBboJson, exportBboCard } from '../bbo.js'
import { field } from '../spec.js'

// spec/formats/bbo-slots.toml is every slot on BBO's ACBL card, read from
// BBO's editor by scripts/bbo-field-sheets.mjs. These tests hold the BBO map
// to it.

// Slots js/bbo.js reads by rule rather than from the map.
const BY_RULE = ['names', '2COther1', '2COther2', '2COther3', '2COther4', '2COther5', '2COther6']

const mapKeys = {
  conventions: Object.keys(BBO_MAP.conventions),
  fields: [...Object.keys(BBO_MAP.fields), ...(BBO_MAP.joined || []).flatMap(j => j.keys), ...BY_RULE],
}
const leftOut = Object.keys(BBO_MAP.left_out || {})

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
      expect(mapKeys[group].filter(k => !BBO_SLOTS[group][k])).toEqual([])
    })

    it(`maps every ${group} slot, or says why not`, () => {
      const missing = Object.keys(BBO_SLOTS[group]).filter(k => !mapKeys[group].includes(k) && !leftOut.includes(k))
      expect(missing).toEqual([])
    })
  }

  it('leaves out only unmapped slots of BBO\'s card', () => {
    for (const k of leftOut) {
      expect(BBO_SLOTS.conventions[k] || BBO_SLOTS.fields[k], k).toBeTruthy()
      expect([...mapKeys.conventions, ...mapKeys.fields], k).not.toContain(k)
    }
  })

  it('reads every lead circle into a spec field and writes it back under its own key', () => {
    for (const key of Object.keys(BBO_SLOTS.leads)) {
      const lead = leadPath(key)
      expect(lead, key).toBeTruthy()
      expect(field(lead[0]), `${key} -> ${lead[0]}`).toBeTruthy()
      expect(leadKey(...lead)).toBe(key)
    }
  })
})

// A card made in the editor has no BBO card behind it (`_bbo_raw`): what it
// sends to BBO comes from the map alone.
function fresh(slots) {
  const { card_data } = importBboJson({ fields: {}, conventions: {}, leads: {}, ...slots })
  delete card_data._bbo_raw
  return exportBboCard(card_data)
}

describe('a card made in the editor, sent to BBO', () => {
  it('ticks each mapped box', () => {
    const lost = mapKeys.conventions.filter(k => fresh({ conventions: { [k]: 'y' } }).conventions[k] !== 'y')
    expect(lost).toEqual([])
  })

  it('fills each mapped text slot', () => {
    // A joined field fills its slots from the first, so one line comes back in
    // its first slot; the 2♣ lines are their own rule.
    const firsts = new Set((BBO_MAP.joined || []).filter(j => j.export !== false).map(j => j.keys[0]))
    const later = new Set((BBO_MAP.joined || []).flatMap(j => j.keys).filter(k => !firsts.has(k)))
    const keys = mapKeys.fields.filter(k => !later.has(k) && !/^2COther[2-6]$/.test(k))
    const lost = keys.filter(k => {
      const value = /Min|Max/.test(k) ? '12' : 'test !S'
      return fresh({ fields: { [k]: value } }).fields[k] !== value
    })
    expect(lost).toEqual([])
  })

  it('circles each lead', () => {
    const lost = Object.keys(BBO_SLOTS.leads).filter(k => fresh({ leads: { [k]: 'y' } }).leads[k] !== 'y')
    expect(lost).toEqual([])
  })
})
