import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { compareCards } from '../compareCards.js'
import { writePath } from '../paths.js'
import { FIELDS } from '../spec.js'

const ROOT = path.resolve(__dirname, '../..')
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const SEED = read('crates/bridge-card/tests/fixtures/21_intermediate_card.json')
const DENSE = read('js/__tests__/fixtures/dense-convention-card.json')

// A card_data from `path = value` pairs.
function card(settings, extra = {}) {
  const data = { ...extra }
  for (const [p, v] of Object.entries(settings)) writePath(data, p, v)
  return data
}
const row = (result, key) => result.rows.find(r => r.key === key)
const texts = r => r.cells.map(c => (c.recorded ? c.text : '∅'))

describe('compareCards', () => {
  it('names the columns from the record, then the metadata', () => {
    const r = compareCards([
      { id: 'a', name: 'With Dan', card_data: card({}, { metadata: { partner_names: 'Rick and Dan' } }) },
      card({}, { metadata: { name: 'With Art' } }),
      {},
    ])
    expect(r.cards).toEqual([
      { id: 'a', name: 'With Dan', names: 'Rick and Dan' },
      { id: null, name: 'With Art', names: '' },
      { id: null, name: 'Card 3', names: '' },
    ])
  })

  it('shows a choice group as one row', () => {
    const r = compareCards([
      card({ 'carding.suits.standard_count': true }),
      card({ 'carding.suits.upside_down_count': true }),
    ])
    const count = row(r, 'carding.suits.count')
    expect(count.label).toBe('Count vs suits')
    expect(texts(count)).toEqual(['Standard', 'Upside-down'])
    expect(count.status).toBe('differs')
    expect(r.rows.filter(x => x.paths.includes('carding.suits.standard_count'))).toHaveLength(1)
  })

  it('shows both alternatives where a card has two on', () => {
    const r = compareCards([
      card({ 'slam.blackwood.rkcb_1430': true, 'slam.blackwood.rkcb_0314': true }),
      card({ 'slam.blackwood.rkcb_1430': true }),
    ])
    expect(texts(row(r, 'slam.keycard_responses'))).toEqual(['RKCB 1430 + RKCB 0314', 'RKCB 1430'])
  })

  it('folds a range and its plus and minus into one row', () => {
    const r = compareCards([
      card({ 'notrump.one_nt.range_min': 15, 'notrump.one_nt.range_max': 17 }),
      card({ 'notrump.one_nt.range_min': 14, 'notrump.one_nt.range_min_plus': true, 'notrump.one_nt.range_max': 17 }),
    ])
    const nt = row(r, 'notrump.one_nt.range')
    expect(nt.label).toBe('1NT range')
    expect(texts(nt)).toEqual(['15–17', '14+–17'])
    expect(r.rows.some(x => x.key === 'notrump.one_nt.range_min_qualifier')).toBe(false)
  })

  it('counts an unset yes/no field as off, not as not recorded', () => {
    const r = compareCards([card({ 'notrump.stayman.play': true }), card({}), card({ 'notrump.stayman.play': false })])
    const stayman = row(r, 'notrump.stayman.play')
    expect(stayman.cells).toEqual([
      { recorded: true, text: 'Yes' },
      { recorded: true, text: null },
      { recorded: true, text: null },
    ])
    expect(stayman.status).toBe('differs')
  })

  it("reads a yes/no field's default when it is unset", () => {
    expect(FIELDS['major_openings.five_card_majors'].default).toBe(true)
    const r = compareCards([card({}), card({ 'major_openings.five_card_majors': true })])
    expect(row(r, 'major_openings.five_card_majors').status).toBe('same')
  })

  it('counts a value one card does not record as a difference, and says so', () => {
    const r = compareCards([
      card({ 'general.min_hcp_open': 11 }),
      card({}),
      card({ 'general.min_hcp_open': 11 }),
    ])
    const hcp = row(r, 'general.min_hcp_open')
    expect(texts(hcp)).toEqual(['11', '∅', '11'])
    expect(hcp.status).toBe('differs')
    expect(hcp.blanks).toBe(1)
  })

  it('compares text ignoring case and spacing, and shows each as written', () => {
    const r = compareCards([
      card({ 'general.system': '2/1  Game Force' }),
      card({ 'general.system': '2/1 game force' }),
    ])
    const system = row(r, 'general.system')
    expect(system.status).toBe('same')
    expect(texts(system)).toEqual(['2/1  Game Force', '2/1 game force'])
  })

  it('compares enums after the spec normalises their spellings', () => {
    const r = compareCards([
      card({ 'competitive.vs_1nt_strong.system': 'Modified Cappelletti' }),
      card({ 'competitive.vs_1nt_strong.system': 'modified_cappelletti' }),
    ])
    expect(row(r, 'competitive.vs_1nt_strong.system').status).toBe('same')
  })

  it('follows older paths to their fields', () => {
    const aliased = Object.entries(FIELDS).find(([, d]) => d.kind === 'bool' && d.aliases?.length)
    const [canonical, def] = aliased
    const r = compareCards([card({ [canonical]: true }), card({ [def.aliases[0]]: true })])
    const found = r.rows.find(x => x.paths.includes(canonical))
    expect(found.status).toBe('same')
  })

  it('leaves out rows no card sets', () => {
    const r = compareCards([card({ 'notrump.stayman.play': true }), card({})])
    expect(r.rows.map(x => x.key)).toEqual(['notrump.stayman.play'])
  })

  it('compares other_agreements by ID, then by text', () => {
    const r = compareCards([
      card({}, { other_agreements: [{ id: 'bidding_conventions/xyz', text: 'XYZ' }, { text: 'Kokish relay' }] }),
      card({}, { other_agreements: [{ text: 'kokish  relay' }] }),
    ])
    const others = r.rows.filter(x => x.section === 'other_agreements')
    expect(others.map(x => [x.label, x.status])).toEqual([
      ['XYZ', 'differs'],
      ['Kokish relay', 'same'],
    ])
  })

  it('keeps the spec order, and every field in at most one row', () => {
    const r = compareCards([SEED, DENSE])
    const order = Object.keys(FIELDS)
    const positions = r.rows.filter(x => x.section !== 'other_agreements').map(x => order.indexOf(x.paths[0]))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    const paths = r.rows.flatMap(x => x.paths).filter(p => p !== 'other_agreements')
    expect(new Set(paths).size).toBe(paths.length)
    expect(r.rows.some(x => x.status === 'differs')).toBe(true)
  })

  it('names every choice group', () => {
    const groups = new Set(Object.values(FIELDS).map(d => d.choice).filter(Boolean))
    const all = {}
    for (const [p, d] of Object.entries(FIELDS)) if (d.choice) all[p] = true
    const r = compareCards([card(all)])
    for (const g of groups) {
      const found = r.rows.find(x => x.key === g)
      if (!found) continue // a range's plus and minus, folded into the range
      expect(found.label, g).toMatch(/\S/)
      expect(found.cells[0].text, g).toMatch(/\S/)
    }
  })
})
