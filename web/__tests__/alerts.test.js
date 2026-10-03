import { describe, it, expect } from 'vitest'
import ALERTS from '../../spec/alerts.json' with { type: 'json' }
import { alertsFor, alertBadge, alertSummary, REGULATORS, field } from '../../js/spec.js'
import { CONVENTION_CATALOG } from '../src/editor/conventionCatalog.js'

const row = id => CONVENTION_CATALOG.find(e => e.id === id)
const RULES = ['alert', 'announce', 'delayed', 'none']

describe('spec/alerts.toml', () => {
  it('covers the ACBL, the EBU and the WBF, each with its source', () => {
    expect(Object.keys(REGULATORS).sort()).toEqual(['acbl', 'ebu', 'wbf'])
    for (const r of Object.values(REGULATORS)) expect(r.source?.url).toMatch(/^https:\/\//)
  })

  it('names real fields and allowed rules, with a regulator only where it differs', () => {
    for (const a of ALERTS.alert) {
      for (const p of a.fields) expect([p, !!field(p)]).toEqual([p, true])
      expect(RULES).toContain(a.rule)
      for (const r of Object.keys(REGULATORS)) {
        if (a[r] !== undefined) {
          expect(RULES).toContain(a[r])
          expect(a[r]).not.toBe(a.rule)
        }
      }
    }
  })

  it('has alerting for every row of the editor', () => {
    const missing = CONVENTION_CATALOG.filter(e => !alertsFor(e.cardPath, 'acbl').length).map(e => e.id)
    expect(missing).toEqual([])
  })

  // Confirmed by Rick (2026-10-03): in the ACBL, Stayman and weak twos are
  // neither alerted nor announced, and Garbage Stayman has nothing to alert.
  it('matches what we know of the ACBL', () => {
    const acbl = id => alertsFor(row(id).cardPath, 'acbl')
    expect(acbl('stayman').find(c => c.call === '2♣').rule).toBe('none')
    expect(acbl('weak_2s').filter(c => c.by === 'opener').every(c => c.rule === 'none')).toBe(true)
    expect(alertBadge(row('garbage_stayman').cardPath, 'acbl')).toBe('none')
    expect(alertBadge(row('jacoby_transfers').cardPath, 'acbl')).toBe('announce')
  })

  it("shows a convention's own call apart from the calls that follow it", () => {
    // Michaels' cuebid is exempt in the ACBL; the 2NT asking for the minor is not.
    expect(alertSummary(row('michaels').cardPath, 'acbl')).toEqual({ main: 'none', more: 'alert' })
    // RKCB's 4NT is not alerted in the ACBL; its replies get a delayed alert.
    expect(alertSummary(row('rkcb_1430').cardPath, 'acbl')).toEqual({ main: 'none', more: 'delayed' })
    expect(alertSummary(row('stayman').cardPath, 'acbl')).toEqual({ main: 'none', more: null })
  })

  it('resolves a regulator that differs', () => {
    const stayman = id => alertsFor(row('stayman').cardPath, id).find(c => c.call === '2♣').rule
    expect(stayman('ebu')).toBe('announce')
    expect(stayman('wbf')).toBe('alert')
  })
})
