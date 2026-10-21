import { describe, it, expect } from 'vitest'
import {
  findConventions, suggestConventions, acceptSuggestion, dismissSuggestion, askAgain, playsConvention, DISMISSED_PATH,
} from '../recogniseConventions.js'
import { readPath, writePath } from '../paths.js'
import { CONVENTIONS } from '../spec.js'

function card(settings, extra = {}) {
  const data = { ...extra }
  for (const [p, v] of Object.entries(settings)) writePath(data, p, v)
  return data
}
const ids = list => list.map(s => s.id)

describe('findConventions', () => {
  it('finds names as written, in order, ignoring case', () => {
    const found = findConventions('Spiral, kokish relay; Exclusion Blackwood')
    expect(found.map(f => [f.id, f.written])).toEqual([
      ['bidding_conventions/spiral', 'Spiral'],
      ['bidding_conventions/kokish', 'kokish relay'],
      ['bidding_conventions/exclusion_blackwood', 'Exclusion Blackwood'],
    ])
  })

  it('prefers the longest name and never overlaps', () => {
    const found = findConventions('Exclusion Blackwood')
    expect(found).toHaveLength(1)
    expect(found[0].id).toBe('bidding_conventions/exclusion_blackwood')
  })

  it('matches whole words only', () => {
    expect(findConventions('Spiralling costs')).toEqual([])
    expect(findConventions('')).toEqual([])
    expect(findConventions(null)).toEqual([])
  })

  it('knows every convention by its own name', () => {
    for (const [id, c] of Object.entries(CONVENTIONS)) {
      if (!c.name || c.name.length < 3) continue
      expect(findConventions(c.name).map(f => f.id), id).toContain(id)
    }
  })
})

describe('suggestConventions', () => {
  const notes = text => card({ 'slam.notes': text })

  it('suggests a convention a note names, with the field it would set', () => {
    const { suggestions } = suggestConventions(notes('Minorwood (1430), Exclusion'))
    const minorwood = suggestions.find(s => s.id === 'bidding_conventions/minorwood')
    expect(minorwood.set).toEqual({ field: 'slam.minorwood.play' })
    expect(minorwood.found[0]).toMatchObject({ path: 'slam.notes', written: 'Minorwood' })
    expect(minorwood.found[0].excerpt).toContain('Minorwood (1430)')
  })

  it('leaves out what the card already plays', () => {
    const data = card({ 'slam.notes': 'Minorwood', 'slam.minorwood.play': true })
    expect(ids(suggestConventions(data).suggestions)).not.toContain('bidding_conventions/minorwood')
  })

  it('counts a choice field holding the convention as played', () => {
    const data = card({ 'competitive.notes': 'Suction', 'competitive.vs_1nt_strong.system': 'suction' })
    expect(playsConvention(data, 'competitive_bidding/suction')).toBe(true)
    expect(ids(suggestConventions(data).suggestions)).not.toContain('competitive_bidding/suction')
  })

  it('lists a convention once, with every place it is named', () => {
    const data = card({ 'slam.notes': 'Minorwood', 'notes.slam_notes': 'Minorwood again' })
    const found = suggestConventions(data).suggestions.filter(s => s.id === 'bidding_conventions/minorwood')
    expect(found).toHaveLength(1)
    expect(found[0].found.map(f => f.path).sort()).toEqual(['notes.slam_notes', 'slam.notes'])
  })
})

describe('accepting, dismissing, asking again', () => {
  it('accepting sets the field and keeps the text', () => {
    const data = card({ 'slam.notes': 'Minorwood' })
    const [s] = suggestConventions(data).suggestions
    acceptSuggestion(data, s)
    expect(readPath(data, 'slam.minorwood.play')).toBe(true)
    expect(readPath(data, 'slam.notes')).toBe('Minorwood')
    expect(suggestConventions(data).suggestions).toEqual([])
  })

  it('accepting a convention with no yes/no field adds an other_agreements entry', () => {
    const data = card({ 'competitive.notes': 'Suction over strong 1♣' })
    const s = suggestConventions(data).suggestions.find(x => x.id === 'competitive_bidding/suction')
    expect(s.set).toEqual({ other_agreements: true })
    acceptSuggestion(data, s)
    expect(data.other_agreements).toEqual([
      { id: 'competitive_bidding/suction', text: 'Suction', section: 'competitive', from: 'competitive.notes' },
    ])
    expect(playsConvention(data, 'competitive_bidding/suction')).toBe(true)
  })

  it('a dismissed suggestion is not offered again until asked', () => {
    const data = card({ 'slam.notes': 'Minorwood' })
    dismissSuggestion(data, 'bidding_conventions/minorwood')
    expect(readPath(data, DISMISSED_PATH)).toEqual(['bidding_conventions/minorwood'])
    let r = suggestConventions(data)
    expect(r.suggestions).toEqual([])
    expect(ids(r.dismissed)).toEqual(['bidding_conventions/minorwood'])

    askAgain(data)
    r = suggestConventions(data)
    expect(ids(r.suggestions)).toEqual(['bidding_conventions/minorwood'])
    expect(r.dismissed).toEqual([])
    expect(data.metadata.dismissed_conventions).toBeUndefined()
  })

  it('accepting a dismissed suggestion takes it off the dismissed list', () => {
    const data = card({ 'slam.notes': 'Minorwood' })
    dismissSuggestion(data, 'bidding_conventions/minorwood')
    acceptSuggestion(data, suggestConventions(data).dismissed[0])
    expect(readPath(data, DISMISSED_PATH)).toBeUndefined()
  })
})
