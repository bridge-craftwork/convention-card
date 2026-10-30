import { describe, it, expect } from 'vitest'
import { mergeCards, resolveConflicts } from '../mergeCards.js'

const base = {
  schema_version: '2.0',
  notrump: { one_nt: { range_min: 15, range_max: 17 }, stayman: { play: true } },
  leads: { vs_suits: { honors: { lead_choice_akx: 1 } } },
  notes: { general: 'Old notes' },
}
const copy = v => structuredClone(v)

describe('mergeCards', () => {
  it('takes edits to different fields from both sides', () => {
    const mine = copy(base); mine.notrump.one_nt.range_min = 14
    const theirs = copy(base); theirs.notrump.stayman.puppet_2nt = true; theirs.notes.general = 'New notes'
    const { card, conflicts } = mergeCards(base, mine, theirs)
    expect(conflicts).toEqual([])
    expect(card.notrump).toEqual({ one_nt: { range_min: 14, range_max: 17 }, stayman: { play: true, puppet_2nt: true } })
    expect(card.notes.general).toBe('New notes')
  })

  it('makes no conflict of the same edit on both sides', () => {
    const mine = copy(base); mine.notrump.one_nt.range_min = 14
    const theirs = copy(base); theirs.notrump.one_nt.range_min = 14
    expect(mergeCards(base, mine, theirs)).toEqual({ card: mine, conflicts: [] })
  })

  it('reports a field both changed differently, keeping mine until settled', () => {
    const mine = copy(base); mine.notrump.one_nt.range_min = 14
    const theirs = copy(base); theirs.notrump.one_nt.range_min = 16
    const { card, conflicts } = mergeCards(base, mine, theirs)
    expect(conflicts).toEqual([{ path: 'notrump.one_nt.range_min', base: 15, mine: 14, theirs: 16 }])
    expect(card.notrump.one_nt.range_min).toBe(14)
    expect(resolveConflicts(card, conflicts, () => 'theirs').notrump.one_nt.range_min).toBe(16)
    expect(resolveConflicts(card, conflicts, () => 'mine').notrump.one_nt.range_min).toBe(14)
  })

  it('treats a list as one value', () => {
    const mine = copy(base); mine.leads.vs_suits.honors.lead_choice_akx = [1, 2]
    const theirs = copy(base); theirs.leads.vs_suits.honors.lead_choice_akx = 2
    const { conflicts } = mergeCards(base, mine, theirs)
    expect(conflicts).toEqual([{ path: 'leads.vs_suits.honors.lead_choice_akx', base: 1, mine: [1, 2], theirs: 2 }])
    const only = copy(base); only.leads.vs_suits.honors.lead_choice_akx = [1, 2]
    expect(mergeCards(base, only, base).card.leads.vs_suits.honors.lead_choice_akx).toEqual([1, 2])
  })

  it('merges groups both sides added, and keeps a removal the other side did not touch', () => {
    const mine = copy(base); mine.slam = { rkcb: { play: true } }; delete mine.notes
    const theirs = copy(base); theirs.slam = { king_ask: { style: 'next_step' } }
    const { card, conflicts } = mergeCards(base, mine, theirs)
    expect(conflicts).toEqual([])
    expect(card.slam).toEqual({ rkcb: { play: true }, king_ask: { style: 'next_step' } })
    expect(card.notes).toBeUndefined()
  })

  it('reports an edit to a group the other side removed', () => {
    const mine = copy(base); mine.notes.general = 'Edited'
    const theirs = copy(base); delete theirs.notes
    const { card, conflicts } = mergeCards(base, mine, theirs)
    expect(conflicts).toEqual([{ path: 'notes.general', base: 'Old notes', mine: 'Edited', theirs: undefined }])
    expect(resolveConflicts(card, conflicts, () => 'theirs').notes).toEqual({})
  })

  it('changes nothing it is given', () => {
    const mine = copy(base); mine.notrump.one_nt.range_min = 14
    const theirs = copy(base); theirs.notrump.one_nt.range_min = 16
    const before = JSON.stringify([base, mine, theirs])
    const { card, conflicts } = mergeCards(base, mine, theirs)
    resolveConflicts(card, conflicts, () => 'theirs')
    card.notrump.one_nt.range_max = 99
    expect(JSON.stringify([base, mine, theirs])).toBe(before)
  })
})
