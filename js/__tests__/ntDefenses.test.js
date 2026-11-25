import { describe, it, expect } from 'vitest'
import { ntHeadingText, ntSystemName } from '../ntDefenses.js'

// The heading of a column of the defense to 1NT, as the ACBL PDFs print it.
// A defense with no name (`other`) once printed as "other", which is what a
// PDF read back showed in place of the "strong" and "weak" typed there.
describe('ntHeadingText', () => {
  it.each([
    ['strong', 'other', null, 'Strong 1NT'],
    ['weak', 'other', null, 'Weak 1NT'],
    ['strong', 'other', 15, 'Strong 15+'],
    ['weak', 'natural', null, 'Weak 1NT: Natural'],
    ['weak', 'multi_landy', 15, 'Weak No 15: Multi-Landy'],
    ['strong', 'meckwell', null, 'Meckwell'],
    ['strong', 'dont', null, 'DONT'],
    ['strong', 'modified_cappelletti', null, 'Modified Cappelletti'],
    ['strong', 'Meckwell modified', null, 'Meckwell modified'],
    ['strong', null, null, null],
  ])('%s column, %s, from %s: %s', (side, system, includes, heading) => {
    expect(ntHeadingText(side, system, includes)).toBe(heading)
  })
})

describe('ntSystemName', () => {
  it('names a spec option, leaves typed text, and has no name for other', () => {
    expect(ntSystemName('multi_landy')).toBe('Multi-Landy')
    expect(ntSystemName('cappelletti')).toBe('Cappelletti')
    expect(ntSystemName('2-suited Landy')).toBe('2-suited Landy')
    expect(ntSystemName('other')).toBe(null)
    expect(ntSystemName('')).toBe(null)
  })
})
