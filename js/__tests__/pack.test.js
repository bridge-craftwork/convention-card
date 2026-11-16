import { describe, it, expect } from 'vitest'
import PACK from '../../spec/pack.json' with { type: 'json' }
import { schema2Fields, schema2Alerts, addressMaps } from '../pack.js'
import { FIELDS, CONVENTIONS, field } from '../spec.js'

// The library works in card schema 2's paths, rebuilt from the pack
// (js/pack.js). The field list this repository used to own is gone; until
// it went, these tests held the two together field by field.
describe('the pack, read as card schema 2', () => {
  const got = schema2Fields(PACK)

  it('gives the fields, alert rules, levels and schema 1 migration', () => {
    expect(Object.keys(got).length).toBeGreaterThan(600)
    expect(got['notrump.stayman.play'].kind).toBe('bool')
    const alerts = schema2Alerts(PACK)
    expect(alerts.alert.length).toBeGreaterThan(150)
    for (const a of alerts.alert) for (const f of a.fields) expect([f, f in got]).toEqual([f, true])
    expect(Object.keys(alerts.regulators).sort()).toEqual(['acbl', 'ebu', 'wbf'])
    expect(PACK.levels.band.length).toBeGreaterThan(0)
    expect(PACK.migrations['1-to-2'].to).toBe('2.0')
  })

  it('gives every convention its definition', () => {
    expect(Object.keys(CONVENTIONS).length).toBeGreaterThan(150)
    expect(CONVENTIONS['bidding_conventions/stayman'].name).toBe('Stayman')
  })

  it('maps every address to one path and back', () => {
    const { path, address } = addressMaps(PACK)
    expect(path.size).toBe(address.size)
    expect(path.get('bidding_conventions/stayman')).toBe('notrump.stayman.play')
    expect(path.get('bidding_conventions/stayman:forcing')).toBe('notrump.stayman.forcing')
    expect(path.get('defence_to_1nt.strong')).toBe('competitive.vs_1nt_strong.system')
    for (const p of path.values()) expect([p, p in FIELDS]).toEqual([p, true])
  })

  it('is what the library reads', () => {
    expect(FIELDS).toEqual(got)
    expect(field('notrump.stayman.puppet').path).toBe('notrump.stayman.puppet_1nt')
  })
})
