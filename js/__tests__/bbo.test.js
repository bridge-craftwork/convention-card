import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { isBboCard, importBboJson, exportBboJson } from '../bbo.js'
import { field } from '../spec.js'

// A compact fixture modelled on a real BBO ACBL export
// (source: "bbo-acbl", cards[].fields with flat slot keys).
function bboFixture(fields = {}) {
  return {
    schema_version: '1.1',
    exported_at: '2026-06-26T15:42:58.334Z',
    source: 'bbo-acbl',
    cards: [
      {
        cc_key: 'ACBL/N/partner/123_kemistry/456',
        title: '2/1 Shirley-Rick',
        partner: 'lopina360',
        owner: 'lopina360',
        style: 'ACBL',
        fields
      }
    ]
  }
}

describe('isBboCard', () => {
  it('detects a card with source "bbo-acbl"', () => {
    expect(isBboCard({ source: 'bbo-acbl', cards: [] })).toBe(true)
  })

  it('detects a card with a cards[] array even without source', () => {
    expect(isBboCard({ cards: [{ fields: {} }] })).toBe(true)
  })

  it('rejects a bridgeodex card (settings block)', () => {
    expect(isBboCard({ settings: { overview: {} } })).toBe(false)
  })

  it('rejects null / non-objects', () => {
    expect(isBboCard(null)).toBe(false)
    expect(isBboCard('nope')).toBe(false)
    expect(isBboCard(42)).toBe(false)
  })
})

