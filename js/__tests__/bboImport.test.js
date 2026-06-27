import { describe, it, expect } from 'vitest'
import { isBboCard, importBboJson } from '../bboImport.js'

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

  it('joins multiple "Other" slots into a single newline-separated note', () => {
    const { card_data } = importBboJson(bboFixture({
      slamOther1: '0314, Kickback',
      slamOther2: '4NT quantitative',
      '1NOther1': 'xfer on over 2 level',
      '1NOther2': 'Stolen bid'
    }))
    expect(card_data.slam.notes).toBe('0314, Kickback\n4NT quantitative')
    expect(card_data.notes.notrump_notes).toBe('xfer on over 2 level\nStolen bid')
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
