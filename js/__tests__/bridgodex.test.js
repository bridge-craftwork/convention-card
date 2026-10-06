import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { importBridgeodexJson, exportBridgodexJson } from '../bridgodex.js'

// Minimal bridgeodex shape: a `settings` object with per-section blocks.
function bdex(settings = {}) {
  return { settings, notes: '' }
}

describe('importBridgeodexJson — key-name regression guards', () => {
  it('reads the strong-NT flag under the real key (1nt_open_strong)', () => {
    const { card_data } = importBridgeodexJson(bdex({ overview: { '1nt_open_strong': 'on' } }))
    expect(card_data.general.nt_open_style).toBe('strong')
  })

  it('still accepts the abbreviated 1nt_open_str alias', () => {
    const { card_data } = importBridgeodexJson(bdex({ overview: { '1nt_open_str': 'on' } }))
    expect(card_data.general.nt_open_style).toBe('strong')
  })

  it('reads the 2C maximum and preserves a "+" qualifier as a string', () => {
    const { card_data } = importBridgeodexJson(bdex({ two_level: { '2c_min': '22', '2c_max': '24+' } }))
    expect(card_data.two_level.two_clubs.min_hcp_str).toBe('22')
    expect(card_data.two_level.two_clubs.max_hcp).toBe('24+')
  })

  it('reads the 1C free-text note under 1c_more', () => {
    const { card_data } = importBridgeodexJson(bdex({ minors: { '1c_more': 'Spiral' } }))
    expect(card_data.minor_openings.notes).toBe('Spiral')
  })

  it('reads vs-double new-suit-forcing under the _2_lvl key', () => {
    const { card_data } = importBridgeodexJson(bdex({ vs_to_double: { 'new_suit_forcing_2_lvl': 'on' } }))
    expect(card_data.vs_to_double.new_suit_forcing_2lvl).toBe(true)
  })

  it('imports interior-sequence opening leads (honor_interior_seq_*)', () => {
    const { card_data } = importBridgeodexJson(bdex({
      leads_vs_nt: { 'honor_interior_seq_AJTx': 4, 'honor_interior_seq_KT9x': 4 }
    }))
    expect(card_data.leads.vs_nt.honors.lead_choice_ajtx).toBe(4)
    expect(card_data.leads.vs_nt.honors.lead_choice_kt9x).toBe(4)
  })

  it('imports a natural 2NT response over 1NT (2nt_nat)', () => {
    const { card_data } = importBridgeodexJson(bdex({ '1_no_trump': { '2nt_nat': 'on' } }))
    expect(card_data.notrump.two_nt_natural).toBe(true)
  })

  it('imports natural 2NT-over-takeout-double for both suit pairs (_nat)', () => {
    const { card_data } = importBridgeodexJson(bdex({
      vs_to_double: { '2nt_over_minors_nat': 'on', '2nt_over_majors_nat': 'on' }
    }))
    expect(card_data.vs_to_double.two_nt_raise_minors.play).toBe(true)
    expect(card_data.vs_to_double.two_nt_raise_majors.play).toBe(true)
  })

  it('maps Jacoby transfers from per-suit flags', () => {
    const { card_data } = importBridgeodexJson(bdex({
      '1_no_trump': { '2d_tfr': 'on', '2h_tfr': 'on', '2s_tfr': 'on' }
    }))
    expect(card_data.notrump.transfers.jacoby).toBe(true)
    expect(card_data.notrump.transfers.spades_relay).toBe(true)
  })

  it('captures the 1NT range including the maximum', () => {
    const { card_data } = importBridgeodexJson(bdex({
      '1_no_trump': { 'a_range_min': '15', 'a_range_max': '17' }
    }))
    expect(card_data.notrump.one_nt.range_min).toBe(15)
    expect(card_data.notrump.one_nt.range_max).toBe(17)
  })

  it('keeps an open-ended "14+" as a number plus a _plus flag', () => {
    // The `+` used to be dropped, so "14+ to 17" imported as a flat
    // "14 to 17": a different agreement.
    const { card_data } = importBridgeodexJson(bdex({
      '1_no_trump': { 'a_range_min': '14+', 'a_range_max': '17' },
      'nt_overcalls': { 'direct_1nt_min': '15+', 'balance_1nt_min': '11' },
    }))
    expect(card_data.notrump.one_nt.range_min).toBe(14)
    expect(card_data.notrump.one_nt.range_min_plus).toBe(true)
    expect(card_data.notrump.one_nt.range_max_plus).toBeUndefined()
    expect(card_data.nt_overcalls.direct.range_min).toBe(15)
    expect(card_data.nt_overcalls.direct.range_min_plus).toBe(true)
    expect(card_data.nt_overcalls.balance.range_min_plus).toBeUndefined()
  })

  it('keeps a "17-" (a poor 17) as a number plus a _minus flag', () => {
    const { card_data } = importBridgeodexJson(bdex({
      '1_no_trump': { 'a_range_min': '14+', 'a_range_max': '17-' },
    }))
    expect(card_data.notrump.one_nt.range_max).toBe(17)
    expect(card_data.notrump.one_nt.range_max_minus).toBe(true)
    expect(card_data.notrump.one_nt.range_max_plus).toBeUndefined()
    expect(card_data.notrump.one_nt.range_min_plus).toBe(true)
  })
})