describe('importBboJson', () => {
  it('throws on empty / non-object input', () => {
    expect(() => importBboJson(null)).toThrow(/empty or not JSON/i)
  })

  it('throws when the cards array is empty', () => {
    expect(() => importBboJson({ source: 'bbo-acbl', cards: [] })).toThrow(/no cards/i)
  })

  it('uses the card title as the name and partner_names', () => {
    const { name, description, card_data } = importBboJson(bboFixture())
    expect(name).toBe('2/1 Shirley-Rick')
    expect(description).toMatch(/BBO/)
    expect(card_data.metadata.source).toBe('bbo')
    expect(card_data.metadata.partner_names).toBe('2/1 Shirley-Rick')
  })

  it('parses the leading integer out of range strings ("14+" -> 14)', () => {
    const { card_data } = importBboJson(bboFixture({
      '1NTMin1': '14+',
      '1NTMax1': '17',
      '2NTMin': '20',
      '2NTMax': '21'
    }))
    expect(card_data.notrump.one_nt.range_min).toBe(14)
    expect(card_data.notrump.one_nt.range_max).toBe(17)
    expect(card_data.notrump.two_nt.range_min).toBe(20)
    expect(card_data.notrump.two_nt.range_max).toBe(21)
  })

  it('maps 1NT responses and system-on, normalizing suit shorthand', () => {
    const { card_data } = importBboJson(bboFixture({
      '1NSysOn': 'X or 2C',
      '1N3C': 'puppet stayman',
      '1N3D': '55 mm GF',
      '1N2S': 'Range ask or clubs',
      '1N2N': 'to diamonds'
    }))
    expect(card_data.notrump.one_nt.sys_on_vs).toBe('X or 2♣')
    expect(card_data.notrump.responses['3c']).toBe('puppet stayman')
    expect(card_data.notrump.responses['3d']).toBe('55 mm GF')
    expect(card_data.notrump.responses['2s_other']).toBe('Range ask or clubs')
    expect(card_data.notrump.responses['2nt_other']).toBe('to diamonds')
  })

  it('keeps the 2C minimum as a raw string but parses weak-two HCP as numbers', () => {
    const { card_data } = importBboJson(bboFixture({
      '2CMin': '22',
      '2DMin': '6',
      '2DMax': '11',
      '2DOther1': 'Rule of 2-3-4',
      '2DOther2': 'Raise=NF, Ogust'
    }))
    expect(card_data.two_level.two_clubs.min_hcp_str).toBe('22')
    expect(card_data.two_level.two_diamonds.min_hcp).toBe(6)
    expect(card_data.two_level.two_diamonds.max_hcp).toBe(11)
    expect(card_data.two_level.two_diamonds.description).toBe('Rule of 2-3-4')
    expect(card_data.two_level.two_diamonds.notes).toBe('Raise=NF, Ogust')
  })

  it('maps overcall + NT-overcall ranges and defense vs 1NT', () => {
    const { card_data } = importBboJson(bboFixture({
      ocallMin: '6',
      ocallMax: '16',
      '1NOcallDMin': '15',
      '1NOcallDMax': '18',
      vs1NT2C1: 'I suited',
      vs1NTDbl1: 'Penalty'
    }))
    expect(card_data.overcalls.one_level_min).toBe(6)
    expect(card_data.overcalls.one_level_max).toBe(16)
    expect(card_data.nt_overcalls.direct.range_min).toBe(15)
    expect(card_data.nt_overcalls.direct.range_max).toBe(18)
    expect(card_data.competitive.vs_1nt_strong['2c']).toBe('I suited')
    expect(card_data.competitive.vs_1nt_strong.dbl).toBe('Penalty')
  })

  it('spreads the 2C describe/response Other slots across separate lines', () => {
    const { card_data: c } = importBboJson(bboFixture({
      '2COther1': 'Or 9+ tricks',
      '2COther4': '2H bust',
      '2COther5': 'Kokish Relay',
      '2COther6': 'Parrish Relay'
    }))
    const tc = c.two_level.two_clubs
    expect(tc.description).toBe('Or 9+ tricks')          // DESCRIBE line 1
    expect(tc.notes).toMatch(/bust/)                     // RESPONSES line 1
    expect(tc.continuation_response).toBe('Kokish Relay') // RESPONSES line 2
    expect(tc.continuation_describe).toBe('Parrish Relay') // spills to DESCRIBE line 2
  })

  it('joins multiple "Other" slots into a single newline-separated note', () => {
    const { card_data } = importBboJson(bboFixture({
      '1NOther1': 'xfer on over 2 level',
      '1NOther2': 'Stolen bid'
    }))
    expect(card_data.notes.notrump_notes).toBe('xfer on over 2 level\nStolen bid')
  })

  it('maps special-doubles "thru" levels and slam/NT-overcall conv lines', () => {
    const { card_data: c } = importBboJson(bboFixture({
      dblOther2: '4!H', dblOther3: '3!S', dblOther4: '2!H', dblOther5: 'snapdragon',
      '1NOcallOther1': 'direct conv', '1NOcallOther2': '19-21 in balancing seat',
      slamOther1: 'RKC 1430', slamOther2: 'Std Gerber'
    }))
    expect(c.doubles.negative.through).toBe('4♥')
    expect(c.doubles.responsive.through).toBe('3♠')
    expect(c.doubles.support.through).toBe('2♥')
    expect(c.doubles.notes).toBe('snapdragon')
    expect(c.nt_overcalls.direct.conv_text).toBe('direct conv')
    expect(c.nt_overcalls.balance.conv_text).toBe('19-21 in balancing seat')
    expect(c.slam.control_bids).toBe('RKC 1430')
    expect(c.slam.vs_interference).toBe('Std Gerber')
  })

  it('normalizes suit shorthand in free text (vsPreTOThru "4H" -> "4♥")', () => {
    const { card_data } = importBboJson(bboFixture({ vsPreTOThru: '4H' }))
    expect(card_data.vs_preempts.takeout_double_thru).toBe('4♥')
  })

  it('prefers fields.names for the partnership name', () => {
    const fx = bboFixture()
    fx.cards[0].fields.names = 'Rick and Art'
    expect(importBboJson(fx).card_data.metadata.partner_names).toBe('Rick and Art')
  })

  it('applies convention checkboxes from the conventions object', () => {
    const fx = bboFixture({})
    fx.cards[0].conventions = {
      '1NStayman': 'y',
      '1N2DTrans': 'y',
      '1NTexas': 'y',
      'major2NTRaise': 'y',
      'majorSplinter': 'y',
      '1430': 'y',
      '2CStrong': 'y',
      'NMF': 'y'
    }
    const { card_data: c } = importBboJson(fx)
    expect(c.notrump.stayman.forcing).toBe(true)
    expect(c.notrump.transfers.jacoby).toBe(true)
    expect(c.notrump.transfers.texas).toBe(true)
    expect(c.major_openings.jacoby_2nt.play).toBe(true)
    expect(c.major_openings.splinters.play).toBe(true)
    expect(c.other_conventions.blackwood.rkcb_1430).toBe(true)
    expect(c.two_level.two_clubs.meaning).toBe('strong')
    expect(c.other_conventions.new_minor_forcing.play).toBe(true)
  })

  it('expands Drury and min-length convention keys', () => {
    const fx = bboFixture({})
    fx.cards[0].conventions = { druryRev: 'y', 'major12-5': 'y', minorC3: 'y', minorD3: 'y' }
    const { card_data: c } = importBboJson(fx)
    expect(c.major_openings.drury.play).toBe(true)
    expect(c.major_openings.drury.reverse).toBe(true)
    expect(c.major_openings.min_length_1st_2nd).toBe(5)
    expect(c.minor_openings.one_club.min_length).toBe(3)
    expect(c.minor_openings.one_diamond.min_length).toBe(3)
  })

  it('maps lead-circle choices to lead_choice_* positions', () => {
    const fx = bboFixture({})
    fx.cards[0].leads = { 'ls-akx-a': 'y', 'ln-xxxx-3': 'y' }
    const { card_data: c } = importBboJson(fx)
    expect(c.leads.vs_suits.honors.lead_choice_akx).toBe(1)   // 'a' is 1st in "akx"
    expect(c.leads.vs_nt.length.lead_choice_xxxx).toBe(3)     // bare digit position
  })

  it('reads a small card as x1, x2… and files Hxx with the lengths, as the spec does', () => {
    const fx = bboFixture({})
    fx.cards[0].leads = { 'ls-xx-x1': 'y', 'ln-hxx-x2': 'y' }
    const { card_data: c } = importBboJson(fx)
    expect(c.leads.vs_suits.length.lead_choice_xx).toBe(1)
    expect(c.leads.vs_nt.length.lead_choice_hxx).toBe(3)
  })

  it('keeps a + or - on a notrump range', () => {
    const { card_data: c } = importBboJson(bboFixture({ '1NTMin1': '14+', '1NTMax1': '17-' }))
    expect(c.notrump.one_nt).toMatchObject({ range_min: 14, range_min_plus: true, range_max: 17, range_max_minus: true })
  })

  it('routes the OTHER-section text slots to their distinct lines', () => {
    const { card_data: c } = importBboJson(bboFixture({
      other2: '1m,2M conv',
      other4: 'Kokish game tries, western cue',
      other5: 'xyz, spiral'
    }))
    expect(c.other_conventions.weak_jump_shifts_notes).toBe('1m,2M conv')
    expect(c.other_conventions.notes_line_1).toBe('Kokish game tries, western cue')
    expect(c.other_conventions.notes_line_2).toBe('xyz, spiral')
  })

  it('maps the weak-1NT column of the defense-vs-1NT table', () => {
    const { card_data: c } = importBboJson(bboFixture({
      vs1NTHead1: 'Strong 1NT',
      vs1NTHead2: 'Weak 1NT',
      vs1NT2C2: 'Same'
    }))
    expect(c.competitive.vs_1nt_strong.system).toBe('Strong 1NT')
    expect(c.competitive.vs_1nt_weak.system).toBe('Weak 1NT')
    expect(c.competitive.vs_1nt_weak['2c']).toBe('Same')
  })

  it('preserves the raw blob and prunes empty sections', () => {
    const { card_data } = importBboJson(bboFixture({ '1NTMin1': '15' }))
    expect(card_data._bbo_raw).toBeTruthy()
    expect(card_data._bbo_raw.title).toBe('2/1 Shirley-Rick')
    // No doubles fields in this fixture → the doubles section is pruned away.
    expect(card_data.doubles).toBeUndefined()
  })
})

