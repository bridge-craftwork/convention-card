import { describe, it, expect } from 'vitest'
import { practiceReport, ways } from '../practiceReport.js'

const byId = (r, id) => r.tiles.find(t => t.id === id)
const card = { major_openings: { bergen_raises: { play: true } }, notrump: { stayman: { play: true } } }
const sources = [
  { id: 'bb', name: 'Baker Bridge', skills: { 'bidding_conventions/stayman': [{ name: 'Stayman' }] } },
  { id: 'pbs', name: 'PBS', skills: { 'bidding_conventions/bergen_raises': [{ name: 'Bergen_Raises', href: 'x' }], 'bidding_conventions/stayman': [{ name: 'Stayman' }] } },
]

describe('practiceReport', () => {
  it('lists the deals each collection has for the conventions the card plays', () => {
    const r = practiceReport(card, { sources })
    expect(r.bot).toBeNull()
    expect(byId(r, 'bidding_conventions/bergen_raises')).toMatchObject({ bot: null, practice: { bb: [], pbs: [{ name: 'Bergen_Raises', href: 'x' }] } })
    expect(ways(byId(r, 'bidding_conventions/stayman'))).toBe(2)
    expect(byId(r, 'bidding_conventions/smolen')).toBeUndefined()
  })

  it('adds what the bot plays, and its settings of no one convention', () => {
    const coverage = { read: ['major_openings.bergen_raises.play'], ignored: ['notrump.stayman.play', 'notrump.one_nt.seat_vul'] }
    const r = practiceReport(card, { coverage, sources })
    expect(r.bot).toMatchObject({ read: 1, total: 3 })
    expect(byId(r, 'bidding_conventions/bergen_raises').bot).toBe('plays')
    expect(ways(byId(r, 'bidding_conventions/bergen_raises'))).toBe(2)
    expect(byId(r, 'bidding_conventions/stayman').bot).toBe('gap')
    expect(byId(r, 'section:notrump')).toMatchObject({ convention: false, practice: { bb: [], pbs: [] } })
  })
})
