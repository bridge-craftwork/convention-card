import { describe, it, expect } from 'vitest'
import { ledCards, ledValue, sameLead } from '../leads.js'
import { checkCard } from '../checkCard.js'

describe('lead choices', () => {
  it('reads one card or several', () => {
    expect(ledCards(2)).toEqual([2])
    expect(ledCards([2, 1, 2])).toEqual([1, 2])
    expect(ledCards(null)).toEqual([])
    expect(ledValue([2])).toBe(2)
    expect(ledValue([2, 1])).toEqual([1, 2])
    expect(ledValue([])).toBeNull()
    expect(sameLead(2, [2])).toBe(true)
    expect(sameLead([1, 2], [2, 1])).toBe(true)
    expect(sameLead(1, [1, 2])).toBe(false)
  })

  it('checks a list against the holding, and only where the spec allows one', () => {
    const { report } = checkCard({
      leads: { vs_suits: { honors: { lead_choice_akx: [1, 2], lead_choice_kqx: [1, 4] } } },
      notrump: { one_nt: { range_min: [15, 16] } },
    })
    expect(report.invalid.map(i => i.path ?? i[0]).sort()).toEqual(['leads.vs_suits.honors.lead_choice_kqx', 'notrump.one_nt.range_min'])
  })
})