// A card as BBO's cc_fetch.php returns it (the extension's
// tests/fixtures/cc_fetch_sample.xml), with a slot and a box no map covers.
function bmw() {
  return {
    schema_version: '1.1',
    exported_at: '2026-06-26T15:42:58.334Z',
    source: 'bbo-acbl',
    cards: [{
      cc_key: 'ACBL/N/kemistry/1399129902_4125_aam135/1399129902',
      title: 'BMW', partner: 'aam135', owner: 'kemistry', stock: false, default: false, style: 'ACBL',
      fields: {
        names: 'Rick and Art', approach: '2/1 Game forcing', majorOther1: 'Bergen Raises',
        major3NTMin: '13', major3NTMax: '15', '1NTMin1': '15', '1NTMax1': '17',
        slamOther1: 'RKC 1430 & specific kings', vsPreTOThru: 'thru 4!H', someNewSlot: 'kept',
      },
      conventions: { 'major12-5': 'y', '2CStrong': 'y', '1NStayman': 'y', someNewBox: 'y' },
      leads: { 'ls-xx-x1': 'y', 'ln-akjx-k': 'y' },
    }],
  }
}

const dense = () => JSON.parse(fs.readFileSync(new URL('./fixtures/dense-convention-card.json', import.meta.url))).card_data

