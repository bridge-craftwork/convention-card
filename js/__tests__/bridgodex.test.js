import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { importBridgeodexJson, exportBridgodexJson } from '../bridgodex.js'
import { BRIDGODEX_MAP } from '../spec.js'

// Minimal bridgeodex shape: a `settings` object with per-section blocks.
function bdex(settings = {}) {
  return { settings, notes: '' }
}

describe('importBridgeodexJson — key-name regression guards', () => {
  it('reads the strong-NT flag under the real key (1nt_open_strong)', () => {
    const { card_data } = importBridgeodexJson(bdex({ overview: { '1nt_open_strong': 'on' } }))
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
    // Natural is its own box on the ACBL card, not the raise.
    expect(card_data.vs_to_double.two_nt_natural_minors).toBe(true)
    expect(card_data.vs_to_double.two_nt_natural_majors).toBe(true)
    expect(card_data.vs_to_double.two_nt_raise_minors).toBeUndefined()
  })

  it('reads the group-C boxes into their own fields, not the notes', () => {
    const { card_data: c } = importBridgeodexJson(bdex({
      minors: { '1c_1d': '4+ diamonds', '1c_min_len_nf_2_4432': 'on', '1d_min_len_nf_1': 'on' },
      '1_no_trump': { '2c_other': 'Puppet-ish', '2d_nat': 'on' },
      '2_no_trump': { conv: 'on', conv_desc: 'Minors' },
      two_level: { '2c_steps_desc': 'Controls' },
      slams: { gerber_other: 'Only over 1NT/2NT' },
      vs_to_double: { new_suit_forcing_transfer_desc: '1NT is a transfer to clubs' },
      vs_preempts: { '2nt_lebensohl_resp_desc': 'Ingberman' },
      signals: { exceptions: 'Count at trick one', other1: 'Revolving', other2: 'vs NT only' },
      leads_vs_suits: { honor_leads_akx_varies: 'on', honor_leads_akx_varies_desc: 'A at trick one, K later' },
    }))
    expect(c.minor_openings.one_club.one_diamond_response).toBe('4+ diamonds')
    expect(c.minor_openings.one_club.nf2_4432_only).toBe(true)
    expect(c.minor_openings.one_diamond.nf1).toBe(true)
    expect(c.notrump.responses['2c_other']).toBe('Puppet-ish')
    expect(c.notrump.two_d_natural).toBe(true)
    expect(c.notrump.two_nt.conventional).toBe(true)
    expect(c.notrump.two_nt.conventional_desc).toBe('Minors')
    expect(c.two_level.two_clubs.steps_desc).toBe('Controls')
    expect(c.slam.gerber.notes).toBe('Only over 1NT/2NT')
    expect(c.vs_to_double.new_suit_notes).toBe('1NT is a transfer to clubs')
    expect(c.vs_preempts.two_nt_response).toBe('Ingberman')
    expect(c.carding.signals_exceptions).toBe('Count at trick one')
    expect(c.carding.first_discard.notes).toBe('Revolving\nvs NT only')
    expect(c.leads.vs_suits.honors.varies).toBe(true)
    expect(c.leads.vs_suits.honors.varies_desc).toBe('A at trick one, K later')
    // None of it is folded into a section's notes any more.
    expect(JSON.stringify(c.notes || {})).not.toMatch(/Ingberman|Controls|Puppet-ish|Count at trick one/)
  })

  it('writes the group-C fields back to their Bridgodex boxes', () => {
    const { card_data } = importBridgeodexJson(bdex({
      two_level: { '2c_steps_desc': 'Controls' },
      vs_preempts: { '2nt_lebensohl_resp_desc': 'Ingberman' },
      '1_no_trump': { '2d_nat': 'on' },
    }))
    const out = exportBridgodexJson(card_data)
    expect(out.settings.two_level['2c_steps_desc']).toBe('Controls')
    expect(out.settings.vs_preempts['2nt_lebensohl_resp_desc']).toBe('Ingberman')
    expect(out.settings['1_no_trump']['2d_nat']).toBe('on')
  })

  it('maps Jacoby transfers from per-suit flags', () => {
    const { card_data } = importBridgeodexJson(bdex({
      '1_no_trump': { '2d_tfr': 'on', '2h_tfr': 'on', '2s_tfr': 'on' }
    }))
    expect(card_data.notrump.jacoby_transfers.play).toBe(true)
    // The 2♠ transfer box is a minor-suit transfer: it plays them.
    expect(card_data.notrump.minor_transfers).toEqual({ play: true, two_s: true })
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
    expect(card_data.major_openings.two_over_one.play).toBe(true)
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

  it('exports the first of several cards led, as Bridgodex holds one', () => {
    const { card_data: c } = importBridgeodexJson(bdex({ leads_vs_suits: { honor_leads_AKx: 2 } }))
    c.leads.vs_suits.honors.lead_choice_akx = [2, 1]
    expect(exportBridgodexJson(c).settings.leads_vs_suits).toEqual({ honor_leads_AKx: 1 })
    c.leads.vs_suits.honors.lead_choice_akx = [2]
    expect(exportBridgodexJson(c).settings.leads_vs_suits).toEqual({ honor_leads_AKx: 2 })
  })

  it('exports a card made elsewhere, which reads back with the same agreements', () => {
    // No schema_version: read as 1.x, and upgraded before the export.
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
    expect(back.notrump.jacoby_transfers.play).toBe(true)
    expect(back.notrump.texas.play).toBe(true)
    expect(back.major_openings.two_over_one.play).toBe(true)
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

describe('the Bridgodex map', () => {
  // Bridgodex's own list of boxes (fixtures/bridgodex-keys.json): a key the
  // map invents is one Bridgodex never writes or reads.
  const { about, ...KEYS } = JSON.parse(fs.readFileSync(new URL('./fixtures/bridgodex-keys.json', import.meta.url)))
  const has = dotted => { const i = dotted.indexOf('.'); return (KEYS[dotted.slice(0, i)] || []).includes(dotted.slice(i + 1)) }

  it('names only boxes Bridgodex has', () => {
    const { any, notes, ...blocks } = BRIDGODEX_MAP
    const named = [
      ...Object.entries(blocks).flatMap(([b, keys]) => Object.keys(keys).map(k => `${b}.${k}`)),
      ...any.flatMap(a => [...a.keys, ...(a.export || [])]),
      ...notes.flatMap(n => [...n.lines.flatMap(l => [l.key].flat()), n.export_to].filter(Boolean)),
    ]
    expect(named.length).toBeGreaterThan(300)
    expect(named.filter(k => !has(k))).toEqual([])
  })

  it('writes lead keys as Bridgodex spells them', () => {
    const out = exportBridgodexJson({ leads: {
      vs_suits: { honors: { lead_choice_akx: 1, lead_choice_kjtx: 2 }, length: { lead_choice_hxx: 3 } },
      vs_nt: { honors: { lead_choice_kqt9: 1, lead_choice_aqjx: 2 }, length: { lead_choice_xxxxx: 4 } },
    } })
    const keys = Object.entries(out.settings).flatMap(([b, v]) => Object.keys(v).map(k => `${b}.${k}`))
    expect(keys).toHaveLength(6)
    expect(keys.filter(k => !has(k))).toEqual([])
  })
})
