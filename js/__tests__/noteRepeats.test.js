import { describe, it, expect } from 'vitest'
import { repeatedNoteLines, removeRepeatedNotes } from '../noteRepeats.js'
import { notesPageContent } from '../notesPage.js'

// As older Bridgodex imports wrote it (Rick's card, #132): each box in its
// field, and again as a line of the section's notes.
const card = () => ({
  notrump: { notes: '2-under Texas', two_nt: { notes: '2-under Texas' } },
  minor_openings: { notes: 'XYZ' },
  two_level: { two_diamonds: { description: '3-suited' } },
  notes: {
    notrump_notes: '2-under Texas\n2♣: Baze\n2NT: 2-under Texas',
    minor_notes: '1♣: XYZ',
    two_level_notes: '2♦ description: 3-suited',
    general: 'XYZ',
  },
})

describe('repeatedNoteLines', () => {
  it('finds the lines that are a field\'s text, with or without a label', () => {
    expect(repeatedNoteLines(card())).toEqual([
      { path: 'notes.notrump_notes', line: '2-under Texas' },
      { path: 'notes.notrump_notes', line: '2NT: 2-under Texas' },
      { path: 'notes.minor_notes', line: '1♣: XYZ' },
      { path: 'notes.two_level_notes', line: '2♦ description: 3-suited' },
    ])
  })

  it('leaves the general notes alone: they are the partnership\'s own words', () => {
    expect(repeatedNoteLines(card()).map(r => r.path)).not.toContain('notes.general')
  })

  it('keeps a line the card has no field for', () => {
    expect(repeatedNoteLines(card()).map(r => r.line)).not.toContain('2♣: Baze')
  })

  it('finds nothing on a card whose notes are its own', () => {
    expect(repeatedNoteLines({ notrump: { notes: 'Smolen' }, notes: { notrump_notes: 'Puppet over 2NT' } })).toEqual([])
  })
})

describe('removeRepeatedNotes', () => {
  it('removes the repeats, keeps the rest, and drops a notes field left empty', () => {
    const c = card()
    const n = removeRepeatedNotes(c)
    expect(n).toBe(4)
    expect(c.notes.general).toBe('XYZ')
    expect(c.notes.notrump_notes).toBe('2♣: Baze')
    expect(c.notes.minor_notes).toBeUndefined()
    expect(c.notes.two_level_notes).toBeUndefined()
    // The fields themselves are untouched
    expect(c.notrump.two_nt.notes).toBe('2-under Texas')
    expect(repeatedNoteLines(c)).toEqual([])
  })
})

describe('the notes page', () => {
  it('leaves the repeated lines out', () => {
    const items = notesPageContent({ name: 'Test', card_data: card() }).blocks.flatMap(b => b.items.map(i => i.text))
    expect(items).toContain('2♣: Baze')
    expect(items.join('\n')).not.toMatch(/2-under Texas|3-suited|1♣: XYZ/)
  })
})
