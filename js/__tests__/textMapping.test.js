import { describe, it, expect } from 'vitest'
import { textMapping, textMappingCounts, applyImplied } from '../textMapping.js'
import { suggestConventions } from '../recogniseConventions.js'
import { importCard } from '../importCard.js'
import { readPath, writePath } from '../paths.js'
import { cardValues } from '../checkCard.js'
import { bidOf } from '../suits.js'

function card(settings) {
  const data = {}
  for (const [p, v] of Object.entries(settings)) writePath(data, p, v)
  return data
}
const status = (data, path) => textMapping(data).get(path)?.status

describe('textMapping', () => {
  it('maps text whose conventions are all played', () => {
    expect(status(card({ 'slam.notes': 'Minorwood', 'slam.minorwood.play': true }), 'slam.notes')).toBe('mapped')
  })

  it('is pending while a convention it names is not played', () => {
    expect(status(card({ 'slam.notes': 'Minorwood' }), 'slam.notes')).toBe('pending')
  })

  it('flags text no tool can read', () => {
    const m = textMapping(card({ 'competitive.notes': 'Redouble: denies fit' }))
    expect(m.get('competitive.notes').status).toBe('unmapped')
  })

  it('explains the bids of a defence to 1NT once the defence is set', () => {
    const data = card({ 'competitive.vs_1nt_strong.system': 'suction', 'competitive.vs_1nt_strong.2c': '♦ or majors' })
    const m = textMapping(data).get('competitive.vs_1nt_strong.2c')
    expect(m.status).toBe('explained')
    expect(m.explainedBy.path).toBe('competitive.vs_1nt_strong.system')
    expect(m.standard).toBe('♦ or both majors')
  })

  it('is unmapped when the defence it would spell out is not set', () => {
    expect(status(card({ 'competitive.vs_1nt_strong.2c': '♦ or majors' }), 'competitive.vs_1nt_strong.2c')).toBe('unmapped')
  })

  it('says when a bid differs from the convention it spells out', () => {
    const data = card({ 'competitive.vs_1nt_weak.system': 'suction', 'competitive.vs_1nt_weak.dbl': 'Penalty' })
    expect(status(data, 'competitive.vs_1nt_weak.dbl')).toBe('differs')
  })

  it('compares a bid loosely: spelling, "both", "+" and "and"', () => {
    const data = card({
      'competitive.vs_1nt_strong.system': 'suction',
      'competitive.vs_1nt_strong.dbl': '♣ and ♥',
      'competitive.vs_1nt_strong.2d': '♥ or black suits',
    })
    expect(status(data, 'competitive.vs_1nt_strong.dbl')).toBe('explained')
    expect(status(data, 'competitive.vs_1nt_strong.2d')).toBe('explained')
  })

  it('does not take a longer defence name for a shorter one', () => {
    const data = card({ 'competitive.vs_1nt_strong.system': 'modified_cappelletti', 'competitive.vs_1nt_strong.2c': 'Major-Minor' })
    const m = textMapping(data).get('competitive.vs_1nt_strong.2c')
    expect(m.standard).toBeNull()
    expect(m.status).toBe('explained')
  })

  it('counts carding and leads as play, not bidding', () => {
    expect(status(card({ 'carding.notes': 'Trump suit preference' }), 'carding.notes')).toBe('play')
  })

  it('counts each status', () => {
    const data = card({ 'slam.notes': 'Minorwood', 'competitive.notes': 'Redouble: denies fit' })
    expect(textMappingCounts(textMapping(data))).toEqual({ mapped: 0, explained: 0, differs: 0, pending: 1, unmapped: 1, play: 0 })
  })
})

describe('implies', () => {
  const puppet = () => card({ 'notrump.responses.3c': 'Puppet, opener shows 5', 'notrump.two_nt.puppet': true })

  it('a box its text names is the one suggested, whatever the convention\'s other boxes say', () => {
    const { suggestions } = suggestConventions(puppet())
    const s = suggestions.find(x => x.id === 'bidding_conventions/puppet_stayman')
    expect(s.set).toEqual({ field: 'notrump.stayman.puppet_1nt' })
    expect(status(puppet(), 'notrump.responses.3c')).toBe('pending')
  })

  it('applyImplied ticks that box and keeps the text', () => {
    const data = puppet()
    expect(applyImplied(data)).toEqual([{
      field: 'notrump.stayman.puppet_1nt',
      label: 'Puppet Stayman over 1NT (3♣)',
      id: 'bidding_conventions/puppet_stayman',
      from: 'notrump.responses.3c',
      written: 'Puppet',
    }])
    expect(readPath(data, 'notrump.stayman.puppet_1nt')).toBe(true)
    expect(readPath(data, 'notrump.responses.3c')).toBe('Puppet, opener shows 5')
    expect(applyImplied(data)).toEqual([])
    expect(status(data, 'notrump.responses.3c')).toBe('mapped')
  })

  it("import ticks implied boxes on another tool's card, not on our own", async () => {
    const bridgodex = await importCard({ settings: { '1_no_trump': { '3c': 'Puppet' } } }, { from: 'bridgodex' })
    expect(readPath(bridgodex.card_data, 'notrump.stayman.puppet_1nt')).toBe(true)
    expect(bridgodex.implied.map(s => s.field)).toEqual(['notrump.stayman.puppet_1nt'])

    const notes = await importCard({ settings: { slams: { other: 'Minorwood, Exclusion' } } }, { from: 'bridgodex' })
    expect(notes.recognised.map(s => s.name).sort()).toEqual(['Exclusion Blackwood', 'Minorwood'])
    expect(readPath(notes.card_data, 'slam.minorwood.play')).toBe(true)

    const own = await importCard({ name: 'Ours', card_data: puppet() }, { from: 'card' })
    expect(readPath(own.card_data, 'notrump.stayman.puppet_1nt')).toBeUndefined()
    expect(own.implied).toBeUndefined()
    expect(own.recognised).toBeUndefined()
  })
})

describe('bid fields', () => {
  it('reads a level as a bid, however it is typed', () => {
    const data = card({ 'doubles.negative.through': '4h', 'doubles.support.through': '2 ♥', 'vs_preempts.takeout_double_thru': '3nt' })
    const values = cardValues(data)
    expect(values.get('doubles.negative.through')).toBe('4♥')
    expect(values.get('doubles.support.through')).toBe('2♥')
    expect(values.get('vs_preempts.takeout_double_thru')).toBe('3NT')
  })

  it('does not list a bid as text, but flags words where a bid belongs', () => {
    const m = textMapping(card({ 'doubles.negative.through': '4♥', 'doubles.responsive.through': 'game' }))
    expect(m.has('doubles.negative.through')).toBe(false)
    expect(m.get('doubles.responsive.through')).toMatchObject({ status: 'unmapped', notBid: true, text: 'game' })
  })

  it('bidOf takes one bid, not a sentence', () => {
    expect(bidOf('!4S')).toBe('4♠')
    expect(bidOf('4♥ unless vulnerable')).toBeNull()
    expect(bidOf('8♥')).toBeNull()
  })
})
