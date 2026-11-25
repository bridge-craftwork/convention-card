import { describe, it, expect } from 'vitest'
import { outlineLine, outlineLines } from '../notesPage.js'

// Notes written as an outline, as Markdown lists are, print as one on the
// notes page: each two spaces in is a level, and a long line wrapped by hand
// (its next line indented to where its text starts) is one item again.
describe('outlineLine', () => {
  it.each([
    ['- 2NT-3♠/3NT', 0, 'bullet', '2NT-3♠/3NT'],
    ['  - 3♠ puppet to 3NT', 1, 'bullet', '3♠ puppet to 3NT'],
    ['      - PASS, to play', 3, 'bullet', 'PASS, to play'],
    ['\t* tab is two spaces', 1, 'bullet', 'tab is two spaces'],
    ['• Red Heart', 0, 'bullet', 'Red Heart'],
    ['  1. first', 1, '1.', 'first'],
    ['b) second', 0, 'b)', 'second'],
    ['Plain text', 0, null, 'Plain text'],
    ['-1 is not a bullet', 0, null, '-1 is not a bullet'],
  ])('%j', (line, level, marker, para) => {
    expect(outlineLine(line)).toEqual({ level, marker, para })
  })
})

describe('outlineLines', () => {
  it('joins a line wrapped by hand to the item it continues', () => {
    const text = [
      '- 1M opening. Responder with 3-card support and 8-10 HCP bids 2M. With',
      '  6-7 HCP, bids 1NT first, and 2M next. Constructive raise only by',
      '  non-passed hand.',
      '- Ogust ON after double',
    ].join('\n')
    expect(outlineLines(text).map(l => l.para)).toEqual([
      '1M opening. Responder with 3-card support and 8-10 HCP bids 2M. With 6-7 HCP, bids 1NT first, and 2M next. Constructive raise only by non-passed hand.',
      'Ogust ON after double',
    ])
  })

  it('keeps the break under a short line: the writer made it', () => {
    expect(outlineLines('- 1♦-1♥\n  2♥-?\n  Hearts raised').map(l => l.para)).toEqual(['1♦-1♥', '2♥-?', 'Hearts raised'])
  })
})