describe('exportBboJson', () => {
  it('gives back an imported card as it came', () => {
    const input = bmw()
    const { card_data } = importBboJson(input)
    const out = exportBboJson(card_data, { exportedAt: 'now' })
    expect(out).toMatchObject({ schema_version: '1.1', source: 'bbo-acbl', exported_at: 'now' })
    expect(out.cards).toEqual(input.cards)
  })

  it('writes the slots, boxes and circles whose fields changed', () => {
    const { card_data: c } = importBboJson(bmw())
    c.notrump.one_nt.range_min = 14
    c.notrump.one_nt.range_min_plus = true
    delete c.notrump.stayman.forcing
    c.notrump.smolen = { play: true }
    c.general.system = '2/1, 1♥-1NT forcing'
    c.leads.vs_suits.length.lead_choice_xx = 2
    const card = exportBboJson(c).cards[0]
    expect(card.fields).toMatchObject({ '1NTMin1': '14+', '1NTMax1': '17', approach: '2/1, 1!H-1NT forcing', vsPreTOThru: 'thru 4!H' })
    expect(card.conventions['1NStayman']).toBeUndefined()
    expect(card.conventions).toMatchObject({ '1NSmolen': 'y', someNewBox: 'y', '2CStrong': 'y' })
    expect(card.leads).toEqual({ 'ls-xx-x2': 'y', 'ln-akjx-k': 'y' })
  })

  it('names the card on BBO by the title given, and writes changed partner names', () => {
    const { card_data: c } = importBboJson(bmw())
    c.metadata.partner_names = 'Rick and Dan'
    const card = exportBboJson(c, { name: 'BMW 2' }).cards[0]
    expect(card).toMatchObject({ title: 'BMW 2', cc_key: 'ACBL/N/kemistry/1399129902_4125_aam135/1399129902' })
    expect(card.fields.names).toBe('Rick and Dan')
  })

  it('ticks every BBO box a card field stands for', () => {
    const card = exportBboJson({
      major_openings: { min_length_1st_2nd: 5, drury: { play: true, reverse: true } },
      notrump: { transfers: { jacoby: true } },
      two_level: { two_clubs: { meaning: 'strong' } },
    }).cards[0]
    expect(card.conventions).toEqual({
      'major12-5': 'y', drury: 'y', druryRev: 'y', '1N2DTrans': 'y', '1N2HTrans': 'y', '2CStrong': 'y',
    })
    expect(card.style).toBe('ACBL')
  })

  it('spreads the 2♣ lines back over the DESCRIBE and RESPONSES slots', () => {
    const { card_data: c } = importBboJson(bboFixture({ '2COther1': 'a', '2COther2': 'b', '2COther3': 'c', '2COther4': 'd', '2COther5': 'e' }))
    c.two_level.two_clubs.notes = 'D'
    const fields = exportBboJson(c).cards[0].fields
    expect(fields).toMatchObject({ '2COther1': 'a', '2COther2': 'b', '2COther3': 'c', '2COther4': 'D', '2COther5': 'e' })
  })

  it('exports a card made elsewhere, which reads back the same where BBO has room', () => {
    const card = dense()
    const back = importBboJson(exportBboJson(card, { name: 'Dense' })).card_data
    const flat = (o, p = '', out = {}) => {
      for (const [k, v] of Object.entries(o || {})) {
        if (k.startsWith('_') || k === 'metadata') continue
        const q = p ? `${p}.${k}` : k
        if (v && typeof v === 'object') flat(v, q, out)
        else if (v != null && v !== '') out[field(q)?.path ?? q] = v
      }
      return out
    }
    const before = flat(card)
    const after = flat(back)
    expect(Object.keys(after).length).toBeGreaterThan(100)
    // BBO has five lines for notrump notes and two for major notes; the rest
    // are joined onto the last line.
    const roomy = Object.keys(after).filter(p => !['notes.notrump_notes', 'notes.major_notes'].includes(p))
    expect(roomy.filter(p => after[p] !== before[p])).toEqual([])
    expect(after['notes.major_notes'].split('\n')).toHaveLength(2)
  })
})