describe('2/1 from the general approach', async () => {
  const { namesTwoOverOne } = await import('../bridgodex.js')
  it('reads 2/1 written in words', () => {
    for (const t of ['2/1', '2/1 GF', '2 over 1', 'Two over one', 'two-over-one game forcing']) expect([t, namesTwoOverOne(t)]).toEqual([t, true])
    for (const t of ['SAYC', 'Precision', '12/14 NT', '21 points', '']) expect([t, namesTwoOverOne(t)]).toEqual([t, false])
  })
  it('sets the 2/1 game-force field', () => {
    const { card_data } = importBridgeodexJson(bdex({ overview: { general_approach: '2/1' } }))
    expect(card_data.major_openings.two_over_one.game_force).toBe(true)
  })
})

const dense = () => JSON.parse(fs.readFileSync(new URL('./fixtures/dense-convention-card.json', import.meta.url))).card_data

describe('exportBridgodexJson', () => {
  it('gives back a card imported from Bridgodex as it came', () => {
    const settings = dense()._bridgeodex_raw
    const out = exportBridgodexJson(importBridgeodexJson({ settings, notes: 'Our notes' }).card_data)
    expect(out.settings).toEqual(settings)
    expect(out.notes).toBe('Our notes')
  })

  it('writes the boxes whose fields changed, and keeps the rest', () => {
    const { card_data: c } = importBridgeodexJson(bdex({
      '1_no_trump': { a_range_min: '15', a_range_max: '17 NV', '2c_stayman': 'on', sys_on_vs: 'X, 2!C', unknown_box: 'on' },
      leads_vs_suits: { honor_leads_AKx: 1 },
    }))
    c.notrump.one_nt.range_min = 14
    c.notrump.one_nt.range_min_plus = true
    delete c.notrump.stayman.forcing
    c.notrump.smolen = { play: true }
    c.leads.vs_suits.honors.lead_choice_akx = 2
    const nt = exportBridgodexJson(c).settings['1_no_trump']
    expect(nt).toEqual({ a_range_min: '14+', a_range_max: '17 NV', sys_on_vs: 'X, 2!C', unknown_box: 'on', smolen: 'on' })
    expect(exportBridgodexJson(c).settings.leads_vs_suits).toEqual({ honor_leads_AKx: 2 })
  })

  it('exports a card made elsewhere, which reads back with the same agreements', () => {
    const card = {
      general: { system: '2/1 GF' },
      notrump: { one_nt: { range_min: 15, range_max: 17 }, stayman: { forcing: true }, transfers: { jacoby: true, texas: true } },
      major_openings: { drury: { reverse: true } },
      two_level: { two_clubs: { meaning: 'strong' } },
      leads: { vs_nt: { honors: { lead_choice_kt9x: 2 }, length: { lead_choice_hxx: 3 } } },
      notes: { slam_notes: 'Exclusion Blackwood' },
      metadata: { partner_names: 'Pat and Sam' },
    }
    const out = exportBridgodexJson(card)
    expect(out.settings['1_no_trump']).toMatchObject({ a_range_min: '15', a_range_max: '17', '2c_stayman': 'on', '2d_tfr': 'on', '2h_tfr': 'on', tfr_4d: 'on', tfr_4h: 'on' })
    expect(out.settings.majors.drury_2c).toBe('on')
    expect(out.settings.leads_vs_nt).toEqual({ honor_interior_seq_KT9x: 2, length_leads_Hxx: 3 })
    expect(out.settings.slams.other).toBe('Exclusion Blackwood')
    expect(out.settings.names.names).toBe('Pat and Sam')
    const back = importBridgeodexJson(out).card_data
    expect(back.notrump.transfers).toMatchObject({ jacoby: true, texas: true })
    expect(back.major_openings.two_over_one.game_force).toBe(true)
    expect(back.leads.vs_nt.honors.lead_choice_kt9x).toBe(2)
    expect(back.notes.slam_notes).toBe('Exclusion Blackwood')
  })

  it('does not copy note lines that repeat a field into the boxes', () => {
    const out = exportBridgodexJson({
      notrump: { lebensohl: { description: 'fast denies' } },
      notes: { notrump_notes: 'Lebensohl: fast denies' },
    })
    expect(out.settings['1_no_trump']).toEqual({ lebensohl_desc: 'fast denies' })
  })
})
