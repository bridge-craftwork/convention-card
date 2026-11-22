import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { importSwanJson, exportSwanJson, blankSwanCard, isSwanCard } from '../swan.js'
import { importCard, detectFormat } from '../importCard.js'

// Two of BridgeWinners' own exports (2026-11-21): a blank card with only
// its names filled in, and its "Bridge Winners Standard" template.
const fixture = name => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const BLANK = fixture('swan-blank.json')
const STANDARD = fixture('swan-bw-standard.json')

/** A Swan card's boxes as `Section.path` → value. */
function boxes(card) {
  const out = {}
  const walk = (o, p) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object') walk(v, `${p}${k}.`)
      else out[`${p}${k}`] = v
    }
  }
  walk(card.Convention_Card, '')
  return out
}

const changed = (a, b) => Object.keys({ ...boxes(a), ...boxes(b) }).filter(k => boxes(a)[k] !== boxes(b)[k]).sort()

describe('the Swan format', () => {
  it('has every box of BridgeWinners\' file, and no other', () => {
    const blank = blankSwanCard()
    const theirs = structuredClone(BLANK)
    theirs.Convention_Card.General.name.names = ''
    expect(blank).toEqual(theirs)
    expect(Object.keys(boxes(blank))).toHaveLength(372)
  })

  it('is told apart from the other formats', () => {
    expect(isSwanCard(STANDARD)).toBe(true)
    expect(detectFormat(STANDARD)).toBe('swan')
    expect(detectFormat(JSON.stringify(BLANK))).toBe('swan')
    expect(isSwanCard({ settings: {} })).toBe(false)
  })
})

describe('importSwanJson', () => {
  const { name, card_data: c } = importSwanJson(STANDARD)

  it('reads the names as the card\'s name and its partners', () => {
    expect(name).toBe('Bridge Winners Standard')
    expect(c.metadata.partner_names).toBe('Bridge Winners Standard')
    expect(c.metadata.source).toBe('bridgewinners')
  })

  it('reads ticks, choices and text, with suits as symbols', () => {
    expect(c.general.system).toBe('2 over 1')
    expect(c.major_openings.two_over_one.play).toBe(true)
    expect(c.major_openings.min_length_1st_2nd).toBe('4')
    expect(c.major_openings.min_length_3rd_4th).toBe('5')
    expect(c.major_openings.drury.reverse).toBe(true)
    expect(c.notrump.one_nt.five_card_major).toBe('sometimes')
    expect(c.notrump.one_nt.sys_on_vs).toBe('X, 2♣')
    expect(c.notrump.texas.play).toBe(true)
    expect(c.two_level.two_clubs.meaning).toBe('strong')
    expect(c.two_level.two_clubs['2d_response']).toBe('waiting')
    expect(c.two_level.two_hearts.meaning).toBe('weak')
    expect(c.competitive.vs_1nt_strong['2c']).toBe('♣ + higher')
    expect(c.slam.rkcb).toEqual({ play: true, style: '1430' })
    expect(c.overcalls.responses.new_suit).toBe('nf_constructive')
    expect(c.doubles.negative.through).toBe('4♥')
  })

  it('reads ranges: the number, a +, and numbers typed with a space', () => {
    expect(c.notrump.one_nt.range_min).toBe(14)
    expect(c.notrump.one_nt.range_min_plus).toBe(true)
    expect(c.notrump.one_nt.range_max).toBe(17)
    expect(c.two_level.two_hearts.min_hcp).toBe(5) // "5 " in the file
    expect(c.overcalls.one_level_min).toBe(7)
  })

  it('reads the lead grid as the card led from each holding', () => {
    expect(c.leads.vs_suits.honors.lead_choice_akx).toBe(1)
    expect(c.leads.vs_suits.length.lead_choice_xxx).toBe(3)
    expect(c.leads.vs_suits.length.lead_choice_xxxxx).toBe(5)
    // Two cards ticked: either
    expect(c.leads.vs_nt.length.lead_choice_xxxxx).toEqual([2, 4])
  })

  it('keeps the file for the export', () => {
    expect(c._swan_raw).toEqual(STANDARD.Convention_Card)
  })

  it('reads through importCard', async () => {
    const read = await importCard(JSON.stringify(STANDARD))
    expect(read.format).toBe('swan')
    expect(read.name).toBe('Bridge Winners Standard')
    expect(read.card_data.notrump.smolen.play).toBe(true)
  })

  it('says what is wrong with a file that is not a card', () => {
    expect(() => importSwanJson({})).toThrow(/Convention_Card/)
  })
})

