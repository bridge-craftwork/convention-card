import { describe, it, expect } from 'vitest'
import { botReport } from '../botReport.js'

const byId = (r, id) => r.tiles.find(t => t.id === id)

describe('botReport', () => {
  const coverage = {
    read: ['major_openings.bergen_raises.play', 'notrump.transfers.jacoby'],
    ignored: ['notrump.transfers.texas_4d', 'minor_openings.one_club.single_raise.inv', 'notrump.one_nt.seat_vul'],
    other: ['carding.smith_echo_suits'],
  }
  const report = botReport({}, coverage)

  it('counts what the bot reads', () => {
    expect(report).toMatchObject({ read: 2, total: 5, score: 0.4, other: 1 })
  })

  it('makes one tile per convention, by what the bot reads of it', () => {
    expect(byId(report, 'bidding_conventions/bergen_raises')).toMatchObject({ status: 'plays', name: 'Bergen raises', convention: true })
    expect(byId(report, 'bidding_conventions/jacoby_transfers').status).toBe('partial')
    expect(byId(report, 'bidding_conventions/jacoby_transfers').fields.map(f => f.read)).toEqual([true, false])
  })

  it('puts settings of no convention under their section, after the conventions', () => {
    const last = report.tiles.at(-1)
    expect(last).toMatchObject({ id: 'section:notrump', convention: false, status: 'gap', band: 'other' })
  })

  it('shows a convention named only in other agreements', () => {
    const r = botReport({ other_agreements: [{ id: 'bidding_conventions/kokish', text: 'Kokish' }] }, { read: [], ignored: [] })
    expect(byId(r, 'bidding_conventions/kokish')).toMatchObject({ status: 'listed', fields: [] })
  })
})
