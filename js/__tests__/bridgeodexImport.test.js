import { describe, it, expect } from 'vitest'
import { importBridgeodexJson } from '../bridgeodexImport.js'

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
})