describe('exportSwanJson', () => {
  it('gives an imported card back as it came', () => {
    const { card_data } = importSwanJson(STANDARD)
    expect(exportSwanJson(card_data)).toEqual(STANDARD)
  })

  it('changes only the boxes of a changed field', () => {
    const { card_data } = importSwanJson(STANDARD)
    card_data.slam.rkcb.style = '0314'
    card_data.notrump.one_nt.range_min = 15
    delete card_data.notrump.one_nt.range_min_plus
    card_data.leads.vs_suits.honors.lead_choice_akx = 2
    card_data.metadata.partner_names = 'Pat and Sam'
    const out = exportSwanJson(card_data)
    expect(changed(STANDARD, out)).toEqual([
      'General.name.names',
      'Leads.vs_suits.ace_king.ace',
      'Leads.vs_suits.ace_king.king',
      'Notrump_opening.One_notrump_opening.range.range1.nt_open_rmin1',
      'Slam_conventions.rkc_0314',
      'Slam_conventions.rkc_1430',
    ])
    expect(out.Convention_Card.Notrump_opening.One_notrump_opening.range.range1.nt_open_rmin1).toBe('15')
    expect(out.Convention_Card.General.name.names).toBe('Pat and Sam')
  })

  it('writes every box for a card from elsewhere, blank where the card has nothing', () => {
    const out = exportSwanJson({
      metadata: { name: 'Our card' },
      general: { system: 'SAYC' },
      notrump: { one_nt: { range_min: 15, range_max: 17 }, stayman: { play: true }, jacoby_transfers: { play: true } },
      leads: { vs_nt: { honors: { lead_choice_akxx: 2 } } },
    })
    expect(Object.keys(boxes(out))).toHaveLength(372)
    const cc = out.Convention_Card
    expect(cc.General.name.names).toBe('Our card')
    expect(cc.General.general_approach.general_approach).toBe('SAYC')
    const nt = cc.Notrump_opening.One_notrump_opening
    expect(nt.range.range1).toEqual({ nt_open_rmin1: '15', nt_open_rmax1: '17' })
    expect(nt.two_clubs.stayman).toBe(true)
    expect(nt.two_diamonds.transfer_to_hearts).toBe(true)
    expect(nt.two_hearts.transfer_to_spades).toBe(true)
    expect(nt.smolen).toBeUndefined()
    expect(nt.other_conventions.smolen).toBe(false)
    // The editor's AKxx(+) row is the Classic's AKJx
    expect(cc.Leads.vs_notrump.ace_king_jack).toEqual({ ace: false, king: true, jack: false, low: false })
  })

  it('ticks a box from the editor\'s own ticks where the Classic has one for several', () => {
    const cc = exportSwanJson({
      notrump: { texas: { bid_4d: true, bid_4h: true } },
      carding: { first_discard: { lavinthal: true } },
      general: { forcing_opening_other: '1♦' },
    }).Convention_Card
    expect(cc.Notrump_opening.One_notrump_opening.four_diamonds_and_four_hearts.transfer).toBe(true)
    expect(cc.Defensive_carding.first_discard.lavinthal).toEqual({ vs_suits: true, vs_notrump: true })
    expect(cc.General.forcing_openings.other).toEqual({ other: true, other_explanation: '1!D' })
  })
})
